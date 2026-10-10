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
  Lock,
  Loader2,
  KeyRound,
  Copy,
  Check,
  Download,
  ShieldAlert,
} from 'lucide-react';
import { setScreenshotBlockEnabled } from '../services/screenshotBlockService';
import { deriveKeyFromPin, verifyKey, hexToBuf } from '../crypto/vaultCrypto';
import {
  enrollBiometrics,
  disableBiometrics,
  isBiometricsEnrolled,
  hasBiometricCredentials,
  isBiometricsAutoPromptEnabled,
  setBiometricsAutoPromptEnabled,
} from '../services/biometricService';
import {
  isRecoveryKeyConfigured,
  generateRecoveryKey,
  backupMasterKeyWithRecoveryKey,
  downloadRecoveryKeyFile,
  formatRecoveryKeyDisplay,
  disableRecoveryKey,
} from '../services/recoveryKeyService';
import { registerBackHandler } from '../services/backButtonService';
import { PinKeypad } from './PinKeypad';

interface SecurityVaultViewProps {
  onOpenSettings: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
  sessionPin?: string | null;
  onLock?: () => void;
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

  // Recovery key states
  const [hasRecoveryKey, setHasRecoveryKey] = useState<boolean>(() => isRecoveryKeyConfigured());
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [newGeneratedKey, setNewGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [downloadedKey, setDownloadedKey] = useState(false);
  const [pinForNewKey, setPinForNewKey] = useState('');
  const [pinKeyError, setPinKeyError] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  // Back button registrations for modals in Security Tab
  useEffect(() => {
    if (showRecoveryModal) {
      try { window.history.pushState({ secModal: 'recovery' }, ''); } catch {}
      return registerBackHandler('sec_recovery_modal', () => {
        setShowRecoveryModal(false);
        setPinForNewKey('');
        setPinKeyError(null);
        setNewGeneratedKey(null);
        return true;
      }, 85);
    }
  }, [showRecoveryModal]);
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

  const handleToggleScreenshot = () => {
    if (screenshotBlockActive) {
      setConfirmPin('');
      setConfirmPinError(null);
      setShowDisableScreenshotModal(true);
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
        showToast('✅ Huella digital vinculada y activada', 'success');
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
        showToast('✅ Huella activada para inicio automático', 'success');
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

  const handleToggleRecoveryKey = () => {
    if (hasRecoveryKey) {
      disableRecoveryKey();
      setHasRecoveryKey(false);
      showToast('Clave de respaldo desactivada', 'info');
    } else {
      setNewGeneratedKey(null);
      setPinForNewKey('');
      setPinKeyError(null);
      setShowRecoveryModal(true);
    }
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
        showToast('✅ PIN de coacción activado correctamente', 'success');
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
    <div className="w-full max-w-md mx-auto px-4 pb-28 animate-in fade-in duration-200 select-none box-border">
      {/* Fixed Pinned Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-[#090d16]/95 backdrop-blur-xl border-b border-slate-800/80 safe-top-sticky pb-3 px-4 shadow-md shadow-black/40 transition-all">
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-0.5">
              Seguri<span className="text-[#00e5ff]">dad</span>
            </h1>
            <p className="text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">
              PROTECCIÓN ACTIVA Y REGISTRO DE ACCESOS
            </p>
          </div>
          {onLock && (
            <button
              type="button"
              onClick={onLock}
              className="px-3.5 py-1.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 ml-1"
            >
              <Lock className="w-3.5 h-3.5 text-rose-400" />
              <span>Bloquear</span>
            </button>
          )}
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

          {/* 4. Clave de Respaldo */}
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-3.5 flex-1 cursor-pointer group"
              onClick={() => {
                if (!hasRecoveryKey) {
                  handleToggleRecoveryKey();
                } else {
                  setNewGeneratedKey(null);
                  setPinForNewKey('');
                  setPinKeyError(null);
                  setShowRecoveryModal(true);
                }
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                  Clave de respaldo
                </h4>
                <p className="text-xs text-slate-400">
                  {hasRecoveryKey
                    ? 'Activa · Toca para ver o renovar código'
                    : 'Inactiva · Toca para generar código'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleRecoveryKey}
              aria-label="Toggle Clave de respaldo"
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                hasRecoveryKey ? 'bg-[#00e5ff]' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform absolute top-0.5 ${
                  hasRecoveryKey ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Card 2: REGISTRO DE ACCESOS */}
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
                Ingresa tu PIN Maestro para autorizar la desactivación del bloqueo de capturas de pantalla.
              </p>
            </div>

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

      {/* Modal Clave de Respaldo Maestra */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#131c2e] border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-200">
            <div className="flex justify-between items-center mb-3">
              <div className="w-12 h-12 bg-[#00e5ff]/10 border border-[#00e5ff]/20 rounded-2xl flex items-center justify-center text-[#00e5ff]">
                <KeyRound className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRecoveryModal(false);
                  setNewGeneratedKey(null);
                  setPinForNewKey('');
                  setPinKeyError(null);
                }}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h3 className="text-base font-bold text-white mb-1">
              Clave de Respaldo Maestra
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Esta clave de 16 caracteres te permite recuperar tu bóveda y crear un nuevo PIN si alguna vez lo olvidas, <strong>sin perder ningún archivo</strong>.
            </p>

            {newGeneratedKey ? (
              <div className="space-y-3.5 text-left">
                <div className="bg-[#0b101d] border-2 border-[#00e5ff]/40 rounded-2xl p-4 shadow-xl shadow-cyan-500/10 text-center">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-[#00e5ff] mb-1.5">
                    Tu Nueva Clave de Respaldo
                  </p>
                  <div className="py-2 px-3 bg-black/60 rounded-xl border border-slate-800">
                    <span className="text-lg font-black font-mono tracking-widest text-white selection:bg-[#00e5ff] selection:text-black">
                      {formatRecoveryKeyDisplay(newGeneratedKey)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(newGeneratedKey);
                          setCopiedKey(true);
                          showToast('¡Clave copiada al portapapeles!', 'success');
                          setTimeout(() => setCopiedKey(false), 2500);
                        } catch {}
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 text-[#00e5ff] text-xs font-semibold rounded-xl border border-[#00e5ff]/40 transition-colors cursor-pointer"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey ? 'Copiada' : 'Copiar'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          downloadRecoveryKeyFile(newGeneratedKey);
                          setDownloadedKey(true);
                          showToast('Archivo de respaldo descargado', 'success');
                        } catch {}
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar .txt</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>Esta clave ya quedó activada y vinculada a tu bóveda. Guárdala en tus notas o lugar seguro.</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowRecoveryModal(false);
                    setNewGeneratedKey(null);
                    setPinForNewKey('');
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                >
                  Entendido y Guardado
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (pinForNewKey.length < 4) {
                    setPinKeyError('Ingresa tu PIN actual de al menos 4 dígitos.');
                    return;
                  }

                  setIsGeneratingKey(true);
                  setPinKeyError(null);

                  try {
                    const saltHex = localStorage.getItem('vault_salt');
                    const testIvHex = localStorage.getItem('vault_test_iv');
                    const testCipherHex = localStorage.getItem('vault_test_cipher');

                    if (!saltHex || !testIvHex || !testCipherHex) {
                      setPinKeyError('Datos de bóveda no encontrados.');
                      return;
                    }

                    const salt = hexToBuf(saltHex);
                    const currentMasterKey = await deriveKeyFromPin(pinForNewKey, salt);
                    const isValid = await verifyKey(currentMasterKey, testIvHex, testCipherHex);

                    if (!isValid) {
                      setPinKeyError('PIN incorrecto. Ingresa el PIN maestro de tu bóveda.');
                      return;
                    }

                    const freshKey = generateRecoveryKey();
                    await backupMasterKeyWithRecoveryKey(currentMasterKey, freshKey);
                    setNewGeneratedKey(freshKey);
                    setHasRecoveryKey(true);
                    showToast('¡Nueva clave de respaldo generada y activada!', 'success');
                  } catch (err: any) {
                    setPinKeyError(err?.message || 'Error al generar clave de respaldo.');
                  } finally {
                    setIsGeneratingKey(false);
                  }
                }}
                className="space-y-3.5 text-left"
              >
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-white">¿Deseas generar una nueva clave?</p>
                  <p className="text-slate-400 text-[11px]">
                    Por seguridad, introduce tu PIN actual para generar y respaldar tu clave maestra:
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    PIN Maestro Actual
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinForNewKey}
                    onChange={(e) => {
                      setPinForNewKey(e.target.value.replace(/\D/g, ''));
                      setPinKeyError(null);
                    }}
                    placeholder="••••"
                    required
                    autoFocus
                    disabled={isGeneratingKey}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>

                {pinKeyError && (
                  <div className="text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{pinKeyError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecoveryModal(false);
                      setPinForNewKey('');
                      setPinKeyError(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={isGeneratingKey || pinForNewKey.length < 4}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer"
                  >
                    {isGeneratingKey ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generando...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Generar Clave</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
