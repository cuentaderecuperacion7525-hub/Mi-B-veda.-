import React, { useState, useRef, useEffect } from 'react';
import { Lock, Mail, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { userProfileService } from '../services/userProfileService';
import { syncUserProfile } from '../services/firebaseAuthService';
import { signInWithNativeGoogle } from '../services/nativeGoogleAuthService';
import { sendEmailPin, verifyEmailPin } from '../services/emailVerificationService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  // Pasos: 'register' (Pantalla 1) o 'verify_pin' (Pantalla 2)
  const [step, setStep] = useState<'register' | 'verify_pin'>('register');

  // Campos de Pantalla 1
  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Estados de carga y error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNative, setIsLoadingNative] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Campos de Pantalla 2 (PIN de 6 dígitos)
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [actualTargetEmail, setActualTargetEmail] = useState('');
  const [sandboxPin, setSandboxPin] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const pinInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus en el primer input de PIN al pasar al paso 2
  useEffect(() => {
    if (step === 'verify_pin') {
      setTimeout(() => {
        pinInputsRef.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  /* ==================== BLOQUE PROTEGIDO: ACCESO NATIVO GOOGLE ==================== */
  const handleContinueWithGoogle = async () => {
    if (isLoadingNative) return;
    setIsLoadingNative(true);
    setErrorMsg(null);

    try {
      // Invocar DIRECTAMENTE los servicios nativos de Google Play en el teléfono
      const res = await signInWithNativeGoogle();

      if (res.success && res.profile) {
        showToast(`Acceso autorizado para ${res.profile.email}`, 'success');
        // Pasa DIRECTAMENTE a la pantalla de creación del PIN de 4 dígitos de la bóveda
        onComplete();
        return;
      }

      if (res.cancelled) {
        // El usuario canceló la tarjeta oficial de Google
        return;
      }

      showToast(res.error || 'No se pudo iniciar sesión con Google', 'error');
    } catch {
      showToast('Error al conectar con Google', 'error');
    } finally {
      setIsLoadingNative(false);
    }
  };
  /* ==================== FIN BLOQUE PROTEGIDO ==================== */

  // Envío del formulario de Registro (Pantalla 1)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = fullName.trim();
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    if (!cleanName) {
      setErrorMsg('Por favor, ingresa tu nombre completo.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMsg('Por favor, ingresa un correo electrónico válido (ej. correo@ejemplo.com).');
      return;
    }

    if (cleanPass.length < 4) {
      setErrorMsg('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sendEmailPin(cleanEmail, cleanName);
      if (res.success) {
        const dest = res.targetEmail || cleanEmail;
        setActualTargetEmail(dest);
        if (res.testPin) {
          setSandboxPin(res.testPin);
        } else {
          setSandboxPin(null);
        }
        showToast(`Código enviado a ${dest}`, 'success');
        setPinDigits(['', '', '', '', '', '']);
        setStep('verify_pin');
      } else {
        setErrorMsg(res.error || 'No se pudo enviar el código. Verifica tu conexión.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al enviar código de verificación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejo de dígitos individuales del PIN (Pantalla 2)
  const handleDigitChange = (index: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = char;
    setPinDigits(newDigits);
    setErrorMsg(null);

    if (char && index < 5) {
      pinInputsRef.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputsRef.current[index - 1]?.focus();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...pinDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setPinDigits(newDigits);
    setErrorMsg(null);

    const nextIndex = Math.min(pasted.length, 5);
    pinInputsRef.current[nextIndex]?.focus();
  };

  // Verificar el PIN recibido (Pantalla 2)
  const handleVerifyPin = async () => {
    const enteredPin = pinDigits.join('').trim();
    if (enteredPin.length !== 6) {
      setErrorMsg('Ingresa los 6 dígitos del código.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const cleanEmail = emailInput.trim().toLowerCase();
      const res = await verifyEmailPin(cleanEmail, enteredPin);

      if (res.success) {
        // Guardar perfil verificado en la bóveda
        const profile = userProfileService.saveUserProfile({
          firstName: fullName.trim(),
          email: cleanEmail,
          emailVerified: true,
          authProvider: 'email',
        });

        // Sincronización en la nube (silenciosa)
        try {
          const deterministicUid = `vault_${btoa(cleanEmail).replace(/=/g, '')}`;
          syncUserProfile(deterministicUid, {
            firstName: profile.firstName,
            email: profile.email,
            emailVerified: true,
            authProvider: 'email',
          }).catch(() => {});
        } catch {}

        showToast('¡Cuenta verificada con éxito!', 'success');
        // Pasa directamente a crear el PIN de 4 dígitos de la bóveda
        onComplete();
      } else {
        setErrorMsg(res.error || 'El código es incorrecto o ha expirado.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al validar el código.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Reenviar código al correo (Pantalla 2)
  const handleResendCode = async () => {
    if (isResending) return;
    setIsResending(true);
    setErrorMsg(null);

    try {
      const cleanEmail = emailInput.trim().toLowerCase();
      const res = await sendEmailPin(cleanEmail, fullName.trim());
      if (res.success) {
        const dest = res.targetEmail || cleanEmail;
        setActualTargetEmail(dest);
        if (res.testPin) {
          setSandboxPin(res.testPin);
        } else {
          setSandboxPin(null);
        }
        showToast(`Nuevo código enviado a ${dest}`, 'success');
        setPinDigits(['', '', '', '', '', '']);
        pinInputsRef.current[0]?.focus();
      } else {
        setErrorMsg(res.error || 'No se pudo reenviar el código.');
      }
    } catch {
      setErrorMsg('Error al reenviar el código.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col justify-center items-center px-6 py-10 select-none font-sans overflow-y-auto">
      {/* =========================================================================
          PANTALLA 1: REGISTRO (Exactamente como Imagen 1)
          ========================================================================= */}
      {step === 'register' && (
        <div className="w-full max-w-[340px] sm:max-w-[360px] flex flex-col items-center animate-in fade-in duration-200">
          {/* Ícono de candado con cajita azul cielo */}
          <div className="w-14 h-14 rounded-2xl bg-[#dbeafe] flex items-center justify-center text-[#2563eb] mb-3 shadow-xs">
            <Lock className="w-7 h-7 stroke-[2.4]" />
          </div>

          {/* Título y subtítulo */}
          <h1 className="text-[26px] font-bold text-[#111827] tracking-tight text-center">
            Mi bóveda
          </h1>
          <p className="text-[15px] text-[#4b5563] text-center mt-1 mb-6 max-w-[260px] leading-snug">
            Crea tu cuenta para guardar tus archivos
          </p>

          {/* Formulario de registro */}
          <form onSubmit={handleRegisterSubmit} className="w-full space-y-3.5">
            <div>
              <input
                type="text"
                autoComplete="name"
                placeholder="Nombre completo"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full h-[52px] px-4 rounded-xl border border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#111827] text-[15px] placeholder-[#9ca3af] outline-none transition-all bg-white"
              />
            </div>

            <div>
              <input
                type="email"
                autoComplete="email"
                placeholder="correo@ejemplo.com"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full h-[52px] px-4 rounded-xl border border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#111827] text-[15px] placeholder-[#9ca3af] outline-none transition-all bg-white"
              />
            </div>

            <div className="relative w-full">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Contraseña"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full h-[52px] px-4 pr-11 rounded-xl border border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#111827] text-[15px] placeholder-[#9ca3af] outline-none transition-all bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Mensaje de error */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs text-left animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Botón azul Registrarme */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-[52px] rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-medium text-[16px] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Enviando código...</span>
                </>
              ) : (
                <span>Registrarme</span>
              )}
            </button>
          </form>

          {/* Divisor con la "o" al centro */}
          <div className="relative my-6 w-full flex items-center justify-center">
            <div className="w-full border-t border-[#e5e7eb]" />
            <span className="absolute bg-white px-3 text-xs text-[#9ca3af] font-medium">
              o
            </span>
          </div>

          {/* Botón oficial Google (conecta al código protegido de Google) */}
          <button
            type="button"
            onClick={handleContinueWithGoogle}
            disabled={isLoadingNative}
            className="w-full h-[52px] rounded-xl bg-white hover:bg-[#f9fafb] active:bg-[#f3f4f6] border border-[#d1d5db] transition-all flex items-center justify-center gap-3 shadow-xs cursor-pointer disabled:opacity-70"
          >
            {isLoadingNative ? (
              <div className="flex items-center gap-2 text-[#1f2937] text-[15px] font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-[#2563eb]" />
                <span>Abriendo Google...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="text-[#1f2937] font-medium text-[15px]">
                  Iniciar sesión con Google
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* =========================================================================
          PANTALLA 2: ESCRIBE TU PIN (Exactamente como Imagen 2)
          ========================================================================= */}
      {step === 'verify_pin' && (
        <div className="w-full max-w-[340px] sm:max-w-[360px] flex flex-col items-center animate-in fade-in duration-200">
          {/* Ícono de sobre azul en círculo azul claro */}
          <div className="w-16 h-16 rounded-full bg-[#dbeafe] flex items-center justify-center text-[#2563eb] mb-4 shadow-xs">
            <Mail className="w-8 h-8 stroke-[2.2]" />
          </div>

          {/* Título y subtítulo */}
          <h2 className="text-[24px] font-bold text-[#111827] text-center tracking-tight">
            Escribe tu PIN
          </h2>
          <p className="text-[14px] text-[#4b5563] text-center mt-2 leading-relaxed">
            Te mandamos un código de 6 dígitos
            <br />
            a
            <br />
            <span className="font-semibold text-[#111827] break-all">
              {actualTargetEmail || emailInput}
            </span>
          </p>
          <p className="text-[12px] text-[#6b7280] text-center mt-1">
            (En Hotmail/Outlook revisa la carpeta <strong>Correo no deseado</strong> o pestaña <strong>Otros</strong>)
          </p>

          {/* Banner de código de verificación directo */}
          {sandboxPin && (
            <div className="w-full my-3 p-3 rounded-2xl bg-blue-50 border border-blue-200 text-center animate-in fade-in duration-200">
              <p className="text-[12px] text-blue-900 leading-snug font-medium mb-1.5">
                Si no encuentras el correo en tu bandeja o carpeta de spam, tu código es:
              </p>
              <div className="inline-flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-xl border border-blue-300 shadow-xs">
                <span className="font-mono font-bold text-lg text-blue-950 tracking-widest">
                  {sandboxPin}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPinDigits(sandboxPin.split(''));
                    setErrorMsg(null);
                  }}
                  className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] underline cursor-pointer ml-1"
                >
                  Rellenar PIN
                </button>
              </div>
            </div>
          )}

          {/* 6 Casillas para el código */}
          <div className="flex justify-center items-center gap-2 sm:gap-2.5 mt-4 mb-2">
            {pinDigits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  pinInputsRef.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(index, e)}
                onPaste={handlePinPaste}
                className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold text-[#111827] rounded-xl border border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 outline-none transition-all bg-white"
              />
            ))}
          </div>

          {/* Leyenda de caducidad */}
          <p className="text-[13px] text-[#6b7280] text-center mt-1 mb-5">
            El código vence en 10 minutos
          </p>

          {/* Mensaje de error si falla la verificación */}
          {errorMsg && (
            <div className="w-full p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs text-left mb-4 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Botón azul principal Verificar */}
          <button
            type="button"
            onClick={handleVerifyPin}
            disabled={isVerifying || pinDigits.join('').length !== 6}
            className="w-full h-[50px] rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-medium text-[16px] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verificando...</span>
              </>
            ) : (
              <span>Verificar</span>
            )}
          </button>

          {/* Botón blanco Reenviar código */}
          <button
            type="button"
            onClick={handleResendCode}
            disabled={isResending}
            className="w-full h-[50px] rounded-xl bg-white hover:bg-[#f9fafb] active:bg-[#f3f4f6] border border-[#d1d5db] text-[#374151] font-medium text-[15px] transition-all cursor-pointer mt-3 disabled:opacity-60"
          >
            {isResending ? 'Enviando código...' : 'Reenviar código'}
          </button>

          {/* Enlace azul Usar otro correo */}
          <button
            type="button"
            onClick={() => {
              setStep('register');
              setErrorMsg(null);
            }}
            className="text-[14px] text-[#1d4ed8] hover:underline font-medium mt-4 cursor-pointer"
          >
            Usar otro correo
          </button>
        </div>
      )}
    </div>
  );
};
