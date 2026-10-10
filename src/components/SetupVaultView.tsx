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
              step === 'create' ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-700'
            }`}
          />
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 'confirm' ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-700'
            }`}
          />
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 'recovery_key' ? 'w-8 bg-[#00e5ff]' : 'w-2 bg-slate-700'
            }`}
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
            <div className="bg-[#0b101d] border-2 border-[#00e5ff]/40 rounded-2xl p-4 shadow-xl shadow-cyan-500/10 text-center">
              <p className="text-[10px] uppercase font-bold tracking-widest text-[#00e5ff] mb-1.5">
                Clave de Seguridad Personal (16 dígitos)
              </p>
              <div className="py-2 px-3 bg-black/60 rounded-xl border border-slate-800">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-widest text-white selection:bg-[#00e5ff] selection:text-black">
                  {formatRecoveryKeyDisplay(recoveryKey)}
                </span>
              </div>

              {/* Action Buttons: Copiar y Descargar */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 text-[#00e5ff] text-xs font-semibold rounded-xl border border-[#00e5ff]/40 transition-colors cursor-pointer active:scale-95"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>¡Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Clave</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadKey}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer active:scale-95"
                >
                  {downloadedKey ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Descargado</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Descargar .txt</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Checkbox confirmation */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-[#00e5ff] border-slate-700 focus:ring-0 focus:ring-offset-0 bg-slate-800 accent-[#00e5ff] cursor-pointer"
              />
              <span className="text-xs text-slate-300 leading-snug">
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
              className="w-full py-3.5 bg-gradient-to-r from-[#00e5ff] to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Inicializando bóveda segura...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finalizar y Entrar a la Bóveda</span>
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
