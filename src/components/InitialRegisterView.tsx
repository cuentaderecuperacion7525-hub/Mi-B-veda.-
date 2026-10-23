import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { userProfileService } from '../services/userProfileService';
import { sendEmailPin, verifyEmailPin } from '../services/emailVerificationService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

const PENDING_REG_KEY = 'vault_pending_registration';

interface PendingRegistrationData {
  step: 'form' | 'verify_pin';
  firstName: string;
  lastName: string;
  email: string;
  deliveredEmail: string;
  pinSentAt: number;
  testPin?: string;
}

function loadPendingRegistration(): PendingRegistrationData | null {
  try {
    const raw = localStorage.getItem(PENDING_REG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRegistrationData;
    // Válido por 15 minutos
    if (parsed && parsed.pinSentAt && Date.now() - parsed.pinSentAt < 15 * 60 * 1000) {
      return parsed;
    }
    localStorage.removeItem(PENDING_REG_KEY);
  } catch {}
  return null;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  const pendingInitial = useRef<PendingRegistrationData | null>(loadPendingRegistration()).current;

  // Step: 'form' | 'verify_pin'
  const [step, setStep] = useState<'form' | 'verify_pin'>(() => {
    return pendingInitial?.step === 'verify_pin' ? 'verify_pin' : 'form';
  });

  // Form Fields
  const [firstName, setFirstName] = useState(() => pendingInitial?.firstName || 'Jose Manuel');
  const [lastName, setLastName] = useState(() => pendingInitial?.lastName || 'Martínez');
  const [email, setEmail] = useState(() => pendingInitial?.email || 'jmmrtinez5121@gmail.com');
  const [deliveredEmail, setDeliveredEmail] = useState(() => pendingInitial?.deliveredEmail || '');

  // 6-digit PIN state (matching screenshot 2)
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Loading & error states
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testPinHint, setTestPinHint] = useState<string | null>(() => pendingInitial?.testPin || null);

  // 60-second countdown for resend
  const [countdown, setCountdown] = useState<number>(() => {
    if (pendingInitial?.step === 'verify_pin' && pendingInitial.pinSentAt) {
      const elapsed = Math.floor((Date.now() - pendingInitial.pinSentAt) / 1000);
      return Math.max(0, 60 - elapsed);
    }
    return 60;
  });

  useEffect(() => {
    let timer: any = null;
    if (step === 'verify_pin' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, countdown]);

  // Focus first pin input when entering verify_pin step
  useEffect(() => {
    if (step === 'verify_pin') {
      setTimeout(() => {
        pinInputRefs[0].current?.focus();
      }, 150);
    }
  }, [step]);

  // Handle digit change in 6-digit PIN boxes
  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');

    // Pasting multi-character string
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const updated = [...pinDigits];
      chars.forEach((c, i) => {
        if (index + i < 6) {
          updated[index + i] = c;
        }
      });
      setPinDigits(updated);
      setError(null);
      const nextIdx = Math.min(5, index + chars.length);
      pinInputRefs[nextIdx].current?.focus();
      return;
    }

    const updated = [...pinDigits];
    updated[index] = clean.slice(-1);
    setPinDigits(updated);
    setError(null);

    // Auto-advance to next box
    if (clean && index < 5) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const updated = [...pinDigits];
    pasted.split('').forEach((c, idx) => {
      if (idx < 6) updated[idx] = c;
    });
    setPinDigits(updated);
    setError(null);
    const targetIdx = Math.min(5, pasted.length);
    pinInputRefs[targetIdx].current?.focus();
  };

  // Submit Form: Send 6-digit PIN
  const handleSendPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanFirst) {
      setError('Por favor, ingresa tu nombre.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Ingresa un correo electrónico válido (ej. nombre@correo.com).');
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

      const target = res.targetEmail || cleanEmail;
      setDeliveredEmail(target);
      setTestPinHint(res.testPin || null);
      setStep('verify_pin');
      setCountdown(60);
      setPinDigits(['', '', '', '', '', '']);

      // Persist state so user can switch apps to check email
      try {
        localStorage.setItem(
          PENDING_REG_KEY,
          JSON.stringify({
            step: 'verify_pin',
            firstName: cleanFirst,
            lastName: cleanLast,
            email: cleanEmail,
            deliveredEmail: target,
            pinSentAt: Date.now(),
            testPin: res.testPin,
          })
        );
      } catch {}

      showToast(`Código de 6 dígitos enviado exitosamente`, 'success');
    } catch {
      setError('Error de conexión al enviar el código.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Resend 6-digit PIN
  const handleResendPin = async () => {
    if (countdown > 0 || isSendingCode) return;
    setIsSendingCode(true);
    setError(null);

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await sendEmailPin(cleanEmail, cleanFirst);
      if (res.success) {
        setCountdown(60);
        setTestPinHint(res.testPin || null);
        setPinDigits(['', '', '', '', '', '']);

        try {
          localStorage.setItem(
            PENDING_REG_KEY,
            JSON.stringify({
              step: 'verify_pin',
              firstName: cleanFirst,
              lastName: cleanLast,
              email: cleanEmail,
              deliveredEmail: res.targetEmail || cleanEmail,
              pinSentAt: Date.now(),
              testPin: res.testPin,
            })
          );
        } catch {}

        showToast('Nuevo código de 6 dígitos enviado', 'info');
        pinInputRefs[0].current?.focus();
      } else {
        setError(res.error || 'No se pudo reenviar el código.');
      }
    } catch {
      setError('Error al conectar con el servicio.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Verify PIN
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const pin = pinDigits.join('');

    if (pin.length < 6) {
      setError('Por favor ingresa el código completo de 6 dígitos.');
      return;
    }

    setIsVerifyingCode(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const targetToCheck = deliveredEmail || cleanEmail;

    try {
      const res = await verifyEmailPin(targetToCheck, pin);

      if (!res.success) {
        setError(res.error || 'Código incorrecto o expirado.');
        setIsVerifyingCode(false);
        return;
      }

      // Save user profile permanently
      userProfileService.saveUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: cleanEmail,
        emailVerified: true,
        authProvider: 'email_pin',
      });

      // Clear pending state
      try {
        localStorage.removeItem(PENDING_REG_KEY);
      } catch {}

      showToast('¡Correo verificado con éxito! Bienvenido a tu Bóveda.', 'success');
      onComplete();
    } catch {
      setError('Error al verificar el código. Intenta de nuevo.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4 sm:p-6 select-none font-sans">
      {/* Container Card */}
      <div className="w-full max-w-[420px] bg-white rounded-[32px] sm:rounded-[36px] p-6 sm:p-9 shadow-2xl shadow-black/60 border border-slate-100 relative transition-all animate-in fade-in duration-200">
        
        {step === 'form' ? (
          /* ========================================================
             PANTALLA 1: CREA TU BÓVEDA (Exacto al screenshot 1)
             ======================================================== */
          <div>
            {/* Top Badge: Círculo verde esmeralda con halo menta y caja fuerte */}
            <div className="w-24 h-24 rounded-full bg-emerald-100/70 flex items-center justify-center mx-auto mb-5">
              <div className="w-18 h-18 rounded-full bg-[#056444] flex items-center justify-center shadow-md text-white">
                <svg
                  className="w-9 h-9 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="18" x="3" y="3" rx="4" />
                  <circle cx="12" cy="12" r="4" />
                  <path d="m12 10 1.5 2" />
                  <path d="M7 21v1" />
                  <path d="M17 21v1" />
                </svg>
              </div>
            </div>

            {/* Título y Subtítulo */}
            <h1 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight text-center">
              Crea tu bóveda
            </h1>
            <p className="text-slate-500 text-sm text-center mt-2 leading-relaxed max-w-[280px] mx-auto">
              Guarda tus archivos en un lugar seguro. Solo necesitas tu nombre y tu correo.
            </p>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Formulario */}
            <form onSubmit={handleSendPin} className="mt-6 space-y-4">
              {/* Campo Nombre */}
              <div>
                <label className="block text-slate-800 text-sm font-bold mb-1.5">
                  Nombre
                </label>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:bg-white transition-all">
                  <User className="w-5 h-5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Ej. María"
                    required
                    disabled={isSendingCode}
                    className="w-full bg-transparent text-slate-900 text-base placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Campo Apellidos */}
              <div>
                <label className="block text-slate-800 text-sm font-bold mb-1.5">
                  Apellidos
                </label>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:bg-white transition-all">
                  <svg
                    className="w-5 h-5 text-slate-400 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="14" x="3" y="5" rx="2" />
                    <path d="M7 15h4M15 15h2M7 11h2M15 11h2" />
                    <circle cx="9" cy="9" r="1.5" />
                  </svg>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Ej. López Hernández"
                    disabled={isSendingCode}
                    className="w-full bg-transparent text-slate-900 text-base placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Campo Correo Electrónico */}
              <div>
                <label className="block text-slate-800 text-sm font-bold mb-1.5">
                  Correo electrónico
                </label>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:bg-white transition-all">
                  <Mail className="w-5 h-5 text-slate-400 shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="nombre@correo.com"
                    required
                    disabled={isSendingCode}
                    className="w-full bg-transparent text-slate-900 text-base placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Botón Enviar Código */}
              <button
                type="submit"
                disabled={isSendingCode}
                className="w-full py-4 mt-6 rounded-2xl bg-[#066b49] hover:bg-[#055b3e] disabled:opacity-50 text-white font-bold text-base shadow-lg shadow-emerald-800/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isSendingCode ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Enviando código...</span>
                  </>
                ) : (
                  <span>Enviar código</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* ========================================================
             PANTALLA 2: CONFIRMA TU CORREO (Exacto al screenshot 2)
             ======================================================== */
          <div>
            {/* Top Badge: Círculo verde esmeralda con halo menta y sobre de correo */}
            <div className="w-24 h-24 rounded-full bg-emerald-100/70 flex items-center justify-center mx-auto mb-5">
              <div className="w-18 h-18 rounded-full bg-[#056444] flex items-center justify-center shadow-md text-white">
                <Mail className="w-9 h-9 text-white" />
              </div>
            </div>

            {/* Título y Subtítulo */}
            <h2 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight text-center">
              Confirma tu correo
            </h2>
            <p className="text-slate-500 text-sm text-center mt-2 leading-relaxed max-w-[280px] mx-auto">
              Revisa tu bandeja de entrada y escribe el código que te enviamos.
            </p>

            {/* Destinatario */}
            <div className="mt-6 text-center">
              <p className="text-slate-600 text-sm">
                Enviamos un código de 6 dígitos a
              </p>
              <p className="font-bold text-slate-900 text-sm mt-0.5 break-all">
                {deliveredEmail || email}
              </p>
              <p className="text-xs text-emerald-700 font-medium mt-1.5 flex items-center justify-center gap-1">
                <span>📬</span>
                <span>Revisa tu bandeja principal o Spam (Bóveda Segura)</span>
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Helper para desarrollo o cuando el sandbox de Resend restringe envíos externos */}
            {testPinHint && (
              <div
                onClick={() => {
                  const digits = testPinHint.split('').slice(0, 6);
                  setPinDigits(digits);
                  setError(null);
                  showToast('Código de activación completado', 'info');
                }}
                className="mt-4 p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-center cursor-pointer hover:bg-emerald-100/70 transition-colors shadow-xs"
              >
                <div className="flex items-center justify-center gap-1.5 text-emerald-800 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Código de activación: <strong className="font-mono text-sm tracking-widest text-emerald-950 font-black">{testPinHint}</strong></span>
                </div>
                <p className="text-[10px] text-emerald-600 font-medium underline mt-0.5">
                  Toca aquí para autocompletar en los 6 campos
                </p>
              </div>
            )}

            {/* Formulario de 6 dígitos */}
            <form onSubmit={handleVerifyPin} className="mt-6">
              <label className="block text-slate-800 text-sm font-bold text-center mb-3">
                Código de verificación
              </label>

              {/* 6 Casillas de Código */}
              <div className="grid grid-cols-6 gap-2 sm:gap-2.5 max-w-[340px] mx-auto">
                {pinDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={pinInputRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={idx === 0 ? handlePaste : undefined}
                    disabled={isVerifyingCode}
                    className="w-full aspect-[4/5] rounded-2xl border-2 border-slate-200 bg-slate-50/70 text-2xl font-black text-center text-slate-900 font-mono focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-500/15 outline-none transition-all shadow-xs"
                  />
                ))}
              </div>

              {/* Botón Verificar y registrarme */}
              <button
                type="submit"
                disabled={pinDigits.join('').length < 6 || isVerifyingCode}
                className="w-full py-4 mt-6 rounded-2xl bg-[#066b49] hover:bg-[#055b3e] disabled:opacity-45 text-white font-bold text-base shadow-lg shadow-emerald-800/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isVerifyingCode ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <span>Verificar y registrarme</span>
                )}
              </button>

              {/* Fila Inferior: Reenviar y Cambiar correo */}
              <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500 mt-5 px-1">
                <div>
                  {countdown > 0 ? (
                    <span>Reenviar código en {countdown} s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendPin}
                      disabled={isSendingCode}
                      className="text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
                    >
                      {isSendingCode ? 'Enviando...' : 'Reenviar código'}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStep('form');
                    setError(null);
                  }}
                  className="underline text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  Cambiar correo
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
