import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Sparkles,
  Copy,
  Check,
  Download,
  CheckCircle2,
  Lock,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import {
  deriveKeyFromPin,
  generateSalt,
  createVerificationPayload,
  bufToHex,
} from '../crypto/vaultCrypto';
import {
  generateRecoveryKey,
  backupMasterKeyWithRecoveryKey,
  downloadRecoveryKeyFile,
  formatRecoveryKeyDisplay,
} from '../services/recoveryKeyService';
import { PinKeypad } from './PinKeypad';

interface SetupVaultViewProps {
  onSetupComplete: (masterKey: CryptoKey, pin?: string) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const SetupVaultView: React.FC<SetupVaultViewProps> = ({
  onSetupComplete,
  showToast,
}) => {
  const [step, setStep] = useState<'create' | 'confirm' | 'recovery_key'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recovery Key states
  const [recoveryKey, setRecoveryKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [downloadedKey, setDownloadedKey] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const handleBackToCreate = () => {
    setStep('create');
    setConfirmPin('');
    setErrorMessage(null);
  };

  // Called when PIN is confirmed
  const handlePinConfirmed = (confirmedValue: string) => {
    if (confirmedValue !== pin) {
      setErrorMessage('Los PINs no coinciden. Inténtalo de nuevo.');
      setConfirmPin('');
      return;
    }
    setErrorMessage(null);
    // Generate the master recovery key and display it
    const newKey = generateRecoveryKey();
    setRecoveryKey(newKey);
    setStep('recovery_key');
  };

  // Copies recovery key to clipboard
  const handleCopyKey = () => {
    try {
      navigator.clipboard.writeText(recoveryKey);
      setCopiedKey(true);
      setSavedConfirmed(true);
      showToast('¡Clave de recuperación copiada al portapapeles!', 'success');
      setTimeout(() => setCopiedKey(false), 3000);
    } catch {
      showToast('Selecciona y copia el texto manualmente', 'info');
    }
  };

  // Downloads text backup file
  const handleDownloadKey = () => {
    try {
      downloadRecoveryKeyFile(recoveryKey);
      setDownloadedKey(true);
      setSavedConfirmed(true);
      showToast('Archivo de clave de recuperación descargado', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al descargar archivo de respaldo', 'error');
    }
  };

  // Finalizes vault cryptographic storage and unlocks
  const finalizeSetup = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      // 1. Generate cryptographic salt and derive AES-GCM 256 master key
      const salt = generateSalt();
      const saltHex = bufToHex(salt);
      const masterKey = await deriveKeyFromPin(pin, salt);

      // 2. Create test verification token
      const verification = await createVerificationPayload(masterKey);

      // 3. Store vault state in localStorage
      localStorage.setItem('vault_salt', saltHex);
      localStorage.setItem('vault_test_iv', verification.ivHex);
      localStorage.setItem('vault_test_cipher', verification.cipherHex);
      localStorage.setItem('vault_initialized', 'true');
      localStorage.setItem('vault_pin_length', pin.length.toString());

      try {
        sessionStorage.setItem('vault_session_pin', pin);
      } catch {}

      // 4. Wrap and backup master key with the recovery key
      if (recoveryKey) {
        await backupMasterKeyWithRecoveryKey(masterKey, recoveryKey);
      }

      showToast('¡Bóveda configurada y clave de respaldo activada!', 'success');
      onSetupComplete(masterKey, pin);
    } catch (err) {
      console.error('Error creating vault:', err);
      setErrorMessage('Error al inicializar la bóveda criptográfica');
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col justify-center items-center p-4">
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none flex justify-center items-center overflow-hidden">
        <div className="w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md bg-[#131c2e]/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center">
        {/* Header Icon */}
        <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 text-indigo-400 shadow-inner shadow-indigo-500/20">
          {step === 'create' ? (
            <KeyRound className="w-8 h-8" />
          ) : step === 'confirm' ? (
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          ) : (
            <Lock className="w-8 h-8 text-[#00e5ff]" />
          )}
        </div>

        {/* Titles and Descriptions according to step */}
        {step === 'create' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              Configura tu Bóveda
            </h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Crea un PIN numérico de 4 dígitos. Tus fotos, videos y documentos se cifrarán localmente mediante AES-GCM de 256 bits.
            </p>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              Confirma tu PIN
            </h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Ingresa de nuevo el mismo PIN maestro para confirmar la clave de cifrado.
            </p>
          </>
        )}

        {step === 'recovery_key' && (
          <>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Respaldo de Emergencia</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              Tu Clave de <span className="text-[#00e5ff]">Respaldo Maestra</span>
            </h1>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Guarda esta clave en un lugar seguro. Si alguna vez olvidas tu PIN, esta clave es la que te permitirá recuperarlo <strong>sin perder ninguna de tus fotos</strong>.
            </p>
          </>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 'create' ? 'w-8' : 'w-2'
            }`}
            style={{
              backgroundColor: step === 'create' ? 'var(--theme-primary)' : 'var(--theme-border)',
            }}
          />
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 'confirm' ? 'w-8' : 'w-2'
            }`}
            style={{
              backgroundColor: step === 'confirm' ? 'var(--theme-primary)' : 'var(--theme-border)',
            }}
          />
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 'recovery_key' ? 'w-8' : 'w-2'
            }`}
            style={{
              backgroundColor: step === 'recovery_key' ? 'var(--theme-primary)' : 'var(--theme-border)',
            }}
          />
        </div>

        {/* STEP 1: CREATE PIN */}
        {step === 'create' && (
          <div>
            <PinKeypad
              pin={pin}
              onPinChange={(val) => {
                setPin(val);
                setErrorMessage(null);
                if (val.length === 4) {
                  setTimeout(() => {
                    setStep('confirm');
                  }, 120);
                }
              }}
              maxDigits={4}
              disabled={isProcessing}
            />

            {errorMessage && (
              <div className="mt-4 flex items-center justify-center gap-1.5 text-rose-400 text-xs bg-rose-500/10 py-2 px-3 rounded-xl border border-rose-500/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CONFIRM PIN */}
        {step === 'confirm' && (
          <div>
            <PinKeypad
              pin={confirmPin}
              onPinChange={(val) => {
                setConfirmPin(val);
                setErrorMessage(null);
                if (val.length === 4) {
                  handlePinConfirmed(val);
                }
              }}
              maxDigits={4}
              disabled={isProcessing}
            />

            {errorMessage && (
              <div className="mt-4 flex items-center justify-center gap-1.5 text-rose-400 text-xs bg-rose-500/10 py-2 px-3 rounded-xl border border-rose-500/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleBackToCreate}
                disabled={isProcessing}
                className="py-2.5 px-6 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
              >
                Volver a cambiar PIN
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RECOVERY KEY DISPLAY */}
        {step === 'recovery_key' && (
          <div className="space-y-4 text-left">
            {/* Clave Card */}
            <div
              className="border-2 rounded-2xl p-4 shadow-md text-center transition-colors"
              style={{
                backgroundColor: 'var(--theme-bg-secondary)',
                borderColor: 'color-mix(in srgb, var(--theme-primary) 40%, transparent)',
              }}
            >
              <p
                className="text-[10px] uppercase font-bold tracking-widest mb-2"
                style={{ color: 'var(--theme-primary)' }}
              >
                Clave de Seguridad Personal (16 dígitos)
              </p>
              <div
                className="py-3 px-3 rounded-xl border"
                style={{
                  backgroundColor: 'var(--theme-bg-card)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                <span
                  className="text-xl sm:text-2xl font-black font-mono tracking-widest select-all"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  {formatRecoveryKeyDisplay(recoveryKey)}
                </span>
              </div>

              {/* Action Buttons: Copiar y Descargar */}
              <div className="grid grid-cols-2 gap-2.5 mt-3">
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="vault-btn-edit-profile flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--theme-primary) 35%, transparent)',
                    color: 'var(--theme-primary)',
                  }}
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" />
                      <span>¡Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Copiar Clave</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadKey}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'var(--theme-bg-card)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                >
                  {downloadedKey ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span style={{ color: 'var(--theme-text-main)' }}>Descargado</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-text-main)' }} />
                      <span style={{ color: 'var(--theme-text-main)' }}>Descargar .txt</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Checkbox confirmation */}
            <label
              className="flex items-start gap-2.5 p-3.5 rounded-xl border cursor-pointer select-none transition-colors"
              style={{
                backgroundColor: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-400 focus:ring-0 focus:ring-offset-0 accent-[#0284c7] cursor-pointer shrink-0"
              />
              <span
                className="text-xs leading-snug font-medium"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                He copiado, anotado o guardado esta clave en un lugar seguro. Entiendo que es necesaria si olvido mi PIN.
              </span>
            </label>

            {errorMessage && (
              <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Main Action Button */}
            <button
              type="button"
              onClick={finalizeSetup}
              disabled={isProcessing || (!savedConfirmed && !copiedKey && !downloadedKey)}
              className="vault-gradient-btn from-[#00e5ff] to-blue-600 bg-gradient-to-r w-full py-3.5 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                boxShadow: '0 4px 14px -2px var(--theme-glow)',
                color: '#ffffff',
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span className="text-white font-bold">Inicializando bóveda segura...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span className="text-white font-bold">Finalizar y Entrar a la Bóveda</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Security Info Footnote */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-left flex items-start gap-2.5 text-xs text-slate-400">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p>
            {step === 'recovery_key'
              ? 'Cero dependencias externas: tu clave de respaldo funciona 100% sin conexión a internet y protege tus fotos cifradas con AES-GCM de 256 bits.'
              : 'Cifrado de conocimiento cero: tu PIN nunca sale de este dispositivo. Tus archivos están protegidos con AES-GCM 256 bits.'}
          </p>
        </div>
      </div>
    </div>
  );
};
