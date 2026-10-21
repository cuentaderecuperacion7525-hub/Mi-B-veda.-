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
  Radio,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { userProfileService } from '../services/userProfileService';
import {
  signInWithGoogle,
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
  // Step: 'choose' | 'verify_email'
  const [step, setStep] = useState<'choose' | 'verify_email'>('choose');

  // Manual form expansion toggle
  const [showManualForm, setShowManualForm] = useState(false);

  // Manual Form Fields (No birth date or age needed)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // Loading states
  const [isSigningWithGoogle, setIsSigningWithGoogle] = useState(false);
  const [isSendingManualCode, setIsSendingManualCode] = useState(false);
  const [isCheckingVerify, setIsCheckingVerify] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  // Verification step state
  const [verifyMode, setVerifyMode] = useState<'firebase' | 'pin'>('firebase');
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
  const [error, setError] = useState<string | null>(null);

  // Countdown timer for resending email
  useEffect(() => {
    let timer: any = null;
    if (step === 'verify_email' && countdown > 0) {
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

  // Real-time automatic polling when in Firebase link verification mode
  useEffect(() => {
    let checkInterval: any = null;

    if (step === 'verify_email' && verifyMode === 'firebase') {
      checkInterval = setInterval(async () => {
        const result = await checkFirebaseEmailVerification({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
        });

        if (result.verified) {
          clearInterval(checkInterval);
          showToast('¡Correo verificado con éxito!', 'success');
          setTimeout(() => {
            onComplete();
          }, 400);
        }
      }, 3500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [step, verifyMode, email, firstName, lastName, onComplete, showToast]);

  // GOOGLE SIGN-IN HANDLER (1-TAP, NO BIRTHDATE/AGE REQUIRED)
  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningWithGoogle(true);

    try {
      const res = await signInWithGoogle();
      if (res.success && res.profile) {
        showToast(`¡Bienvenido, ${res.profile.firstName}! Cuenta verificada con Google`, 'success');
        setTimeout(() => {
          onComplete();
        }, 350);
      } else {
        setError(res.error || 'No se pudo completar el acceso con Google.');
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError('Ocurrió un error inesperado al conectar con Google.');
    } finally {
      setIsSigningWithGoogle(false);
    }
  };

  // MANUAL REGISTRATION HANDLER
  const handleManualRegister = async (e: React.FormEvent) => {
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
    setIsSendingManualCode(true);

    try {
      const res = await sendFirebaseVerification(cleanEmail, cleanFirst, cleanLast);

      if (!res.success) {
        // If email password fails with operation-not-allowed, suggest Google
        setError(res.error || 'No se pudo enviar el correo de verificación.');
        setIsSendingManualCode(false);
        return;
      }

      if (res.isAlreadyVerified) {
        showToast('¡Tu correo ya está verificado!', 'success');
        setTimeout(() => {
          onComplete();
        }, 400);
        return;
      }

      setStep('verify_email');
      setVerifyMode('firebase');
      setCountdown(60);
      setCanResend(false);
      showToast(`Correo de verificación enviado a ${cleanEmail}`, 'success');
    } catch {
      setError('Error al procesar el registro con el servidor.');
    } finally {
      setIsSendingManualCode(false);
    }
  };

  // Check Firebase email verification status
  const handleManualCheckVerification = async () => {
    setIsCheckingVerify(true);
    setError(null);

    try {
      const res = await checkFirebaseEmailVerification({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
      });

      if (res.verified) {
        showToast('¡Verificación confirmada exitosamente!', 'success');
        setTimeout(() => {
          onComplete();
        }, 400);
      } else {
        setError('Aún no detectamos la confirmación. Por favor, abre el correo y pulsa el enlace.');
      }
    } catch {
      setError('Error al comprobar la verificación.');
    } finally {
      setIsCheckingVerify(false);
    }
  };

  // Resend verification email
  const handleResendFirebaseEmail = async () => {
    if (!canResend || isSendingManualCode) return;
    setIsSendingManualCode(true);
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
      setError('Error de conexión al reenviar.');
    } finally {
      setIsSendingManualCode(false);
    }
  };

  // Verify direct code / link
  const handleVerifyDirectCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = directCodeInput.trim();
    if (!raw) return;

    setIsVerifyingCode(true);
    setError(null);

    try {
      let actionCode = raw;
      if (raw.includes('oobCode=')) {
        const url = new URL(raw);
        actionCode = url.searchParams.get('oobCode') || raw;
      }

      const res = await verifyWithActionCode(actionCode, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
      });

      if (res.success) {
        showToast('¡Verificación exitosa!', 'success');
        setTimeout(() => {
          onComplete();
        }, 400);
      } else {
        setError(res.error || 'Código de verificación inválido o expirado.');
      }
    } catch {
      setError('Error al validar el código.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Switch to PIN mode
  const handleSwitchToPinMode = async () => {
    setVerifyMode('pin');
    setIsSendingManualCode(true);
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
      setIsSendingManualCode(false);
    }
  };

  // Pin input handling
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

  const performPinVerification = async (pinCode?: string) => {
    const code = pinCode || pinDigits.join('');
    if (code.length !== 4) {
      setError('Por favor, introduce los 4 dígitos del código.');
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

      userProfileService.saveUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: cleanEmail,
        emailVerified: true,
      });

      showToast('¡PIN verificado con éxito!', 'success');
      setTimeout(() => {
        onComplete();
      }, 400);
    } catch {
      setError('Error al verificar el PIN con el servidor.');
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
            {step === 'choose' ? (
              <ShieldCheck className="w-10 h-10 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
            ) : (
              <Mail className="w-10 h-10 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
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
            <span>{step === 'choose' ? 'Acceso Seguro y Cifrado' : 'Verificación de Correo'}</span>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--theme-text-main)' }}
          >
            {step === 'choose' ? 'Bienvenido a tu Bóveda' : 'Confirma tu Correo'}
          </h1>
          <p
            className="text-xs sm:text-sm mt-1.5 max-w-xs mx-auto leading-relaxed"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            {step === 'choose'
              ? 'Regístrate en un instante con tu cuenta de Google para verificar tu identidad y proteger tus archivos.'
              : `Correo de verificación enviado a ${email}`}
          </p>
        </div>

        {/* STEP 1: CHOOSE REGISTRATION METHOD */}
        {step === 'choose' && (
          <div
            className="rounded-3xl p-5 sm:p-7 shadow-2xl border transition-colors backdrop-blur-sm space-y-4"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
            }}
          >
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

            {/* BOTÓN PRINCIPAL RECOMENDADO: CONTINUAR CON GOOGLE */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningWithGoogle}
                className="w-full py-4 px-4 rounded-2xl border font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50 relative group"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#1f2937',
                  borderColor: '#e5e7eb',
                }}
              >
                {isSigningWithGoogle ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <span>Conectando con Google...</span>
                  </>
                ) : (
                  <>
                    {/* SVG oficial del logo de Google */}
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span className="text-[14px] font-semibold text-gray-800">
                      Continuar con Google
                    </span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-center px-2 leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                ✨ <strong>Registro en 1 toque:</strong> Vincula tu cuenta de Google con verificación instantánea sin necesidad de códigos ni datos adicionales.
              </p>
            </div>

            {/* Separador */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--theme-border)' }} />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider">
                <span
                  className="px-3"
                  style={{
                    backgroundColor: 'var(--theme-bg-card)',
                    color: 'var(--theme-text-subtle)',
                  }}
                >
                  o también puedes
                </span>
              </div>
            </div>

            {/* OPCIÓN SECUNDARIA: REGISTRO CON CORREO MANUAL */}
            <div>
              <button
                type="button"
                onClick={() => setShowManualForm(!showManualForm)}
                className="w-full py-2.5 px-3 rounded-2xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text-main)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                  <span>Registrarme con correo electrónico</span>
                </div>
                {showManualForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showManualForm && (
                <form onSubmit={handleManualRegister} className="space-y-3.5 pt-3 animate-in fade-in">
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--theme-text-main)' }}>
                      Nombre(s) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--theme-text-muted)' }}>
                        <User className="w-3.5 h-3.5" />
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
                        disabled={isSendingManualCode}
                        className="w-full rounded-xl pl-9 pr-3 py-2 text-xs font-medium border outline-none"
                        style={{
                          backgroundColor: 'var(--theme-bg-input)',
                          borderColor: 'var(--theme-border)',
                          color: 'var(--theme-text-main)',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--theme-text-main)' }}>
                      Apellidos (Opcional)
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Ej. Gómez"
                      disabled={isSendingManualCode}
                      className="w-full rounded-xl px-3 py-2 text-xs font-medium border outline-none"
                      style={{
                        backgroundColor: 'var(--theme-bg-input)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text-main)',
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: 'var(--theme-text-main)' }}>
                      Correo Electrónico <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--theme-text-muted)' }}>
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="correo@ejemplo.com"
                        required
                        disabled={isSendingManualCode}
                        className="w-full rounded-xl pl-9 pr-3 py-2 text-xs font-medium border outline-none"
                        style={{
                          backgroundColor: 'var(--theme-bg-input)',
                          borderColor: 'var(--theme-border)',
                          color: 'var(--theme-text-main)',
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingManualCode}
                    className="w-full py-2.5 rounded-xl text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                    }}
                  >
                    {isSendingManualCode ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando enlace...</span>
                      </>
                    ) : (
                      <>
                        <span>Continuar con este correo</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Privacy Card */}
            <div
              className="p-3 rounded-2xl border text-xs flex items-start gap-2.5 transition-colors"
              style={{
                backgroundColor: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-primary)' }} />
              <div className="leading-relaxed text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                <strong style={{ color: 'var(--theme-text-main)' }}>Privacidad y Seguridad:</strong> Tus archivos y contraseñas se cifran de forma local en tu dispositivo con <strong>AES-256-GCM</strong>.
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: VERIFICATION VIEW (FOR MANUAL EMAIL REGISTRATION) */}
        {step === 'verify_email' && (
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
                  setStep('choose');
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

            {/* FIREBASE EMAIL LINK MODE */}
            {verifyMode === 'firebase' && (
              <div className="space-y-4">
                <div
                  className="p-4 rounded-2xl border flex items-start gap-3"
                  style={{
                    backgroundColor: 'rgba(37, 99, 255, 0.08)',
                    borderColor: 'rgba(37, 99, 255, 0.25)',
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
                      Abre tu bandeja de entrada y pulsa el enlace de verificación oficial. La app lo detectará automáticamente.
                    </p>
                  </div>
                </div>

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
                      <span>Comprobando estado...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-white" />
                      <span>Ya verifiqué mi correo (Comprobar)</span>
                    </>
                  )}
                </button>

                {/* Optional code paste */}
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
                          placeholder="Pega el enlace o código aquí"
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
                    Volver a verificación por enlace
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

            {/* Countdown / Resend */}
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
                  disabled={isSendingManualCode}
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
          <span>Autenticación oficial Google Firebase & Cifrado AES-256</span>
        </div>
      </div>
    </div>
  );
};
