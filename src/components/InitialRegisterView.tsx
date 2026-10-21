import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Mail,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Lock,
  CheckCircle,
  RotateCcw,
  Loader2,
  AlertCircle,
  Edit2,
  KeyRound,
  Inbox,
} from 'lucide-react';
import { userProfileService } from '../services/userProfileService';
import { sendEmailPin, verifyEmailPin } from '../services/emailVerificationService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  // Step: 'form' | 'verify_pin'
  const [step, setStep] = useState<'form' | 'verify_pin'>('form');

  // Form Fields (No birthdate or age required)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('josemanuel5121@gmail.com');
  const [deliveredEmail, setDeliveredEmail] = useState('');

  // Loading & error states
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 4-digit PIN input state
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // 60-second countdown for resending
  const [countdown, setCountdown] = useState<number>(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    let timer: any = null;
    if (step === 'verify_pin' && countdown > 0) {
      setCanResend(false);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, countdown]);

  // SUBMIT FORM: SEND 4-DIGIT PIN TO EMAIL
  const handleSendPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanFirst) {
      setError('Por favor, ingresa tu(s) nombre(s).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Ingresa un correo electrónico válido (ej. usuario@gmail.com).');
      return;
    }

    setError(null);
    setIsSendingCode(true);

    try {
      const res = await sendEmailPin(cleanEmail, cleanFirst);

      if (!res.success) {
        setError(res.error || 'No se pudo enviar el código al correo.');
        setIsSendingCode(false);
        return;
      }

      const target = (res as any).targetEmail || cleanEmail;
      setDeliveredEmail(target);
      setStep('verify_pin');
      setCountdown(60);
      setCanResend(false);
      setPinDigits(['', '', '', '']);

      showToast(`Código de 4 dígitos enviado a tu correo`, 'success');

      setTimeout(() => {
        pinInputRefs[0].current?.focus();
      }, 200);
    } catch {
      setError('Error de conexión al enviar el código.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // RESEND 4-DIGIT PIN
  const handleResendPin = async () => {
    if (!canResend || isSendingCode) return;

    setIsSendingCode(true);
    setError(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await sendEmailPin(cleanEmail, firstName.trim());

      if (res.success) {
        setCountdown(60);
        setCanResend(false);
        setPinDigits(['', '', '', '']);
        showToast('Nuevo código enviado a tu correo', 'success');
        setTimeout(() => {
          pinInputRefs[0].current?.focus();
        }, 150);
      } else {
        setError(res.error || 'No se pudo reenviar el código.');
      }
    } catch {
      setError('Error al reenviar el código.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // PIN INPUT HANDLERS
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '').slice(-1);
    const updated = [...pinDigits];
    updated[index] = clean;
    setPinDigits(updated);
    setError(null);

    if (clean && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }

    const fullPin = updated.join('');
    if (fullPin.length === 4) {
      performVerification(fullPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const handlePastePin = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;

    const updated = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setPinDigits(updated);

    if (pasted.length === 4) {
      performVerification(pasted);
    } else {
      pinInputRefs[Math.min(pasted.length, 3)].current?.focus();
    }
  };

  // PERFORM PIN VERIFICATION & SAVE REGISTRATION
  const performVerification = async (pinCode?: string) => {
    const code = pinCode || pinDigits.join('');
    if (code.length !== 4) {
      setError('Por favor, ingresa los 4 dígitos del código.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setIsVerifyingCode(true);
    setError(null);

    try {
      const res = await verifyEmailPin(cleanEmail, code);

      if (!res.success) {
        setError(res.error || 'Código incorrecto o expirado.');
        setIsVerifyingCode(false);
        return;
      }

      // 1. Guardar de forma local el usuario registrado
      userProfileService.saveUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: cleanEmail,
        emailVerified: true,
        authProvider: 'email_pin',
      });

      showToast('¡Código verificado con éxito!', 'success');

      // 2. Transición automática a configuración de PIN de la bóveda
      setTimeout(() => {
        onComplete();
      }, 350);
    } catch {
      setError('Error al verificar el código con el servidor.');
      setIsVerifyingCode(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-200 select-none"
      style={{
        backgroundColor: 'var(--theme-bg-main)',
        color: 'var(--theme-text-main)',
      }}
    >
      <div className="w-full max-w-md animate-in fade-in duration-300">
        {/* Header Icon & Welcome Badge */}
        <div className="text-center mb-6">
          <div
            className="w-18 h-18 sm:w-20 sm:h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-2xl relative transition-transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
              boxShadow: '0 8px 30px -4px var(--theme-glow)',
            }}
          >
            {step === 'form' ? (
              <ShieldCheck className="w-10 h-10 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
            ) : (
              <KeyRound className="w-10 h-10 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
            )}
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 shadow-sm"
              style={{
                backgroundColor: 'var(--theme-bg-main)',
                borderColor: 'var(--theme-primary)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
            </div>
          </div>

          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2 border"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
              color: 'var(--theme-primary)',
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{step === 'form' ? 'Registro en Bóveda Segura' : 'Verificación por Código PIN'}</span>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--theme-text-main)' }}
          >
            {step === 'form' ? 'Crea tu Cuenta' : 'Ingresa el Código'}
          </h1>
          <p
            className="text-xs sm:text-sm mt-1.5 max-w-xs mx-auto leading-relaxed"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            {step === 'form'
              ? 'Ingresa tu nombre y tu correo de Gmail para enviarte tu código de activación de 4 dígitos.'
              : `Código de 4 dígitos enviado a ${deliveredEmail || email}`}
          </p>
        </div>

        {/* STEP 1: FORM VIEW */}
        {step === 'form' && (
          <div
            className="rounded-3xl p-5 sm:p-7 shadow-2xl border transition-colors backdrop-blur-sm space-y-4"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <form onSubmit={handleSendPin} className="space-y-4">
              {/* Nombre(s) */}
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  Nombre(s) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Ej. José Manuel"
                    required
                    autoFocus
                    disabled={isSendingCode}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-medium border transition-all outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
              </div>

              {/* Apellidos */}
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  Apellidos (Opcional)
                </label>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Ej. Gómez Pérez"
                    disabled={isSendingCode}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-medium border transition-all outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
              </div>

              {/* Correo Electrónico (Gmail) */}
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  Correo Electrónico (Gmail) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="ejemplo@gmail.com"
                    required
                    disabled={isSendingCode}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-medium border transition-all outline-none focus:ring-2 font-mono"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
                <p className="text-[11px] mt-1.5 px-1 leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                  Te enviaremos automáticamente un código de 4 dígitos a este correo para verificar tu identidad.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div
                  className="p-3 rounded-2xl text-xs font-medium border flex items-center gap-2 animate-in fade-in"
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    borderColor: 'rgba(244, 63, 94, 0.3)',
                    color: '#e11d48',
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Privacy Notice */}
              <div
                className="p-3 rounded-2xl border text-xs flex items-start gap-2.5 transition-colors"
                style={{
                  backgroundColor: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-primary)' }} />
                <div className="leading-relaxed text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                  <strong style={{ color: 'var(--theme-text-main)' }}>100% Privado y Seguro:</strong> Cifrado local <strong>AES-256-GCM</strong>. Tus archivos nunca salen de tu teléfono.
                </div>
              </div>

              {/* Action Button: Enviar PIN */}
              <button
                type="submit"
                disabled={isSendingCode}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                  boxShadow: '0 8px 24px -4px var(--theme-glow)',
                }}
              >
                {isSendingCode ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Enviando código a tu correo...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar PIN de Verificación</span>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: 4-DIGIT PIN VIEW */}
        {step === 'verify_pin' && (
          <div
            className="rounded-3xl p-5 sm:p-7 shadow-2xl border transition-colors backdrop-blur-sm space-y-5"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
            }}
          >
            {/* Recipient card with change option */}
            <div
              className="p-3.5 rounded-2xl border flex items-center justify-between"
              style={{
                backgroundColor: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <div className="min-w-0 pr-2">
                <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--theme-text-subtle)' }}>
                  Código PIN enviado a:
                </p>
                <p className="text-xs font-mono font-bold truncate" style={{ color: 'var(--theme-primary)' }}>
                  {deliveredEmail || email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setError(null);
                }}
                className="p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors hover:opacity-80 shrink-0"
                style={{
                  backgroundColor: 'var(--theme-bg-card)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text-main)',
                }}
              >
                <Edit2 className="w-3 h-3" />
                <span>Cambiar</span>
              </button>
            </div>

            {/* Notification hint */}
            <div
              className="p-3 rounded-2xl border flex items-start gap-2.5 text-xs"
              style={{
                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                borderColor: 'rgba(37, 99, 235, 0.25)',
              }}
            >
              <Inbox className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="leading-relaxed text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                Abre tu aplicación de <strong>Gmail</strong>. Busca el correo con asunto <em>&quot;es tu código de verificación&quot;</em> e ingresa los 4 números.
              </div>
            </div>

            {/* PIN Inputs */}
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-center mb-3"
                style={{ color: 'var(--theme-text-main)' }}
              >
                Ingresa el Código de 4 Dígitos
              </label>

              <div className="flex justify-center items-center gap-2.5 sm:gap-3.5" onPaste={handlePastePin}>
                {pinDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={pinInputRefs[index]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={isVerifyingCode}
                    className="w-13 h-14 sm:w-15 sm:h-16 text-center text-2xl font-mono font-black rounded-2xl border transition-all outline-none focus:scale-105 shadow-sm"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: digit ? 'var(--theme-primary)' : 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                      boxShadow: digit ? '0 0 12px var(--theme-glow)' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="p-3 rounded-2xl text-xs font-medium border flex items-center gap-2 animate-in fade-in"
                style={{
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  borderColor: 'rgba(244, 63, 94, 0.3)',
                  color: '#e11d48',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => performVerification()}
              disabled={isVerifyingCode || pinDigits.join('').length !== 4}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                boxShadow: '0 8px 24px -4px var(--theme-glow)',
              }}
            >
              {isVerifyingCode ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Verificando PIN...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-white" />
                  <span>Confirmar PIN y Continuar</span>
                </>
              )}
            </button>

            {/* Countdown Timer & Resend Button */}
            <div className="text-center pt-1 border-t" style={{ borderColor: 'var(--theme-border)' }}>
              {countdown > 0 ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border mt-2"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-muted)',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                  <span>Reenviar código en <strong>{countdown}s</strong></span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResendPin}
                  disabled={isSendingCode}
                  className="inline-flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer hover:underline mt-2"
                  style={{ color: 'var(--theme-primary)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reenviar código de 4 dígitos</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-5 text-center flex items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--theme-text-subtle)' }}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span>Verificación oficial por correo y cifrado militar AES-256</span>
        </div>
      </div>
    </div>
  );
};
