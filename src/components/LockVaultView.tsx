import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Lock,
  ShieldAlert,
  KeyRound,
  RotateCcw,
  AlertTriangle,
  Fingerprint,
  CheckCircle2,
  X,
  Mail,
  Send,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { deriveKeyFromPin, verifyKey, hexToBuf } from '../crypto/vaultCrypto';
import {
  isBiometricsEnrolled,
  isBiometricsAutoPromptEnabled,
  hasBiometricCredentials,
  enrollBiometrics,
  authenticateWithBiometrics,
} from '../services/biometricService';
import {
  isRecoveryKeyConfigured,
  verifyRecoveryKey,
  executePinResetWithRecoveryKey,
  formatRecoveryKeyDisplay,
  normalizeRecoveryKey,
} from '../services/recoveryKeyService';
import { App as CapacitorApp } from '@capacitor/app';
import { PinKeypad } from './PinKeypad';

interface LockVaultViewProps {
  onUnlock: (masterKey: CryptoKey, pin?: string) => void;
  onResetVaultRequest: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const LockVaultView: React.FC<LockVaultViewProps> = ({
  onUnlock,
  onResetVaultRequest,
  showToast,
}) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Recovery via Master Key states
  const [forgotStep, setForgotStep] = useState<'key_input' | 'new_pin_input' | 'no_key'>('key_input');
  const [forgotKey, setForgotKey] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [showNewPinText, setShowNewPinText] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  // Open Forgot PIN flow
  const handleOpenForgotPin = () => {
    setForgotError(null);
    setForgotKey('');
    setNewPinInput('');
    setConfirmNewPinInput('');
    if (isRecoveryKeyConfigured()) {
      setForgotStep('key_input');
    } else {
      setForgotStep('no_key');
    }
    setShowForgotModal(true);
  };

  // Step 1: Verify the 16-character recovery key
  const handleVerifyRecoveryKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = normalizeRecoveryKey(forgotKey);
    if (clean.length !== 16) {
      setForgotError('La clave de recuperación debe tener 16 caracteres (4 bloques de 4).');
      return;
    }

    setIsForgotLoading(true);
    setForgotError(null);

