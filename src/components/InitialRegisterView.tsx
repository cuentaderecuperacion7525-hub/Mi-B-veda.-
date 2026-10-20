import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Mail,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Lock,
  CheckCircle,
  KeyRound,
  RotateCcw,
  Loader2,
  AlertCircle,
  Edit2,
  CheckCircle2,
  ExternalLink,
  Flame,
  Radio,
} from 'lucide-react';
import {
  userProfileService,
  calculateAgeFromBirthDate,
  formatBirthDateMask,
} from '../services/userProfileService';
import {
  sendFirebaseVerification,
  checkFirebaseEmailVerification,
  resendFirebaseVerificationEmail,
  verifyWithActionCode,
} from '../services/firebaseAuthService';
import { sendEmailPin, verifyEmailPin } from '../services/emailVerificationService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  // Step: 'form' (personal data) | 'verify' (email verification)
  const [step, setStep] = useState<'form' | 'verify'>('form');

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [calculatedAge, setCalculatedAge] = useState<number | null>(null);
  const [email, setEmail] = useState('');

  // Verification mode: 'firebase' (official link/auto-verify) | 'pin' (4-digit code)
  const [verifyMode, setVerifyMode] = useState<'firebase' | 'pin'>('firebase');

  // Verification step state
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const [directCodeInput, setDirectCodeInput] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  const [countdown, setCountdown] = useState<number>(60);
  const [canResend, setCanResend] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isCheckingVerify, setIsCheckingVerify] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoChecking, setIsAutoChecking] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    let timer: any = null;
    if (step === 'verify' && countdown > 0) {
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

  // Real-time automatic polling when in Firebase verification mode
  useEffect(() => {
    let checkInterval: any = null;

    if (step === 'verify' && verifyMode === 'firebase') {
      setIsAutoChecking(true);

      checkInterval = setInterval(async () => {
        const age = calculateAgeFromBirthDate(birthDate) || 0;
        const result = await checkFirebaseEmailVerification({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate: birthDate.trim(),
          age,
          email: email.trim().toLowerCase(),
        });

        if (result.verified) {
          clearInterval(checkInterval);
          showToast('¡Correo verificado con éxito en Firebase!', 'success');
          setTimeout(() => {
            onComplete();
          }, 500);
        }
      }, 3500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [step, verifyMode, birthDate, email, firstName, lastName, onComplete, showToast]);

  // Handle BirthDate Mask and Real-time Age Calculation
  const handleBirthDateChange = (val: string) => {
    const masked = formatBirthDateMask(val);
    setBirthDate(masked);
    setError(null);

    if (masked.length === 10) {
      const age = calculateAgeFromBirthDate(masked);
      setCalculatedAge(age);
    } else {
      setCalculatedAge(null);
    }
  };

  // Submit Form: Register and Send Real Verification via Firebase Auth
  const handleSendVerification = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanFirst) {
      setError('Por favor, ingresa tu(s) nombre(s).');
      return;
    }
    if (!cleanLast) {
      setError('Por favor, ingresa tus apellidos.');
      return;
    }
    if (birthDate.length !== 10) {
      setError('Ingresa tu fecha de nacimiento completa (DD/MM/AAAA).');
      return;
    }

    const age = calculateAgeFromBirthDate(birthDate);
    if (age === null || age < 1 || age > 120) {
      setError('Por favor, ingresa una fecha de nacimiento válida.');
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
      // 1. Send official Firebase Auth verification to the user's real email
      const res = await sendFirebaseVerification(cleanEmail, cleanFirst, cleanLast, birthDate, age);

      if (!res.success) {
        setError(res.error || 'No se pudo enviar el correo de verificación.');
        setIsSendingCode(false);
        return;
      }

      if (res.isAlreadyVerified) {
        showToast('¡Tu correo ya está verificado oficialmente!', 'success');
        setTimeout(() => {
          onComplete();
        }, 400);
        return;
      }

      setStep('verify');
      setVerifyMode('firebase');
      setCountdown(60);
      setCanResend(false);
      showToast(`Correo de verificación oficial enviado a ${cleanEmail}`, 'success');
    } catch (err: any) {
      console.error('Error sending verification code:', err);
      setError('Error al conectar con los servicios de autenticación.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Manual Check Button for Firebase Link Verification
  const handleManualCheckVerification = async () => {
    setIsCheckingVerify(true);
    setError(null);

    try {
      const age = calculateAgeFromBirthDate(birthDate) || 0;
      const res = await checkFirebaseEmailVerification({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate.trim(),
        age,
        email: email.trim().toLowerCase(),
      });

      if (res.verified) {
        showToast('¡Verificación confirmada exitosamente!', 'success');
        setTimeout(() => {
          onComplete();
        }, 400);
      } else {
        setError('Aún no hemos detectado la confirmación. Por favor, abre el correo y pulsa el enlace.');
      }
    } catch {
      setError('Error al comprobar la verificación. Inténtalo de nuevo.');
    } finally {
      setIsCheckingVerify(false);
    }
  };

  // Resend Verification Email (Firebase Auth)
  const handleResendFirebaseEmail = async () => {
    if (!canResend || isSendingCode) return;

    setIsSendingCode(true);
    setError(null);

    try {
      const res = await resendFirebaseVerificationEmail();
      if (res.success) {
        setCountdown(60);
        setCanResend(false);
        showToast(`Nuevo correo enviado a ${email}`, 'success');
      } else {
        setError(res.error || 'No se pudo reenviar el correo.');
      }
    } catch {
      setError('Error de conexión al reenviar el correo.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Direct Code / Link Verification (if user copied from email)
  const handleVerifyDirectCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = directCodeInput.trim();
    if (!raw) return;

    setIsVerifyingCode(true);
    setError(null);

    try {
      // Extract oobCode if user pasted full URL
      let actionCode = raw;
      if (raw.includes('oobCode=')) {
        const url = new URL(raw);
        actionCode = url.searchParams.get('oobCode') || raw;
      }

      const age = calculateAgeFromBirthDate(birthDate) || 0;
      const res = await verifyWithActionCode(actionCode, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate.trim(),
        age,
        email: email.trim().toLowerCase(),
      });

      if (res.success) {
        showToast('¡Código de Firebase verificado con éxito!', 'success');
        setTimeout(() => {
          onComplete();
        }, 400);
      } else {
        setError(res.error || 'Código de verificación no válido.');
      }
    } catch {
      setError('Error al validar el código.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Switch to PIN mode and request 4-digit PIN
  const handleSwitchToPinMode = async () => {
    setVerifyMode('pin');
    setIsSendingCode(true);
    setError(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await sendEmailPin(cleanEmail, firstName.trim());
      if (res.success) {
        setCountdown(60);
        setCanResend(false);
        setPinDigits(['', '', '', '']);
        showToast(`Código de 4 dígitos enviado a ${cleanEmail}`, 'info');
        setTimeout(() => {
          pinInputRefs[0].current?.focus();
        }, 150);
      } else {
        setError(res.error || 'No se pudo generar el código PIN.');
      }
    } catch {
      setError('Error al generar código PIN.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Handle single digit input in the 4-digit PIN fields
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
      performPinVerification(fullPin);
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
      performPinVerification(pasted);
    } else {
      pinInputRefs[Math.min(pasted.length, 3)].current?.focus();
    }
  };

  // Perform Final Verification with 4-digit PIN
  const performPinVerification = async (pinCode?: string) => {
    const code = pinCode || pinDigits.join('');
    if (code.length !== 4) {
      setError('Por favor, introduce los 4 dígitos del código.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const age = calculateAgeFromBirthDate(birthDate) || 0;

    setIsVerifyingCode(true);
    setError(null);

    try {
      const res = await verifyEmailPin(cleanEmail, code);

      if (!res.success) {
        setError(res.error || 'Código incorrecto o expirado.');
        setIsVerifyingCode(false);
        return;
      }

      userProfileService.saveUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate.trim(),
        age,
        email: cleanEmail,
        emailVerified: true,
      });

      showToast('¡PIN verificado con éxito!', 'success');

      setTimeout(() => {
        onComplete();
      }, 400);
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
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-2xl relative transition-transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
              boxShadow: '0 8px 30px -4px var(--theme-glow)',
            }}
          >
            {step === 'form' ? (
              <ShieldCheck className="w-9 h-9 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
            ) : (
              <Mail className="w-9 h-9 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
            )}
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2"
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
            <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span>{step === 'form' ? 'Bienvenido a tu Bóveda Privada' : 'Verificación Firebase Auth'}</span>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--theme-text-main)' }}
          >
            {step === 'form' ? 'Registro Inicial' : 'Verifica tu Correo'}
          </h1>
          <p
            className="text-xs sm:text-sm mt-1.5 max-w-xs mx-auto leading-relaxed"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            {step === 'form'
              ? 'Ingresa tus datos personales para activar tu perfil y vincular tu cuenta con Firebase.'
              : `Correo de verificación enviado a ${email}`}
          </p>
        </div>

        {/* STEP 1: FORM VIEW */}
        {step === 'form' && (
          <div
            className="rounded-3xl p-5 sm:p-7 shadow-2xl border transition-colors backdrop-blur-sm"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <form onSubmit={handleSendVerification} className="space-y-4">
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
                    placeholder="Ej. Juan Carlos"
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
                  Apellidos <span className="text-rose-500">*</span>
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
                    required
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

              {/* Fecha de Nacimiento con máscara automática DD/MM/AAAA */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className="block text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--theme-text-main)' }}
                  >
                    Fecha de Nacimiento <span className="text-rose-500">*</span>
                  </label>
                  {calculatedAge !== null && (
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 animate-in fade-in"
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                        color: '#059669',
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{calculatedAge} años cumplidos</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <Calendar className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={birthDate}
                    onChange={(e) => handleBirthDateChange(e.target.value)}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    required
                    disabled={isSendingCode}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-mono font-medium border transition-all outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
                <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--theme-text-subtle)' }}>
                  Ejemplo: 25/08/1998 (las barras &quot;/&quot; se añaden automáticamente).
                </p>
              </div>

              {/* Correo Electrónico Real */}
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  Correo Electrónico Real <span className="text-rose-500">*</span>
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
                    placeholder="ejemplo@correo.com"
                    required
                    disabled={isSendingCode}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-medium border transition-all outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
                <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--theme-text-subtle)' }}>
                  Te enviaremos un correo de verificación oficial de Firebase para confirmar tu identidad.
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
                  <span>{error}</span>
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
                  <strong style={{ color: 'var(--theme-text-main)' }}>100% Seguro:</strong> Cifrado militar AES-256 local y verificación oficial de Google Firebase.
                </div>
              </div>

              {/* Action Button: Enviar Verificación */}
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
                    <span>Conectando con Firebase...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar Correo de Verificación</span>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: VERIFICATION VIEW */}
        {step === 'verify' && (
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
                  Correo de verificación enviado a:
                </p>
                <p className="text-xs font-mono font-bold truncate" style={{ color: 'var(--theme-primary)' }}>
                  {email}
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

            {/* FIREBASE AUTH MODE */}
            {verifyMode === 'firebase' && (
              <div className="space-y-4">
                {/* Real-time status detector */}
                <div
                  className="p-4 rounded-2xl border flex items-start gap-3 relative overflow-hidden"
                  style={{
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    borderColor: 'rgba(37, 99, 235, 0.3)',
                  }}
                >
                  <div className="relative mt-0.5">
                    <Radio className="w-5 h-5 text-blue-500 animate-pulse" />
                    <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  </div>
                  <div className="text-xs space-y-1">
                    <p className="font-bold" style={{ color: 'var(--theme-text-main)' }}>
                      Esperando confirmación en tu correo
                    </p>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                      Revisa tu bandeja de entrada (y la carpeta de spam si es necesario). Haz clic en el enlace de verificación y la aplicación detectará el cambio automáticamente.
                    </p>
                  </div>
                </div>

                {/* Primary Action Button: Comprobar Verificación */}
                <button
                  type="button"
                  onClick={handleManualCheckVerification}
                  disabled={isCheckingVerify}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                    boxShadow: '0 8px 24px -4px var(--theme-glow)',
                  }}
                >
                  {isCheckingVerify ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Comprobando estado en Firebase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-white" />
                      <span>Ya verifiqué mi correo (Comprobar)</span>
                    </>
                  )}
                </button>

                {/* Optional: Paste Action Link or Code */}
                <div className="pt-1">
                  {!showCodeInput ? (
                    <button
                      type="button"
                      onClick={() => setShowCodeInput(true)}
                      className="w-full text-center text-[11px] font-medium transition-colors hover:underline"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      ¿Copiaste el enlace de verificación? Pégalo aquí
                    </button>
                  ) : (
                    <form onSubmit={handleVerifyDirectCode} className="space-y-2 pt-1 animate-in fade-in">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={directCodeInput}
                          onChange={(e) => setDirectCodeInput(e.target.value)}
                          placeholder="Pega el enlace o código de acción aquí"
                          className="flex-1 rounded-xl px-3 py-2 text-xs border outline-none font-mono"
                          style={{
                            backgroundColor: 'var(--theme-bg-input)',
                            borderColor: 'var(--theme-border)',
                            color: 'var(--theme-text-main)',
                          }}
                        />
                        <button
                          type="submit"
                          disabled={isVerifyingCode || !directCodeInput.trim()}
                          className="px-3 py-2 rounded-xl text-white font-bold text-xs disabled:opacity-40"
                          style={{
                            background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                          }}
                        >
                          {isVerifyingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Validar'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Alternative: Switch to 4-digit PIN */}
                <div className="border-t pt-3" style={{ borderColor: 'var(--theme-border)' }}>
                  <button
                    type="button"
                    onClick={handleSwitchToPinMode}
                    className="w-full text-center text-[11px] font-medium transition-colors hover:underline"
                    style={{ color: 'var(--theme-primary)' }}
                  >
                    O verificar mediante código PIN de 4 dígitos
                  </button>
                </div>
              </div>
            )}

            {/* 4-DIGIT PIN MODE */}
            {verifyMode === 'pin' && (
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-bold uppercase tracking-wider text-center mb-3"
                    style={{ color: 'var(--theme-text-main)' }}
                  >
                    Ingresa el PIN de 4 Dígitos
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

                {/* Confirm PIN Action */}
                <button
                  type="button"
                  onClick={() => performPinVerification()}
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

                {/* Switch back to Firebase link */}
                <div className="border-t pt-3" style={{ borderColor: 'var(--theme-border)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyMode('firebase');
                      setError(null);
                    }}
                    className="w-full text-center text-[11px] font-medium transition-colors hover:underline"
                    style={{ color: 'var(--theme-primary)' }}
                  >
                    Volver a verificación por enlace de Firebase
                  </button>
                </div>
              </div>
            )}

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

            {/* Countdown Timer & Resend Button */}
            <div className="text-center pt-1">
              {countdown > 0 ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-muted)',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                  <span>Reenviar correo en <strong>{countdown}s</strong></span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResendFirebaseEmail}
                  disabled={isSendingCode}
                  className="inline-flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer hover:underline"
                  style={{ color: 'var(--theme-primary)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reenviar correo de verificación</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-5 text-center flex items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--theme-text-subtle)' }}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span>Configuración segura con Firebase Authentication y cifrado AES-256</span>
        </div>
      </div>
    </div>
  );
};
