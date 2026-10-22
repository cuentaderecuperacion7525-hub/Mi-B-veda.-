import React, { useState, useEffect } from 'react';
import {
  Shield,
  Camera,
  Fingerprint,
  ChevronRight,
  CheckCircle2,
  XCircle,
  X,
  Clock,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
} from 'lucide-react';
import { setScreenshotBlockEnabled } from '../services/screenshotBlockService';
import {
  deriveKeyFromPin,
  verifyKey,
  hexToBuf,
  bufToHex,
  generateSalt,
  createVerificationPayload,
  decryptBuffer,
  encryptBuffer,
  checkIsUnencryptedMedia,
} from '../crypto/vaultCrypto';
import {
  enrollBiometrics,
  disableBiometrics,
  isBiometricsEnrolled,
  hasBiometricCredentials,
  isBiometricsAutoPromptEnabled,
  setBiometricsAutoPromptEnabled,
  authenticateWithBiometrics,
} from '../services/biometricService';
import { flipToLockService } from '../services/flipToLockService';
import { registerBackHandler } from '../services/backButtonService';
import { PinKeypad } from './PinKeypad';
import { NeonSwitch } from './NeonSwitch';
import { getAllEncryptedItems, saveEncryptedItems, EncryptedVaultItem } from '../db/vaultDb';

interface SecurityVaultViewProps {
  onOpenSettings: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
  sessionPin?: string | null;
  onLock?: () => void;
  masterKey?: CryptoKey | null;
  onMasterKeyUpdated?: (newKey: CryptoKey) => void;
  autoLockMinutes?: number;
  onAutoLockChange?: (mins: number) => void;
  lockOnTabSwitch?: boolean;
  onLockOnTabSwitchChange?: (enabled: boolean) => void;
}

interface AccessLogItem {
  id: string;
  type: 'success' | 'failed';
  title: string;
  time: string;
  timestamp: number;
}

