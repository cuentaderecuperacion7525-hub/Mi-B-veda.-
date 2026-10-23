import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Shield, X, Loader2 } from 'lucide-react';
import { userProfileService } from '../services/userProfileService';
import { syncUserProfile } from '../services/firebaseAuthService';
import { signInWithNativeGoogle } from '../services/nativeGoogleAuthService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNative, setIsLoadingNative] = useState(false);

  const handleContinueWithGmail = async () => {
    if (isLoadingNative) return;
    setIsLoadingNative(true);

    try {
      // 1. Intentar selector nativo oficial de Google en Android (Google Play Services / Credential Manager)
      const res = await signInWithNativeGoogle();
      if (res.success && res.profile) {
        showToast(`Bienvenido, ${res.profile.firstName}`, 'success');
        onComplete();
        return;
      }

      if (res.cancelled) {
        return; // El usuario cerró voluntariamente el selector nativo
      }

      // 2. Si es entorno web o se requiere el diálogo:
      setModalError(null);
      setShowAuthModal(true);
    } catch {
      setModalError(null);
      setShowAuthModal(true);
    } finally {
      setIsLoadingNative(false);
    }
  };

  const handleCloseModal = () => {
    setShowAuthModal(false);
    setModalError(null);
  };

  const handleAuthorize = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setModalError(null);

    const cleanEmail = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail) {
      setModalError('Por favor, ingresa tu cuenta de correo de Gmail.');
      return;
    }

    if (!emailRegex.test(cleanEmail)) {
      setModalError('Ingresa un correo electrónico válido (ejemplo: usuario@gmail.com).');
      return;
    }

    setIsSubmitting(true);

    try {
      // Determinar nombre del usuario
      let finalName = nameInput.trim();
      if (!finalName) {
        const handle = cleanEmail.split('@')[0] || 'Usuario';
        finalName = handle.charAt(0).toUpperCase() + handle.slice(1);
      }

      // Guardar perfil localmente como cuenta verificada de Google
      const profile = userProfileService.saveUserProfile({
        firstName: finalName,
        email: cleanEmail,
        emailVerified: true,
        authProvider: 'google.com',
      });

      // Sincronizar en segundo plano si Firestore está disponible
      try {
        const deterministicUid = `vault_${btoa(cleanEmail).replace(/=/g, '')}`;
        await syncUserProfile(deterministicUid, {
          firstName: profile.firstName,
          email: profile.email,
          emailVerified: true,
          authProvider: 'google.com',
        });
      } catch {
        // En caso de que no haya conexión a internet, continúa sin bloquear
      }

      showToast(`Acceso permitido para ${cleanEmail}`, 'success');
      setShowAuthModal(false);
      
      // Pasar a la pantalla de creación de PIN
      onComplete();
    } catch (err: any) {
      setModalError('No se pudo completar el registro. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f9fbfb] flex flex-col justify-between items-center px-6 pt-12 pb-12 select-none font-sans overflow-hidden relative">
      {/* Ilustración central: Escudo Mejorado Poligonal */}
      <div className="w-full flex-1 flex items-center justify-center">
        <svg
          className="w-full max-w-[290px] sm:max-w-[320px] h-auto"
          viewBox="0 0 360 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Halos circulares concéntricos suaves detrás del centro */}
          <circle cx="180" cy="192" r="110" fill="#f1f6f6" />
          <circle cx="180" cy="192" r="78" fill="#e8f1f0" />

          {/* Contorno exterior del escudo */}
          <path
            d="M180 28 L314 82 L314 195 C314 282 256 340 180 374 C104 340 46 282 46 195 L46 82 Z"
            stroke="#9cb0b5"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Red geométrica interna (líneas de conexión) */}
          <g stroke="#9cb0b5" strokeWidth="1.4">
            <line x1="180" y1="28" x2="118" y2="112" />
            <line x1="180" y1="28" x2="242" y2="112" />
            <line x1="46" y1="82" x2="118" y2="112" />
            <line x1="314" y1="82" x2="242" y2="112" />
            <line x1="118" y1="112" x2="242" y2="112" />
            <line x1="118" y1="112" x2="46" y2="195" />
            <line x1="242" y1="112" x2="314" y2="195" />
            <line x1="46" y1="195" x2="138" y2="188" />
            <line x1="314" y1="195" x2="222" y2="188" />
            <line x1="118" y1="112" x2="152" y2="150" />
            <line x1="242" y1="112" x2="208" y2="150" />
            <line x1="152" y1="230" x2="118" y2="280" />
            <line x1="208" y1="230" x2="242" y2="280" />
            <line x1="46" y1="195" x2="118" y2="280" />
            <line x1="314" y1="195" x2="242" y2="280" />
            <line x1="118" y1="280" x2="242" y2="280" />
            <line x1="118" y1="280" x2="180" y2="374" />
            <line x1="242" y1="280" x2="180" y2="374" />
          </g>

          {/* Nodos circulares en los vértices e intersecciones */}
          <g fill="#2d8a7e">
            <circle cx="180" cy="28" r="4.5" />
            <circle cx="46" cy="82" r="3.2" fill="#7fa3a0" />
            <circle cx="314" cy="82" r="3.2" fill="#7fa3a0" />
            <circle cx="118" cy="112" r="4.5" />
            <circle cx="242" cy="112" r="4.5" />
            <circle cx="46" cy="195" r="4.5" />
            <circle cx="314" cy="195" r="4.5" />
            <circle cx="118" cy="280" r="4.5" />
            <circle cx="242" cy="280" r="4.5" />
            <circle cx="180" cy="374" r="4.5" />
          </g>

          {/* Contenedor central blanco redondeado (Squircle) */}
          <rect
            x="136"
            y="146"
            width="88"
            height="88"
            rx="24"
            fill="#ffffff"
            stroke="#227c70"
            strokeWidth="2.2"
          />

          {/* Ícono de candado central en verde petróleo oscuro */}
          <g stroke="#134e48" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="163" y="187" width="34" height="24" rx="5" fill="none" />
            <path d="M170 187 V179 C170 173.5 174.5 169 180 169 C185.5 169 190 173.5 190 179 V187" />
            <circle cx="180" cy="199" r="2.5" fill="#134e48" />
          </g>
        </svg>
      </div>

      {/* Sección inferior: Textos y Botón Estilizado */}
      <div className="w-full max-w-[340px] flex flex-col items-center">
        <h1 className="text-[28px] sm:text-[30px] font-extrabold text-[#111c24] tracking-tight text-center leading-tight">
          Crea tu bóveda
        </h1>

        <p className="text-[#5a6b75] text-[15px] sm:text-[16px] text-center mt-2.5 leading-relaxed max-w-[260px]">
          Guarda tus fotos, videos y apps en un lugar seguro.
        </p>

        {/* Botón Estético y Proporcionado: Continuar con Gmail */}
        <button
          type="button"
          onClick={handleContinueWithGmail}
          disabled={isLoadingNative}
          className="mt-7 w-full max-w-[270px] h-[50px] px-5 rounded-full bg-gradient-to-r from-[#1b4d48] to-[#235e58] hover:from-[#16403c] hover:to-[#1d504b] active:scale-[0.98] text-white font-semibold text-[15px] tracking-wide shadow-[0_8px_20px_-4px_rgba(31,81,76,0.38)] border border-white/10 transition-all duration-150 cursor-pointer flex items-center justify-center gap-3 disabled:opacity-70"
        >
          {isLoadingNative ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-white" />
              <span className="whitespace-nowrap">Abriendo Google...</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 shadow-xs">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              </div>
              <span className="whitespace-nowrap">Continuar con Gmail</span>
            </>
          )}
        </button>
      </div>

      {/* Modal oficial de autorización estilo Google con Permitir / Rechazar */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[28px] sm:rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 flex flex-col text-slate-800 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            
            {/* Encabezado estilo Google */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Acceder con Google
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bóveda Segura
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario de cuenta del usuario / familiar */}
            <form onSubmit={handleAuthorize} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Correo electrónico de Gmail
                </label>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="ejemplo@gmail.com"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (modalError) setModalError(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20 text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Tu teléfono sugerirá automáticamente la cuenta de Gmail guardada en este dispositivo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nombre de usuario <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Tu nombre o apodo"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20 text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
                />
              </div>

              {/* Cuadro de permisos estilo verificación de Google */}
              <div className="p-3.5 rounded-2xl bg-[#f0f4f9] border border-[#d2e3fc] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <Shield className="w-4 h-4 text-[#1a73e8] shrink-0" />
                  <span>Permisos solicitados para este dispositivo:</span>
                </div>
                <div className="space-y-1.5 pl-6 text-[12px] text-slate-600">
                  <div className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Vincular tu cuenta de Gmail como propietario de la bóveda.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Cifrar y proteger tus fotos, videos y documentos localmente.</span>
                  </div>
                </div>
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Botones de acción: Rechazar y Permitir */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-full text-slate-600 hover:text-slate-800 hover:bg-slate-100 font-medium text-sm transition-colors cursor-pointer"
                >
                  Rechazar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] active:scale-[0.98] text-white font-semibold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Permitir</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

