import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  deriveKeyFromPin,
  generateSalt,
  createVerificationPayload,
  bufToHex,
} from '../crypto/vaultCrypto';
import { setupAutomaticEmailRecoveryEscrow } from '../services/recoveryKeyService';
import { PinKeypad } from './PinKeypad';

interface SetupVaultViewProps {
  onSetupComplete: (masterKey: CryptoKey, pin?: string) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const SetupVaultView: React.FC<SetupVaultViewProps> = ({
  onSetupComplete,
  showToast,
}) => {
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleBackToCreate = () => {
    setStep('create');
    setConfirmPin('');
    setErrorMessage(null);
  };

  // Finalizes vault cryptographic storage and unlocks immediately after confirming the 4-digit PIN
  const finalizeSetup = async (confirmedPinValue: string) => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      // 1. Generate cryptographic salt and derive AES-GCM 256 master key
      const salt = generateSalt();
      const saltHex = bufToHex(salt);
      const masterKey = await deriveKeyFromPin(confirmedPinValue, salt);

      // 2. Create test verification token
      const verification = await createVerificationPayload(masterKey);

      // 3. Store vault state in localStorage
      localStorage.setItem('vault_salt', saltHex);
      localStorage.setItem('vault_test_iv', verification.ivHex);
      localStorage.setItem('vault_test_cipher', verification.cipherHex);
      localStorage.setItem('vault_initialized', 'true');
      localStorage.setItem('vault_pin_length', confirmedPinValue.length.toString());

      try {
        sessionStorage.setItem('vault_session_pin', confirmedPinValue);
      } catch {}

      // 4. Configure automatic internal recovery escrow for email-verified PIN recovery
      await setupAutomaticEmailRecoveryEscrow(masterKey);

      showToast('¡Bóveda configurada y protegida con éxito!', 'success');
      onSetupComplete(masterKey, confirmedPinValue);
    } catch (err) {
      console.error('Error creating vault:', err);
      setErrorMessage('Error al inicializar la bóveda criptográfica');
      setIsProcessing(false);
    }
  };

  // Called when PIN is confirmed
  const handlePinConfirmed = (confirmedValue: string) => {
    if (confirmedValue !== pin) {
      setErrorMessage('Los PINs no coinciden. Inténtalo de nuevo.');
      setConfirmPin('');
      return;
    }
    setErrorMessage(null);
    finalizeSetup(confirmedValue);
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
          ) : (
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
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

        {/* Step indicator (2 steps) */}
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

            {isProcessing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-cyan-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Inicializando bóveda segura...</span>
              </div>
            )}

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

        {/* Security Info Footnote */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-left flex items-start gap-2.5 text-xs text-slate-400">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p>
            Cifrado de conocimiento cero: tu PIN nunca sale de este dispositivo. Si alguna vez lo olvidas, podrás recuperarlo verificando tu correo registrado sin perder tus archivos.
          </p>
        </div>
      </div>
    </div>
  );
};