    try {
      const verification = await verifyRecoveryKey(clean);
      if (verification.valid) {
        setForgotError(null);
        setForgotStep('new_pin_input');
      } else {
        setForgotError(verification.error || 'Clave de recuperación incorrecta.');
      }
    } catch (err: any) {
      setForgotError(err?.message || 'Error al validar la clave.');
    } finally {
      setIsForgotLoading(false);
    }
  };

  // Step 2: Change PIN and restore vault access without losing photos
  const handleResetPinWithRecovery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (newPinInput.length < 4) {
      setForgotError('El nuevo PIN debe tener al menos 4 dígitos.');
      return;
    }
    if (newPinInput !== confirmNewPinInput) {
      setForgotError('Los nuevos PINs no coinciden.');
      return;
    }

    setIsForgotLoading(true);
    setForgotError(null);

    try {
      const cleanKey = normalizeRecoveryKey(forgotKey);
      const result = await executePinResetWithRecoveryKey(cleanKey, newPinInput);
      if (result.success && result.masterKey) {
        showToast('¡PIN restablecido con éxito! Bienvenido a tu bóveda.', 'success');
        setShowForgotModal(false);
        onUnlock(result.masterKey, newPinInput);
      } else {
        setForgotError(result.error || 'Error al restablecer el PIN.');
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      setForgotError(err?.message || 'Error al restablecer el PIN.');
    } finally {
      setIsForgotLoading(false);
    }
  };

  // Biometric fingerprint states
  const [isBioEnrolled, setIsBioEnrolled] = useState(() => hasBiometricCredentials());
  const [isBioLoading, setIsBioLoading] = useState(false);
  const [showEnrollBioModal, setShowEnrollBioModal] = useState(false);
  const [enrollPin, setEnrollPin] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [isEnrollingBio, setIsEnrollingBio] = useState(false);

  const expectedLength = parseInt(localStorage.getItem('vault_pin_length') || '4', 10);
  const isUnlockingRef = useRef<boolean>(false);
  const isAuthenticatingBiometricsRef = useRef<boolean>(false);
  const hasAutoTriggeredBioRef = useRef<boolean>(false);
  const attemptUnlockRef = useRef<(pin: string, method?: 'pin' | 'biometric') => Promise<void>>(async () => {});

  // Helper de tiempos de bloqueo progresivo:
  // 3er fallo consecutivo: 15 segundos
  // 4to fallo consecutivo: 20 segundos
  // 5to o más fallos: 30 segundos
  const getLockoutDurationSeconds = (streak: number): number => {
    if (streak === 3) return 15;
    if (streak === 4) return 20;
    if (streak >= 5) return 30;
    return 0;
  };

  // Formato MM:SS para cuenta regresiva
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Estado de bloqueo temporal con persistencia
  const [remainingLockout, setRemainingLockout] = useState<number>(() => {
    try {
      const until = Number(localStorage.getItem('nullvault_lockout_until') || '0');
      const diff = Math.ceil((until - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  });

  // Temporizador de cuenta regresiva en vivo
  useEffect(() => {
    if (remainingLockout <= 0) return;

    const timer = setInterval(() => {
      const until = Number(localStorage.getItem('nullvault_lockout_until') || '0');
      const diff = Math.ceil((until - Date.now()) / 1000);
      if (diff <= 0) {
        setRemainingLockout(0);
        localStorage.removeItem('nullvault_lockout_until');
        setErrorMessage(null);
      } else {
        setRemainingLockout(diff);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingLockout]);

  /* ==================== BLOQUE DE HISTORIAL (REGISTRO) ==================== */
  const recordAccessLog = (
    type: 'success' | 'failed',
    method: 'pin' | 'biometric' = 'pin',
    isLockout: boolean = false,
    attemptNumber?: number,
    lockoutDuration?: number
  ) => {
    try {
      const logs = JSON.parse(localStorage.getItem('nullvault_access_logs') || '[]');
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (type === 'success') {
        const prevFailedSince = Number(localStorage.getItem('nullvault_failed_since_last_success') || '0');
        const prevStreak = Number(localStorage.getItem('nullvault_failed_streak') || '0');
        const totalFailedBefore = prevFailedSince > 0 ? prevFailedSince : prevStreak;

        // Guardar cuántos fallos ocurrieron antes de este acceso exitoso para el banner (Requisito 7)
        localStorage.setItem('nullvault_failed_before_last_success', totalFailedBefore.toString());
        // Reiniciar contadores de fallos consecutivos a 0 (Requisito 1)
        localStorage.setItem('nullvault_failed_streak', '0');
        localStorage.setItem('nullvault_failed_since_last_success', '0');
        localStorage.removeItem('nullvault_lockout_until');

        logs.unshift({
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          type: 'success',
          method,
          isLockout: false,
          title: method === 'biometric' ? 'Acceso biométrico correcto' : 'Acceso correcto',
          time: timeStr,
          timestamp: Date.now(),
        });
        // Límite estricto de 100 registros eliminando los más antiguos
        localStorage.setItem('nullvault_access_logs', JSON.stringify(logs.slice(0, 100)));
        localStorage.setItem('nullvault_last_access', timeStr);
      } else {
        if (!isLockout) {
          const streak = Number(localStorage.getItem('nullvault_failed_streak') || '0') + 1;
          localStorage.setItem('nullvault_failed_streak', streak.toString());
          localStorage.setItem('nullvault_last_failed_time', timeStr);

          const failedSince = Number(localStorage.getItem('nullvault_failed_since_last_success') || '0') + 1;
          localStorage.setItem('nullvault_failed_since_last_success', failedSince.toString());

          logs.unshift({
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            type: 'failed',
            method,
            isLockout: false,
            attemptNumber: attemptNumber ?? streak,
            title: method === 'biometric' ? 'Huella no reconocida' : 'PIN incorrecto',
            time: timeStr,
            timestamp: Date.now(),
          });
        } else {
          // Registro extra de tipo "bloqueado" (Requisito 4)
          // Nota: No incrementa los contadores de intentos fallidos, ya que es el registro del estado de bloqueo
          logs.unshift({
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}_lock`,
            type: 'failed',
            method,
            isLockout: true,
            lockoutDuration: lockoutDuration ?? 30,
            title: 'Bóveda bloqueada por intentos',
            time: timeStr,
            timestamp: Date.now() + 1,
          });
        }

        // Límite estricto de 100 registros eliminando los más antiguos
        localStorage.setItem('nullvault_access_logs', JSON.stringify(logs.slice(0, 100)));
      }
    } catch (e) {
      console.error(e);
    }
  };
  /* ==================== FIN BLOQUE DE HISTORIAL (REGISTRO) ==================== */

  const attemptUnlock = useCallback(
    async (pinToVerify: string, method: 'pin' | 'biometric' = 'pin') => {
      // Bloquear si la cuenta regresiva está activa
      if (remainingLockout > 0) return;
      if (isUnlockingRef.current) return;
      isUnlockingRef.current = true;

      const saltHex = localStorage.getItem('vault_salt');
      const testIvHex = localStorage.getItem('vault_test_iv');
      const testCipherHex = localStorage.getItem('vault_test_cipher');

      if (!saltHex || !testIvHex || !testCipherHex) {
        setErrorMessage('La bóveda no está inicializada correctamente.');
        isUnlockingRef.current = false;
        return;
      }

      setIsVerifying(true);
      setErrorMessage(null);

      try {
        // Verificar si se introdujo el PIN de Coacción
        const isDuressActive = localStorage.getItem('vault_duress_pin_active') === 'true';
        const duressPin = localStorage.getItem('vault_duress_pin');

        if (isDuressActive && duressPin && pinToVerify === duressPin) {
          // Generar clave señuelo para modo coacción
          const decoySalt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
          const decoyKey = await deriveKeyFromPin(pinToVerify, decoySalt);
          sessionStorage.setItem('vault_is_duress_mode', 'true');
          recordAccessLog('success', 'pin', false);
          localStorage.removeItem('nullvault_lockout_until');
          setRemainingLockout(0);
          onUnlock(decoyKey, pinToVerify);
          return;
        }

        const salt = hexToBuf(saltHex);
        const derivedKey = await deriveKeyFromPin(pinToVerify, salt);
        const isValid = await verifyKey(derivedKey, testIvHex, testCipherHex);

        if (isValid) {
          recordAccessLog('success', method, false);
          localStorage.removeItem('nullvault_lockout_until');
          setRemainingLockout(0);
          onUnlock(derivedKey, pinToVerify);
        } else {
          const currentStreak = Number(localStorage.getItem('nullvault_failed_streak') || '0');
          const nextStreak = currentStreak + 1;
          const lockoutDuration = getLockoutDurationSeconds(nextStreak);
          const shouldLockout = lockoutDuration > 0;

          // 1. Guardar intento fallido
          recordAccessLog('failed', method, false, nextStreak);

          if (shouldLockout) {
            // 2. Guardar hora de finalización en almacenamiento persistente
            const lockoutUntil = Date.now() + lockoutDuration * 1000;
            localStorage.setItem('nullvault_lockout_until', lockoutUntil.toString());
            setRemainingLockout(lockoutDuration);

            // 3. Registro extra de tipo "bloqueado" (Requisito 4)
            recordAccessLog('failed', method, true, undefined, lockoutDuration);
          }

          setIsShaking(true);
          setErrorMessage(
            shouldLockout
              ? `Demasiados intentos. Intenta de nuevo en ${formatCountdown(lockoutDuration)}`
              : 'PIN incorrecto. Inténtalo de nuevo.'
          );
          setPin('');
          setTimeout(() => setIsShaking(false), 500);
        }
      } catch (err) {
        console.error('Error unlocking vault:', err);
        const currentStreak = Number(localStorage.getItem('nullvault_failed_streak') || '0');
        const nextStreak = currentStreak + 1;
        const lockoutDuration = getLockoutDurationSeconds(nextStreak);
        const shouldLockout = lockoutDuration > 0;

        recordAccessLog('failed', method, false, nextStreak);

        if (shouldLockout) {
          const lockoutUntil = Date.now() + lockoutDuration * 1000;
          localStorage.setItem('nullvault_lockout_until', lockoutUntil.toString());
          setRemainingLockout(lockoutDuration);
          recordAccessLog('failed', method, true, undefined, lockoutDuration);
        }

        setIsShaking(true);
        setErrorMessage(
          shouldLockout
            ? `Demasiados intentos. Intenta de nuevo en ${formatCountdown(lockoutDuration)}`
            : 'Error al descifrar la bóveda.'
        );
        setPin('');
        setTimeout(() => setIsShaking(false), 500);
      } finally {
        setIsVerifying(false);
        setTimeout(() => {
          isUnlockingRef.current = false;
        }, 500);
      }
    },
    [onUnlock, remainingLockout]
  );

  // Keyboard listener for desktop users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showForgotModal || remainingLockout > 0) return;

      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < expectedLength) {
          const next = pin + e.key;
          setPin(next);
          if (next.length === expectedLength) {
            attemptUnlock(next);
          }
        }
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
        setErrorMessage(null);
      } else if (e.key === 'Escape') {
        setPin('');
        setErrorMessage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, expectedLength, attemptUnlock, showForgotModal]);

  const handleKeypadChange = (newPin: string) => {
    if (isVerifying || isUnlockingRef.current || remainingLockout > 0) return;
    setPin(newPin);
    setErrorMessage(null);
    if (newPin.length === expectedLength) {
      attemptUnlock(newPin);
    }
  };

  attemptUnlockRef.current = attemptUnlock;

  const handleBiometricClick = useCallback(async () => {
    if (isVerifying || isBioLoading || isUnlockingRef.current || remainingLockout > 0) return;
    const enrolled = hasBiometricCredentials();
    if (enrolled) {
      isAuthenticatingBiometricsRef.current = true;
      setIsBioLoading(true);
      setErrorMessage(null);
      try {
        const decryptedPin = await authenticateWithBiometrics(true);
        await attemptUnlockRef.current(decryptedPin, 'biometric');
      } catch (err: any) {
        console.warn('Biometric unlock canceled or failed:', err);
        setIsBioEnrolled(hasBiometricCredentials());
        if (err?.name !== 'NotAllowedError' && !err?.message?.includes('cancelada')) {
          setErrorMessage(err?.message || 'Error en sensor de huella. Usa tu PIN.');
        }
      } finally {
        setIsBioLoading(false);
        setTimeout(() => {
          isAuthenticatingBiometricsRef.current = false;
        }, 300);
      }
    } else {
      if (pin.length >= 4) {
        setEnrollPin(pin);
      } else {
        setEnrollPin('');
      }
      setEnrollError(null);
      setShowEnrollBioModal(true);
    }
  }, [pin, isVerifying, isBioLoading, remainingLockout]);

  // Sensor de huella automático y reconexión al volver a la app o maximizar
  useEffect(() => {
    let isMounted = true;
    let bioDebounceTimeout: any = null;
    let lastAutoTriggerTime = 0;

    const triggerAutoBiometrics = async (forceFresh = false) => {
      const lockoutUntil = Number(localStorage.getItem('nullvault_lockout_until') || '0');
      if (lockoutUntil > Date.now()) return;
      if (!isBiometricsAutoPromptEnabled()) return;
      if (document.visibilityState !== 'visible') return;
      if (isUnlockingRef.current || isAuthenticatingBiometricsRef.current) return;

      const now = Date.now();
      if (now - lastAutoTriggerTime < 800) return; // evitar llamadas duplicadas rápidas
      lastAutoTriggerTime = now;

      isAuthenticatingBiometricsRef.current = true;

      try {
        if (isMounted) setIsBioLoading(true);
        const decryptedPin = await authenticateWithBiometrics(forceFresh);
        if (isMounted && decryptedPin) {
          await attemptUnlockRef.current(decryptedPin, 'biometric');
        }
      } catch (err: any) {
        console.debug('Auto-biometric prompt dismissed/cancelled by user:', err);
      } finally {
        if (isMounted) {
          setIsBioLoading(false);
        }
        setTimeout(() => {
          isAuthenticatingBiometricsRef.current = false;
        }, 300);
      }
    };

    // Disparar en el montaje inicial si la ventana ya está visible
    if (document.visibilityState === 'visible') {
      bioDebounceTimeout = setTimeout(() => {
        triggerAutoBiometrics(true);
      }, 300);
    }

    const handleResumeOrVisible = () => {
      if (document.visibilityState === 'visible') {
        setPin('');
        setErrorMessage(null);
        clearTimeout(bioDebounceTimeout);
        bioDebounceTimeout = setTimeout(() => {
          triggerAutoBiometrics(true);
        }, 200);
      }
    };

    const handleFocus = () => {
      handleResumeOrVisible();
    };

    // Escuchar visibilidad, foco y reactivación tras minimizar/maximizar
    document.addEventListener('visibilitychange', handleResumeOrVisible);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('vault_app_resumed', handleResumeOrVisible);

    return () => {
      isMounted = false;
      clearTimeout(bioDebounceTimeout);
      document.removeEventListener('visibilitychange', handleResumeOrVisible);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('vault_app_resumed', handleResumeOrVisible);
    };
  }, []);

  const handleEnrollBiometrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enrollPin.length < 4) {
      setEnrollError('Ingresa tu PIN de al menos 4 dígitos.');
      return;
    }

    setIsEnrollingBio(true);
    setEnrollError(null);

    try {
      const saltHex = localStorage.getItem('vault_salt');
      const testIvHex = localStorage.getItem('vault_test_iv');
      const testCipherHex = localStorage.getItem('vault_test_cipher');

      if (!saltHex || !testIvHex || !testCipherHex) {
        setEnrollError('La bóveda no está inicializada correctamente.');
        return;
      }

      const salt = hexToBuf(saltHex);
      const testKey = await deriveKeyFromPin(enrollPin, salt);
      const isValid = await verifyKey(testKey, testIvHex, testCipherHex);

      if (!isValid) {
        setEnrollError('PIN incorrecto. Ingresa el PIN maestro de tu bóveda.');
        return;
      }

      await enrollBiometrics(enrollPin);
      setIsBioEnrolled(true);
      setShowEnrollBioModal(false);
      showToast('¡Sensor de huella vinculado con éxito!', 'success');
      onUnlock(testKey);
    } catch (err: any) {
      console.error('Error enrolling biometrics:', err);
      if (err?.name === 'NotAllowedError') {
        setEnrollError('Operación cancelada en el lector de huella.');
      } else {
        setEnrollError(err?.message || 'No se pudo vincular la huella digital en este celular.');
      }
    } finally {
      setIsEnrollingBio(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 transition-colors duration-250 select-none"
      style={{
        backgroundColor: 'var(--theme-bg-main, #060b14)',
        color: 'var(--theme-text-main, #f8fafc)',
      }}
    >
      {/* Ambient background blur using theme glow or coral during lockout */}
      <div className="fixed inset-0 pointer-events-none flex justify-center items-center overflow-hidden">
        <div
          className="w-[500px] h-[500px] rounded-full blur-[140px] transition-all duration-500"
          style={{
            backgroundColor: remainingLockout > 0 ? '#F87171' : 'var(--theme-primary, #00e5ff)',
            opacity: remainingLockout > 0 ? 0.14 : 0.2,
          }}
        />
      </div>

      {remainingLockout > 0 ? (
        /* ==================== BLOQUE DE HISTORIAL: PANTALLA COMPLETA DE BLOQUEO ==================== */
        <div className="relative w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center justify-between min-h-[82vh] py-8 px-4 text-center select-none animate-in fade-in duration-300">
          {/* Espaciador superior para centrado */}
          <div className="w-full h-4" />

          {/* Bloque central de contenido */}
          <div className="flex flex-col items-center justify-center my-auto w-full">
            {/* 2. Ícono de candado en recuadro redondeado coral #F87171 con borde rgba(248,113,113,0.55) y fondo rgba(248,113,113,0.08) */}
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-rose-950/20 backdrop-blur-md transition-all"
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.08)',
                border: '1.5px solid rgba(248, 113, 113, 0.55)',
              }}
            >
              <Lock className="w-9 h-9 stroke-[2.2]" style={{ color: '#F87171' }} />
            </div>

            {/* 3. Título "Intentos fallidos" en blanco (o color principal según tema) tamaño grande */}
            <h2
              className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2.5 text-slate-900 dark:text-white"
              style={{ color: 'var(--theme-text-main, #ffffff)' }}
            >
              Intentos fallidos
            </h2>

            {/* 4. Subtítulo en gris claro (#9AA7BD) adaptable */}
            <p
              className="text-xs sm:text-sm font-medium max-w-[280px] leading-relaxed mb-8 text-slate-600 dark:text-[#9AA7BD]"
              style={{ color: 'var(--theme-text-muted, #9AA7BD)' }}
            >
              Por seguridad, tu bóveda se bloqueó temporalmente
            </p>

            {/* 5. Texto pequeño en mayúsculas "INTENTA DE NUEVO EN" */}
            <p className="text-[11px] font-extrabold tracking-[0.22em] uppercase mb-2 text-slate-400 dark:text-slate-500">
              INTENTA DE NUEVO EN
            </p>

            {/* 5. Cuenta regresiva muy grande, fuente monoespaciada, color #F87171 */}
            <div
              className="font-mono text-6xl sm:text-7xl font-black tracking-wider drop-shadow-md py-1 select-none"
              style={{ color: '#F87171' }}
            >
              {formatCountdown(remainingLockout)}
            </div>
          </div>

          {/* 6. Al fondo, texto pequeño y apagado con ícono de escudo: "Tus archivos siguen protegidos" */}
          <div className="w-full pt-8 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-500 opacity-80">
            <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <span>Tus archivos siguen protegidos</span>
          </div>
        </div>
      ) : (
        /* ==================== FIN BLOQUE DE HISTORIAL: PANTALLA COMPLETA DE BLOQUEO ==================== */
        /* ==================== PANTALLA HABITUAL DE DESBLOQUEO CON PIN ==================== */
        <div
          className={`relative w-full max-w-sm rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center border transition-all animate-in fade-in duration-300 ${
            isShaking ? 'animate-shake' : ''
          }`}
          style={{
            backgroundColor: 'var(--theme-bg-card, #0a121d)',
            borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.75))',
          }}
        >
          {/* Lock / Fingerprint Sensor Icon */}
          <button
            type="button"
            onClick={handleBiometricClick}
            disabled={isVerifying}
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 transition-all relative group shadow-xl cursor-pointer active:scale-95 ${
              isBioLoading
                ? 'border-2'
                : isBioEnrolled
                ? 'border'
                : 'border border-slate-700/60'
            }`}
            style={{
              backgroundColor: isBioEnrolled ? 'rgba(var(--theme-primary-rgb, 0, 229, 255), 0.12)' : undefined,
              borderColor: isBioEnrolled ? 'var(--theme-primary, #00e5ff)' : undefined,
              color: isBioEnrolled ? 'var(--theme-primary, #00e5ff)' : undefined,
              boxShadow: isBioEnrolled ? '0 0 20px var(--theme-glow)' : undefined,
            }}
            title={
              isBioEnrolled
                ? 'Toca para activar sensor de huella'
                : 'Toca para vincular sensor de huella'
            }
            aria-label="Sensor de huella digital"
          >
            {isBioLoading ? (
              <div className="relative flex items-center justify-center">
                <span
                  className="absolute w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'var(--theme-primary, #00e5ff)' }}
                />
                <Fingerprint className="w-8 h-8 sm:w-9 sm:h-9 animate-pulse" style={{ color: 'var(--theme-primary, #00e5ff)' }} />
              </div>
            ) : isBioEnrolled ? (
              <Fingerprint className="w-8 h-8 sm:w-9 sm:h-9 group-hover:scale-110 transition-transform" style={{ color: 'var(--theme-primary, #00e5ff)' }} />
            ) : (
              <Fingerprint className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400 group-hover:text-white group-hover:scale-110 transition-transform" />
            )}
          </button>

          <h1 className="text-2xl font-black tracking-tight mb-0.5" style={{ color: 'var(--theme-text-main, #ffffff)' }}>
            Bóveda de <span style={{ color: 'var(--theme-primary, #00e5ff)' }}>Seguridad</span>
          </h1>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-1" style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
            TUS ARCHIVOS, SIEMPRE PROTEGIDOS
          </p>
          <p className="text-xs text-slate-400 mb-6">
            {isBioLoading
              ? 'Esperando sensor de huella en tu celular...'
              : 'Introduce tu PIN o toca el sensor de huella para acceder'}
          </p>

          {/* Tactile Keypad */}
          <PinKeypad
            pin={pin}
            onPinChange={handleKeypadChange}
            maxDigits={expectedLength}
            disabled={isVerifying}
            onBiometricRequest={handleBiometricClick}
            isBiometricsEnrolled={isBioEnrolled}
            isBiometricsLoading={isBioLoading}
          />

          {/* Error Feedback cuando aún no hay bloqueo pero hubo un fallo */}
          {errorMessage && (
            <div className="mt-4 flex flex-col items-center justify-center gap-1.5 text-center animate-in fade-in duration-150">
              <div
                className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-900 dark:text-white"
                style={{ color: 'var(--theme-text-main, #ffffff)' }}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
                <span>{errorMessage}</span>
              </div>
              {errorMessage?.includes('no está inicializada') && (
                <button
                  type="button"
                  onClick={onResetVaultRequest}
                  className="mt-1 text-[11px] font-bold text-[#00e5ff] hover:underline cursor-pointer"
                >
                  Volver a la pantalla de inicio o registro
                </button>
              )}
            </div>
          )}

          {/* Quick Action Footer */}
          <div className="mt-7 pt-4 border-t border-slate-800/80 flex items-center justify-center text-xs text-slate-400">
            <button
              type="button"
              onClick={handleOpenForgotPin}
              className="hover:text-[#00e5ff] transition-colors font-medium cursor-pointer"
            >
              ¿Olvidaste tu PIN?
            </button>
          </div>
        </div>
      )}

      {/* Forgot PIN / Recovery Key Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#131c2e] border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-200 text-center animate-in fade-in zoom-in-95 duration-200">
            {/* STEP 1: RECOVERY KEY INPUT */}
            {forgotStep === 'key_input' && (
              <div>
                <div className="w-14 h-14 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#00e5ff] shadow-lg shadow-cyan-500/10">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1.5">
                  Recuperar con <span className="text-[#00e5ff]">Clave Maestra</span>
                </h3>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  Ingresa la clave de recuperación de 16 caracteres que guardaste al configurar tu bóveda.
                </p>

                <form onSubmit={handleVerifyRecoveryKey} className="space-y-3.5 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Clave de Recuperación (16 dígitos)
                    </label>
                    <input
                      type="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      value={forgotKey}
                      onChange={(e) => {
                        const formatted = formatRecoveryKeyDisplay(e.target.value);
                        setForgotKey(formatted);
                        setForgotError(null);
                      }}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      required
                      autoFocus
                      disabled={isForgotLoading}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-3 text-center text-base sm:text-lg font-mono font-bold tracking-widest text-[#00e5ff] placeholder:text-slate-600 focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] transition-all"
                    />
                  </div>

                  {forgotError && (
                    <div className="flex items-center gap-1.5 text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isForgotLoading || normalizeRecoveryKey(forgotKey).length !== 16}
                    className="w-full py-3 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                      boxShadow: '0 4px 14px -2px var(--theme-glow)',
                    }}
                  >
                    {isForgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span className="text-white">Verificando clave...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span className="text-white">Verificar Clave de Respaldo</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setForgotStep('no_key')}
                      className="text-slate-500 hover:text-amber-400 transition-colors cursor-pointer text-[11px]"
                    >
                      ¿Perdiste tu clave?
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STEP 2: NEW PIN INPUT */}
            {forgotStep === 'new_pin_input' && (
              <div>
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-lg shadow-emerald-500/10">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1.5">
                  Cambiar <span className="text-emerald-400">PIN Maestro</span>
                </h3>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  Clave verificada con éxito. Define tu nuevo PIN para acceder a tu bóveda sin perder ninguna foto:
                </p>

                <form onSubmit={handleResetPinWithRecovery} className="space-y-3 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nuevo PIN (4 dígitos)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showNewPinText ? 'text' : 'password'}
                        inputMode="numeric"
                        value={newPinInput}
                        onChange={(e) => {
                          setNewPinInput(e.target.value.replace(/\D/g, ''));
                          setForgotError(null);
                        }}
                        placeholder="••••"
                        required
                        autoFocus
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono tracking-widest"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPinText(!showNewPinText)}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                      >
                        {showNewPinText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Confirmar Nuevo PIN
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showNewPinText ? 'text' : 'password'}
                        inputMode="numeric"
                        value={confirmNewPinInput}
                        onChange={(e) => {
                          setConfirmNewPinInput(e.target.value.replace(/\D/g, ''));
                          setForgotError(null);
                        }}
                        placeholder="••••"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono tracking-widest"
                      />
                    </div>
                  </div>

                  {forgotError && (
                    <div className="flex items-center gap-1.5 text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isForgotLoading || newPinInput.length < 4 || newPinInput !== confirmNewPinInput}
                    className="w-full py-3 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #059669, #0284c7)',
                      boxShadow: '0 4px 14px -2px rgba(5, 150, 105, 0.3)',
                    }}
                  >
                    {isForgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span className="text-white">Restableciendo PIN y bóveda...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span className="text-white">Guardar Nuevo PIN y Acceder</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* FALLBACK: NO RECOVERY KEY REGISTERED */}
            {forgotStep === 'no_key' && (
              <div>
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-center text-white mb-2">
                  Recuperación de PIN
                </h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed text-center">
                  Si no recuerdas tu PIN ni tienes tu clave de recuperación guardada:
                </p>
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-slate-400 mb-5 space-y-1.5 text-left">
                  <p className="font-semibold text-slate-300">Cifrado de Conocimiento Cero:</p>
                  <p>Por seguridad matemática de cifrado, sin el PIN o la clave de recuperación no es posible descifrar los archivos. Puedes restablecer la bóveda para volver a usarla desde cero.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false);
                      onResetVaultRequest();
                    }}
                    className="vault-reset-pink-btn w-full py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restablecer y borrar bóveda</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRecoveryKeyConfigured()) {
                        setForgotStep('key_input');
                      } else {
                        setShowForgotModal(false);
                      }
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    {isRecoveryKeyConfigured() ? 'Volver a intentar clave' : 'Cancelar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enroll Biometrics Modal */}
      {showEnrollBioModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#131c2e] border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-200">
            <div className="flex justify-between items-center mb-3">
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400">
                <Fingerprint className="w-6 h-6 animate-pulse" />
              </div>
              <button
                type="button"
                onClick={() => setShowEnrollBioModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h3 className="text-lg font-bold text-white mb-1.5">
              Activar Sensor de Huella
            </h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Ingresa tu PIN maestro para vincular el sensor de huella de tu celular a la bóveda. Una vez vinculado, podrás entrar con un solo toque de tu huella digital.
            </p>

            <form onSubmit={handleEnrollBiometrics} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 text-left">
                  PIN Maestro Actual
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={enrollPin}
                  onChange={(e) => {
                    setEnrollPin(e.target.value);
                    setEnrollError(null);
                  }}
                  placeholder="Introduce tu PIN"
                  className="w-full px-4 py-3 bg-slate-900/80 border border-slate-700/80 rounded-xl text-center text-xl tracking-[0.3em] font-mono text-white focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>

              {enrollError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-[11px] text-rose-300 space-y-1 text-left">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{enrollError}</span>
                  </div>
                  <div className="text-[10px] text-rose-400/90 pt-1 border-t border-rose-800/40 space-y-0.5">
                    <p><b>Para solucionar:</b></p>
                    <p>• Si tienes <b>"Modo avión"</b> activado, desactívalo un momento.</p>
                    <p>• Si usas un <b>APK de WebIntoApp</b> (WebView), abre la app en <b>Google Chrome</b> en tu celular e instálala como <b>PWA ("Añadir a pantalla")</b> para acceso 100% nativo al sensor de huella.</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isEnrollingBio || enrollPin.length < 4}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                >
                  <Fingerprint className="w-4 h-4" />
                  <span>{isEnrollingBio ? 'Verificando con tu celular...' : 'Escanear Huella en el Celular'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowEnrollBioModal(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
