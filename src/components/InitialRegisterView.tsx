import React, { useState, useEffect } from 'react';
import { Lock, Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { userProfileService } from '../services/userProfileService';
import { syncUserProfile } from '../services/firebaseAuthService';
import { signInWithNativeGoogle } from '../services/nativeGoogleAuthService';
import {
  sendEmailPin,
  checkEmailConfirmationStatus,
  verifyMagicLink,
} from '../services/emailVerificationService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  // Campos del formulario principal (Nombre completo y Correo)
  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');

  // Estados de envío y espera de confirmación del enlace en el correo
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNative, setIsLoadingNative] = useState(false);
  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Finalizar registro y pasar a crear el PIN de 4 dígitos de la bóveda
  const completeRegistration = (email: string, name: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || 'Usuario';

    const profile = userProfileService.saveUserProfile({
      firstName: cleanName,
      email: cleanEmail,
      emailVerified: true,
      authProvider: 'email',
    });

    try {
      const deterministicUid = `vault_${btoa(cleanEmail).replace(/=/g, '')}`;
      syncUserProfile(deterministicUid, {
        firstName: profile.firstName,
        email: profile.email,
        emailVerified: true,
        authProvider: 'email',
      }).catch(() => {});
    } catch {}

    showToast('¡Correo confirmado con éxito!', 'success');
    onComplete();
  };

  // Escuchar en tiempo real cada 2 segundos si el usuario ya tocó el enlace en su correo
  useEffect(() => {
    if (!waitingConfirmation || !emailInput.trim()) return;

    const cleanEmail = emailInput.trim().toLowerCase();
    const interval = setInterval(async () => {
      const status = await checkEmailConfirmationStatus(cleanEmail, pendingToken);
      if (status.confirmed) {
        clearInterval(interval);
        completeRegistration(status.email || cleanEmail, status.firstName || fullName);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [waitingConfirmation, emailInput, fullName, pendingToken]);

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

  // Envío del enlace de confirmación al correo
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = fullName.trim();
    const cleanEmail = emailInput.trim().toLowerCase();

    if (!cleanName) {
      setErrorMsg('Por favor, ingresa tu nombre completo.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMsg('Por favor, ingresa un correo electrónico válido (ej. correo@ejemplo.com).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sendEmailPin(cleanEmail, cleanName);
      if (res.success) {
        if (res.token) {
          setPendingToken(res.token);
        }
        setWaitingConfirmation(true);
        showToast(`Enlace de confirmación enviado a ${cleanEmail}`, 'success');
      } else {
        setErrorMsg(res.error || 'No se pudo enviar el correo de confirmación.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al enviar el correo de confirmación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verificar manualmente si el usuario ya presionó el enlace
  const handleManualCheck = async () => {
    const cleanEmail = emailInput.trim().toLowerCase();
    const status = await checkEmailConfirmationStatus(cleanEmail, pendingToken);
    if (status.confirmed) {
      completeRegistration(status.email || cleanEmail, status.firstName || fullName);
      return;
    }
    if (pendingToken) {
      const res = await verifyMagicLink(pendingToken);
      if (res.success) {
        completeRegistration(res.email || cleanEmail, res.firstName || fullName);
        return;
      }
    }
    showToast('Aún no detectamos la confirmación. Abre el enlace en tu correo.', 'info');
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center px-4 py-8 bg-[#f8fafc]">
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

        {/* Formulario principal: Nombre completo y Correo */}
        <form onSubmit={handleRegisterSubmit} className="w-full space-y-3.5">
          <div>
            <input
              type="text"
              autoComplete="name"
              placeholder="Nombre completo"
              disabled={waitingConfirmation}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              className="w-full h-[52px] px-4 rounded-xl border border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#111827] text-[15px] placeholder-[#9ca3af] outline-none transition-all bg-white disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div>
            <input
              type="email"
              autoComplete="email"
              placeholder="correo@ejemplo.com"
              disabled={waitingConfirmation}
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              className="w-full h-[52px] px-4 rounded-xl border border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 text-[#111827] text-[15px] placeholder-[#9ca3af] outline-none transition-all bg-white disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          {/* Mensaje de error */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs text-left animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tarjeta en la misma pantalla cuando ya se envió el enlace al correo */}
          {waitingConfirmation ? (
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-center space-y-3 animate-in fade-in duration-200">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-[#2563eb]">
                <Mail className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-[#1e3a8a]">
                  Revisa tu correo electrónico
                </p>
                <p className="text-[12px] text-[#3b82f6] leading-relaxed">
                  Enviamos un enlace de confirmación a <strong>{emailInput.trim()}</strong>. Toca el botón dentro del correo y entrarás automáticamente.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-[12px] text-[#2563eb] font-medium py-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Esperando confirmación del enlace...</span>
              </div>

              <button
                type="button"
                onClick={handleManualCheck}
                className="w-full h-[44px] rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium text-[14px] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Ya confirmé mi correo</span>
              </button>

              <div className="flex items-center justify-between pt-1 px-1 text-[12px]">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="text-[#2563eb] hover:underline font-medium cursor-pointer"
                >
                  {isSubmitting ? 'Reenviando...' : 'Reenviar enlace'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWaitingConfirmation(false);
                    setErrorMsg(null);
                  }}
                  className="text-slate-500 hover:underline cursor-pointer"
                >
                  Cambiar correo
                </button>
              </div>
            </div>
          ) : (
            /* Botón azul Registrarme */
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-[52px] rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-medium text-[16px] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Enviando enlace...</span>
                </>
              ) : (
                <span>Registrarme</span>
              )}
            </button>
          )}
        </form>

        {/* Divisor con la "o" al centro */}
        <div className="relative my-6 w-full flex items-center justify-center">
          <div className="w-full border-t border-[#e5e7eb]" />
          <span className="absolute bg-[#f8fafc] px-3 text-xs text-[#9ca3af] font-medium">
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
    </div>
  );
};