export const SecurityVaultView: React.FC<SecurityVaultViewProps> = ({
  showToast,
  sessionPin,
  onLock,
  masterKey,
  onMasterKeyUpdated,
  autoLockMinutes = 5,
  onAutoLockChange,
  lockOnTabSwitch = true,
  onLockOnTabSwitchChange,
}) => {
  // Protection toggles
  const [duressPinActive, setDuressPinActive] = useState<boolean>(() => {
    return localStorage.getItem('vault_duress_pin_active') === 'true' && Boolean(localStorage.getItem('vault_duress_pin'));
  });
  const [screenshotBlockActive, setScreenshotBlockActive] = useState<boolean>(() => {
    return localStorage.getItem('vault_screenshot_block_active') !== 'false';
  });
  const [biometricsActive, setBiometricsActive] = useState<boolean>(() => {
    return isBiometricsAutoPromptEnabled();
  });
  const [isBioPairConfigured, setIsBioPairConfigured] = useState<boolean>(() => {
    return hasBiometricCredentials();
  });

  // Flip to lock state
  const [flipToLockEnabled, setFlipToLockEnabled] = useState<boolean>(() => flipToLockService.isEnabled());

  const handleToggleFlipToLock = (enabled: boolean) => {
    setFlipToLockEnabled(enabled);
    flipToLockService.setEnabled(enabled);
    showToast(
      enabled
        ? 'Bloqueo al voltear boca abajo activado'
        : 'Bloqueo al voltear desactivado',
      'info'
    );
  };

  // Change PIN states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmNewPin, setShowConfirmNewPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError(null);
    setPinChangeSuccess(false);

    if (newPin.length < 4) {
      setPinChangeError('El nuevo PIN debe tener al menos 4 dígitos');
      return;
    }

    if (newPin !== confirmNewPin) {
      setPinChangeError('Los nuevos PINs no coinciden');
      return;
    }

    setIsChangingPin(true);

    try {
      const saltHex = localStorage.getItem('vault_salt');
      const testIvHex = localStorage.getItem('vault_test_iv');
      const testCipherHex = localStorage.getItem('vault_test_cipher');

      if (!saltHex || !testIvHex || !testCipherHex) {
        throw new Error('Datos de verificación de bóveda no encontrados');
      }

      const salt = hexToBuf(saltHex);
      const testKey = await deriveKeyFromPin(currentPin, salt);
      const isValid = await verifyKey(testKey, testIvHex, testCipherHex);

      if (!isValid) {
        setPinChangeError('El PIN actual es incorrecto');
        setIsChangingPin(false);
        return;
      }

      const newSalt = generateSalt();
      const newDerivedKey = await deriveKeyFromPin(newPin, newSalt);
      const newVerification = await createVerificationPayload(newDerivedKey);

      // Re-encrypt all items in IndexedDB from testKey to newDerivedKey
      try {
        const allItems = await getAllEncryptedItems();
        const updatedItems: EncryptedVaultItem[] = [];
        for (const item of allItems) {
          try {
            const isUnencrypted = !item.iv || item.iv.length === 0 || checkIsUnencryptedMedia(item.data);
            const decrypted = isUnencrypted ? item.data : await decryptBuffer(item.data, item.iv, testKey);
            const reEncrypted = await encryptBuffer(decrypted, newDerivedKey);
            updatedItems.push({
              ...item,
              iv: reEncrypted.iv,
              data: reEncrypted.data,
            });
          } catch (itemErr) {
            console.warn(`Could not re-encrypt item ${item.id} during PIN change:`, itemErr);
            updatedItems.push(item);
          }
        }
        if (updatedItems.length > 0) {
          await saveEncryptedItems(updatedItems);
        }
      } catch (reErr) {
        console.warn('Error during batch item re-encryption on PIN change:', reErr);
      }

      localStorage.setItem('vault_salt', bufToHex(newSalt));
      localStorage.setItem('vault_test_iv', newVerification.ivHex);
      localStorage.setItem('vault_test_cipher', newVerification.cipherHex);
      localStorage.setItem('vault_pin_length', newPin.length.toString());

      try {
        sessionStorage.setItem('vault_session_pin', newPin);
      } catch {}

      if (onMasterKeyUpdated) {
        onMasterKeyUpdated(newDerivedKey);
      }

      setPinChangeSuccess(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      showToast('PIN maestro actualizado con éxito', 'success');
    } catch (err: any) {
      console.error('Error changing PIN:', err);
      setPinChangeError(err?.message || 'Error al cambiar PIN');
    } finally {
      setIsChangingPin(false);
    }
  };

  // Modal de confirmación con PIN para desactivar bloqueo de capturas
  const [showDisableScreenshotModal, setShowDisableScreenshotModal] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmPinError, setConfirmPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Duress PIN setup states
  const [showDuressModal, setShowDuressModal] = useState(false);
  const [duressStep, setDuressStep] = useState<'create' | 'confirm'>('create');
  const [duressPinInput, setDuressPinInput] = useState('');
  const [duressPinConfirmInput, setDuressPinConfirmInput] = useState('');
  const [duressPinError, setDuressPinError] = useState<string | null>(null);

  // Biometric activation direct sensor states
  const [isEnrollingBio, setIsEnrollingBio] = useState(false);
  const [showBioPinModal, setShowBioPinModal] = useState(false);
  const [bioPinInput, setBioPinInput] = useState('');
  const [bioPinError, setBioPinError] = useState<string | null>(null);

  const [showAllLogsModal, setShowAllLogsModal] = useState<boolean>(false);

  // Back button registrations for modals in Security Tab
  useEffect(() => {
    if (showDisableScreenshotModal) {
      try { window.history.pushState({ secModal: 'ss' }, ''); } catch {}
      return registerBackHandler('sec_disable_ss_modal', () => {
        setShowDisableScreenshotModal(false);
        setConfirmPin('');
        setConfirmPinError(null);
        return true;
      }, 85);
    }
  }, [showDisableScreenshotModal]);

  useEffect(() => {
    if (showDuressModal) {
      try { window.history.pushState({ secModal: 'duress' }, ''); } catch {}
      return registerBackHandler('sec_duress_modal', () => {
        setShowDuressModal(false);
        setDuressPinInput('');
        setDuressPinConfirmInput('');
        setDuressPinError(null);
        return true;
      }, 85);
    }
  }, [showDuressModal]);

  useEffect(() => {
    if (showBioPinModal) {
      try { window.history.pushState({ secModal: 'bio' }, ''); } catch {}
      return registerBackHandler('sec_bio_pin_modal', () => {
        setShowBioPinModal(false);
        setBioPinInput('');
        setBioPinError(null);
        return true;
      }, 85);
    }
  }, [showBioPinModal]);

  useEffect(() => {
    if (showAllLogsModal) {
      try { window.history.pushState({ secModal: 'logs' }, ''); } catch {}
      return registerBackHandler('sec_all_logs_modal', () => {
        setShowAllLogsModal(false);
        return true;
      }, 85);
    }
  }, [showAllLogsModal]);

  // Load real access logs
  const [logs, setLogs] = useState<AccessLogItem[]>(() => {
    try {
      const stored = localStorage.getItem('nullvault_access_logs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    const lastAcc = localStorage.getItem('nullvault_last_access');
    if (lastAcc) {
      return [
        {
          id: `log_init_${Date.now()}`,
          type: 'success',
          title: 'Acceso correcto',
          time: lastAcc,
          timestamp: Date.now(),
        },
      ];
    }
    return [];
  });

  // Handlers for protection switches
  const handleToggleDuress = () => {
    if (duressPinActive) {
      setDuressPinActive(false);
      localStorage.setItem('vault_duress_pin_active', 'false');
      localStorage.removeItem('vault_duress_pin');
      showToast('PIN de coacción desactivado', 'info');
    } else {
      setDuressStep('create');
      setDuressPinInput('');
      setDuressPinConfirmInput('');
      setDuressPinError(null);
      setShowDuressModal(true);
    }
  };

  const triggerBiometricForScreenshot = async () => {
    if (!hasBiometricCredentials()) return;
    setIsVerifyingPin(true);
    setConfirmPinError(null);
    try {
      const decryptedPin = await authenticateWithBiometrics(true);
      if (decryptedPin) {
        await handleVerifyDisableScreenshotPin(decryptedPin);
      }
    } catch (err: any) {
      console.debug('Sensor de huella cancelado o fallido:', err);
      if (err?.name !== 'NotAllowedError' && !err?.message?.includes('cancelada')) {
        setConfirmPinError(err?.message || 'Sensor de huella no reconocido. Usa tu PIN.');
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleToggleScreenshot = () => {
    if (screenshotBlockActive) {
      setConfirmPin('');
      setConfirmPinError(null);
      setShowDisableScreenshotModal(true);
      if (hasBiometricCredentials()) {
        setTimeout(() => {
          triggerBiometricForScreenshot();
        }, 150);
      }
    } else {
      setScreenshotBlockActive(true);
      localStorage.setItem('vault_screenshot_block_active', 'true');
      setScreenshotBlockEnabled(true);
      window.dispatchEvent(new Event('vault_security_settings_changed'));
      showToast('Bloqueo de capturas activado', 'info');
    }
  };

  const triggerBiometricEnrollment = async (pinToUse: string) => {
    setIsEnrollingBio(true);
    setBioPinError(null);
    try {
      const success = await enrollBiometrics(pinToUse);
      if (success) {
        setBiometricsAutoPromptEnabled(true);
        setBiometricsActive(true);
        setIsBioPairConfigured(true);
        setShowBioPinModal(false);
        setBioPinInput('');
        showToast('Huella digital vinculada y activada', 'success');
      } else {
        setBiometricsAutoPromptEnabled(false);
        setBiometricsActive(false);
        showToast('No se pudo verificar el sensor de huella', 'alert');
      }
    } catch (err: any) {
      setBiometricsAutoPromptEnabled(false);
      setBiometricsActive(false);
      const msg = err?.message || 'Sensor de huella cancelado o no reconocido';
      setBioPinError(msg);
      showToast(msg, 'alert');
    } finally {
      setIsEnrollingBio(false);
    }
  };

  const handleToggleBiometrics = async () => {
    if (biometricsActive) {
      setBiometricsAutoPromptEnabled(false);
      setBiometricsActive(false);
      showToast('Inicio automático desactivado. El sensor sigue listo en el teclado para cuando lo toques.', 'info');
    } else {
      if (hasBiometricCredentials()) {
        setBiometricsAutoPromptEnabled(true);
        setBiometricsActive(true);
        showToast('Huella activada para inicio automático', 'success');
      } else {
        const activePin = sessionPin || sessionStorage.getItem('vault_session_pin');
        if (activePin) {
          showToast('Toca el sensor de huella de tu celular...', 'info');
          await triggerBiometricEnrollment(activePin);
        } else {
          setBioPinInput('');
          setBioPinError(null);
          setShowBioPinModal(true);
        }
      }
    }
  };

  const handleUnlinkBiometrics = () => {
    disableBiometrics();
    setBiometricsAutoPromptEnabled(false);
    setBiometricsActive(false);
    setIsBioPairConfigured(false);
    showToast('Huella desvinculada de este celular', 'info');
  };

  // PIN Verification handlers
  const handleVerifyDisableScreenshotPin = async (enteredPin: string) => {
    setIsVerifyingPin(true);
    setConfirmPinError(null);
    try {
      const saltHex = localStorage.getItem('vault_salt');
      const testIvHex = localStorage.getItem('vault_test_iv');
      const testCipherHex = localStorage.getItem('vault_test_cipher');
      const sessionPinVal = sessionPin || sessionStorage.getItem('vault_session_pin');

      let isValid = false;
      if (sessionPinVal && enteredPin === sessionPinVal) {
        isValid = true;
      } else if (saltHex && testIvHex && testCipherHex) {
        const salt = hexToBuf(saltHex);
        const derivedKey = await deriveKeyFromPin(enteredPin, salt);
        isValid = await verifyKey(derivedKey, testIvHex, testCipherHex);
      }

      if (isValid) {
        setScreenshotBlockActive(false);
        localStorage.setItem('vault_screenshot_block_active', 'false');
        setScreenshotBlockEnabled(false);
        window.dispatchEvent(new Event('vault_security_settings_changed'));
        setShowDisableScreenshotModal(false);
        setConfirmPin('');
        showToast('Bloqueo de capturas desactivado', 'info');
      } else {
        setConfirmPinError('PIN incorrecto. Inténtalo de nuevo.');
      }
    } catch (e) {
      console.error(e);
      setConfirmPinError('Error al verificar PIN');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleConfirmDuressPin = (pin: string) => {
    const sessionPinVal = sessionPin || sessionStorage.getItem('vault_session_pin');
    if (sessionPinVal && pin === sessionPinVal) {
      setDuressPinError('El PIN de coacción no puede ser igual a tu PIN maestro.');
      return;
    }

    if (duressStep === 'create') {
      setDuressPinInput(pin);
      setDuressStep('confirm');
      setDuressPinError(null);
    } else {
      if (pin === duressPinInput) {
        localStorage.setItem('vault_duress_pin', pin);
        localStorage.setItem('vault_duress_pin_active', 'true');
        setDuressPinActive(true);
        setShowDuressModal(false);
        setDuressPinInput('');
        setDuressPinConfirmInput('');
        showToast('PIN de coacción activado correctamente', 'success');
      } else {
        setDuressPinError('Los PINs no coinciden. Inténtalo de nuevo.');
        setDuressStep('create');
        setDuressPinInput('');
      }
    }
  };

  const clearAllLogs = () => {
    localStorage.removeItem('nullvault_access_logs');
    setLogs([]);
    setShowAllLogsModal(false);
    showToast('Registro de accesos vaciado', 'info');
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-[max(calc(env(safe-area-inset-bottom,0px)+4.75rem),5rem)] animate-in fade-in duration-200 select-none box-border">
      {/* Fixed Pinned Header */}
      <header
        className="fixed top-0 left-0 right-0 z-30 [backdrop-filter:blur(24px)] backdrop-blur-xl border-b safe-top-sticky pb-3 px-4 shadow-md transition-all"
        style={{
          backgroundColor: 'var(--theme-bg-header, rgba(6, 11, 20, 0.94))',
          borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.8))',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-0.5" style={{ color: 'var(--theme-text-main, #ffffff)' }}>
              Seguri<span style={{ color: 'var(--theme-primary, #00e5ff)' }}>dad</span>
            </h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
              PROTECCIÓN ACTIVA Y CONTROL DE ACCESO
            </p>
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="safe-top-header-spacer shrink-0 w-full mb-3" />

      {/* Card 1: PROTECCIONES ACTIVAS */}
      <div className="bg-[#0a121d] border border-slate-800/90 rounded-3xl p-5 mb-4 shadow-xl">
        <h3 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-4">
          PROTECCIONES ACTIVAS
        </h3>

        <div className="space-y-4">
          {/* 1. PIN de coacción */}
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-3.5 flex-1 cursor-pointer group"
              onClick={handleToggleDuress}
            >
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                  PIN de coacción
                </h4>
                <p className="text-xs text-slate-400">
                  {duressPinActive ? 'Activo · Toca para desactivar o cambiar' : 'Inactivo'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleDuress}
              aria-label="Toggle PIN de coacción"
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                duressPinActive ? 'bg-[#00e5ff]' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform absolute top-0.5 ${
                  duressPinActive ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* 2. Bloqueo de capturas */}
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-3.5 flex-1 cursor-pointer group"
              onClick={handleToggleScreenshot}
            >
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                  Bloqueo de capturas
                </h4>
                <p className="text-xs text-slate-400">
                  {screenshotBlockActive ? 'Activo' : 'Inactivo'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleScreenshot}
              aria-label="Toggle Bloqueo de capturas"
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                screenshotBlockActive ? 'bg-[#00e5ff]' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform absolute top-0.5 ${
                  screenshotBlockActive ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* 3. Biometría */}
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-3.5 flex-1 cursor-pointer group"
              onClick={handleToggleBiometrics}
            >
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                  Inicio con Huella Digital
                </h4>
                <p className="text-xs text-slate-400">
                  {biometricsActive
                    ? 'Inicio automático activo'
                    : isBioPairConfigured
                    ? 'Inactivo (el sensor responde al tocarlo en el teclado)'
                    : 'Toca para vincular el sensor de tu celular'}
                </p>
                {isBioPairConfigured && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnlinkBiometrics();
                    }}
                    className="text-[11px] text-rose-400/80 hover:text-rose-300 underline mt-0.5 inline-block cursor-pointer"
                  >
                    Desvincular huella de este celular
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleBiometrics}
              aria-label="Toggle Biometría"
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                biometricsActive ? 'bg-[#00e5ff]' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform absolute top-0.5 ${
                  biometricsActive ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Card 2: PIN Y BLOQUEO */}
      <div className="bg-[#0a121d] border border-slate-800/90 rounded-3xl p-5 mb-4 shadow-xl">
        <h3 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-4">
          PIN Y BLOQUEO
        </h3>

        {/* Políticas de Bloqueo */}
        <div className="space-y-4 mb-5">
          {/* Timeout */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">Auto-bloqueo por inactividad</h4>
                <p className="text-xs text-slate-400">Bloquea la bóveda si no hay interacción</p>
              </div>
            </div>
            <select
              value={autoLockMinutes}
              onChange={(e) => onAutoLockChange && onAutoLockChange(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#00e5ff] cursor-pointer shrink-0"
            >
              <option value={0.5}>30 seg</option>
              <option value={1}>1 min</option>
              <option value={2}>2 min</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={0}>Desactivado</option>
            </select>
          </div>

          {/* Bloquear al cambiar de pestaña */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <EyeOff className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">Bloquear al cambiar de pestaña</h4>
                <p className="text-xs text-slate-400">Protege tu pantalla si sales o minimizas</p>
              </div>
            </div>
            <NeonSwitch
              checked={lockOnTabSwitch}
              onChange={(enabled) => onLockOnTabSwitchChange && onLockOnTabSwitchChange(enabled)}
              ariaLabel="Bloquear al cambiar de pestaña"
            />
          </div>

          {/* Bloqueo al Voltear Boca Abajo (Flip to Lock) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">Bloqueo al voltear boca abajo</h4>
                <p className="text-xs text-slate-400">Bloquea al colocar el móvil sobre la mesa</p>
              </div>
            </div>
            <NeonSwitch
              checked={flipToLockEnabled}
              onChange={handleToggleFlipToLock}
              ariaLabel="Bloqueo al voltear boca abajo"
            />
          </div>
        </div>

        {/* Separador y Cambiar PIN */}
        <div className="border-t border-slate-800/80 pt-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-[#00e5ff]" />
            <span>Cambiar PIN Maestro</span>
          </h4>
          <p className="text-[11px] text-slate-400 mb-3">
            Actualiza el código de 4 o más dígitos con el que desbloqueas tu bóveda.
          </p>

          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">PIN Actual</label>
              <div className="relative flex items-center">
                <input
                  type={showCurrentPin ? 'text' : 'password'}
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="••••"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                  title={showCurrentPin ? 'Ocultar PIN' : 'Ver PIN'}
                >
                  {showCurrentPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nuevo PIN</label>
                <div className="relative flex items-center">
                  <input
                    type={showNewPin ? 'text' : 'password'}
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="••••"
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                    title={showNewPin ? 'Ocultar PIN' : 'Ver PIN'}
                  >
                    {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Confirmar Nuevo</label>
                <div className="relative flex items-center">
                  <input
                    type={showConfirmNewPin ? 'text' : 'password'}
                    inputMode="numeric"
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value)}
                    placeholder="••••"
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPin(!showConfirmNewPin)}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                    title={showConfirmNewPin ? 'Ocultar PIN' : 'Ver PIN'}
                  >
                    {showConfirmNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {pinChangeError && (
              <div className="text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {pinChangeError}
              </div>
            )}

            {pinChangeSuccess && (
              <div className="text-emerald-400 text-xs bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>PIN actualizado con éxito.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isChangingPin || !currentPin || !newPin || !confirmNewPin}
              className="w-full py-2.5 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                boxShadow: '0 4px 14px -2px var(--theme-glow)',
              }}
            >
              <KeyRound className="w-3.5 h-3.5 text-white" />
              <span className="text-white font-bold">{isChangingPin ? 'Re-cifrando bóveda...' : 'Actualizar PIN'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Card 3: REGISTRO DE ACCESOS */}
      <div className="flex items-center justify-between px-1 mb-2.5">
        <h3 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
          REGISTRO DE ACCESOS
        </h3>
        <button
          type="button"
          onClick={() => setShowAllLogsModal(true)}
          className="text-xs font-bold text-[#00e5ff] hover:underline cursor-pointer"
        >
          VER TODO
        </button>
      </div>

      <div className="bg-[#0a121d] border border-slate-800/90 rounded-3xl divide-y divide-slate-800/70 overflow-hidden shadow-xl mb-4">
        {logs.slice(0, 4).map((log) => {
          const isSuccess = log.type === 'success';

          return (
            <div
              key={log.id}
              onClick={() => setShowAllLogsModal(true)}
              className="flex items-center justify-between p-4 hover:bg-slate-800/40 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-[#00e5ff] shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white group-hover:text-slate-200 transition-colors truncate">
                    {log.title}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">
                    {log.time}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                    isSuccess
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {isSuccess ? 'Válido' : 'Bloqueado'}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          );
        })}

        {logs.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">
            No hay registros de acceso recientes
          </div>
        )}
      </div>

      {/* Modal Todos los Registros de Acceso (HISTORIAL DE ACCESOS) */}
      {showAllLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0a121d] border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#00e5ff]" />
                <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                  Historial de Accesos
                </h3>
              </div>
              <button
                onClick={() => setShowAllLogsModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2.5 pr-1">
              {logs.map((log) => {
                const isSuccess = log.type === 'success';

                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isSuccess ? (
                        <CheckCircle2 className="w-4 h-4 text-[#00e5ff] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{log.title}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{log.time}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                          isSuccess
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {isSuccess ? 'Válido' : 'Bloqueado'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={clearAllLogs}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar historial</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAllLogsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar PIN para Desactivar Bloqueo de Capturas */}
      {showDisableScreenshotModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#0a121d] border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-base text-white">
                Desactivar Bloqueo de Capturas
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {hasBiometricCredentials()
                  ? 'Toca el sensor de huella o ingresa tu PIN Maestro para autorizar la desactivación.'
                  : 'Ingresa tu PIN Maestro para autorizar la desactivación del bloqueo de capturas de pantalla.'}
              </p>
            </div>

            {hasBiometricCredentials() && (
              <button
                type="button"
                onClick={triggerBiometricForScreenshot}
                disabled={isVerifyingPin}
                className="w-full mb-3.5 py-2.5 px-3 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 active:scale-95 border border-cyan-500/30 text-[#00e5ff] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Fingerprint className="w-4 h-4 text-[#00e5ff]" />
                <span>{isVerifyingPin ? 'Verificando huella...' : 'Usar sensor de huella'}</span>
              </button>
            )}

            {confirmPinError && (
              <div className="mb-4 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs text-center font-medium">
                {confirmPinError}
              </div>
            )}

            <PinKeypad
              pin={confirmPin}
              maxDigits={4}
              onPinChange={(newPin) => {
                setConfirmPin(newPin);
                setConfirmPinError(null);
                if (newPin.length === 4) {
                  handleVerifyDisableScreenshotPin(newPin);
                }
              }}
              disabled={isVerifyingPin}
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDisableScreenshotModal(false);
                  setConfirmPin('');
                  setConfirmPinError(null);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear PIN de Coacción */}
      {showDuressModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#0a121d] border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-base text-white">
                {duressStep === 'create' ? 'Crear PIN de Coacción' : 'Confirmar PIN de Coacción'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {duressStep === 'create'
                  ? 'Elige un PIN alternativo de 4 dígitos. Si entras con este PIN, la app simulará estar vacía.'
                  : 'Vuelve a escribir el PIN de coacción de 4 dígitos para confirmarlo.'}
              </p>
            </div>

            {duressPinError && (
              <div className="mb-4 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs text-center font-medium">
                {duressPinError}
              </div>
            )}

            <PinKeypad
              pin={duressStep === 'create' ? duressPinInput : duressPinConfirmInput}
              maxDigits={4}
              onPinChange={(newPin) => {
                setDuressPinError(null);
                if (duressStep === 'create') {
                  setDuressPinInput(newPin);
                  if (newPin.length === 4) {
                    handleConfirmDuressPin(newPin);
                  }
                } else {
                  setDuressPinConfirmInput(newPin);
                  if (newPin.length === 4) {
                    handleConfirmDuressPin(newPin);
                  }
                }
              }}
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDuressModal(false);
                  setDuressPinInput('');
                  setDuressPinConfirmInput('');
                  setDuressPinError(null);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Activar Biometría con PIN */}
      {showBioPinModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#0a121d] border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center mx-auto mb-3">
                <Fingerprint className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-base text-white">
                Vincular Huella Digital
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Ingresa tu PIN Maestro de 4 dígitos para autorizar el uso de tu sensor de huella.
              </p>
            </div>

            {bioPinError && (
              <div className="mb-4 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs text-center font-medium">
                {bioPinError}
              </div>
            )}

            <PinKeypad
              pin={bioPinInput}
              maxDigits={4}
              onPinChange={(newPin) => {
                setBioPinInput(newPin);
                setBioPinError(null);
                if (newPin.length === 4) {
                  const saltHex = localStorage.getItem('vault_salt');
                  const testIvHex = localStorage.getItem('vault_test_iv');
                  const testCipherHex = localStorage.getItem('vault_test_cipher');
                  const sessionPinVal = sessionPin || sessionStorage.getItem('vault_session_pin');

                  let isValid = false;
                  if (sessionPinVal && newPin === sessionPinVal) {
                    isValid = true;
                  } else if (saltHex && testIvHex && testCipherHex) {
                    const salt = hexToBuf(saltHex);
                    deriveKeyFromPin(newPin, salt).then((derivedKey) => {
                      verifyKey(derivedKey, testIvHex, testCipherHex).then((valid) => {
                        if (valid) {
                          triggerBiometricEnrollment(newPin);
                        } else {
                          setBioPinError('PIN Maestro incorrecto.');
                        }
                      });
                    });
                    return;
                  }

                  if (isValid) {
                    triggerBiometricEnrollment(newPin);
                  } else {
                    setBioPinError('PIN Maestro incorrecto.');
                  }
                }
              }}
              disabled={isEnrollingBio}
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowBioPinModal(false);
                  setBioPinInput('');
                  setBioPinError(null);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

