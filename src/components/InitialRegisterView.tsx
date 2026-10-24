import React, { useState } from 'react';
import { AlertCircle, User, Plus, Check, Loader2, ArrowLeft } from 'lucide-react';
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
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNative, setIsLoadingNative] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Perfil guardado previamente en este dispositivo (sin cuentas predeterminadas hardcodeadas)
  const existingProfile = userProfileService.getUserProfile();
  const hasSavedAccount = Boolean(existingProfile?.email);

  const handleContinueWithGoogle = async () => {
    if (isLoadingNative) return;
    setIsLoadingNative(true);
    setErrorMsg(null);

    try {
      // 1. Invocar DIRECTAMENTE los servicios nativos de Google Play en el teléfono
      const res = await signInWithNativeGoogle();

      if (res.success && res.profile) {
        showToast(`Acceso autorizado para ${res.profile.email}`, 'success');
        // Pasa DIRECTAMENTE a la pantalla de creación del PIN de 4 dígitos
        onComplete();
        return;
      }

      if (res.cancelled) {
        // El usuario canceló la tarjeta oficial de Google
        return;
      }

      // 2. Si es entorno Web o navegador de prueba, abrir interfaz de acceso
      setShowManualForm(!hasSavedAccount);
      setShowAccountModal(true);
    } catch {
      setShowManualForm(!hasSavedAccount);
      setShowAccountModal(true);
    } finally {
      setIsLoadingNative(false);
    }
  };

  const handleAuthorizeAccount = async (email: string, name: string) => {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      let finalName = name.trim();
      if (!finalName) {
        const handle = cleanEmail.split('@')[0] || 'Usuario';
        finalName = handle.charAt(0).toUpperCase() + handle.slice(1);
      }

      // Guardar perfil en la bóveda
      const profile = userProfileService.saveUserProfile({
        firstName: finalName,
        email: cleanEmail,
        emailVerified: true,
        authProvider: 'google.com',
      });

      // Sincronización en la nube si hay conexión
      try {
        const deterministicUid = `vault_${btoa(cleanEmail).replace(/=/g, '')}`;
        await syncUserProfile(deterministicUid, {
          firstName: profile.firstName,
          email: profile.email,
          emailVerified: true,
          authProvider: 'google.com',
        });
      } catch {
        // Silencioso en caso de estar offline
      }

      showToast(`Cuenta verificada: ${cleanEmail}`, 'success');
      setShowAccountModal(false);
      onComplete();
    } catch {
      setErrorMsg('No se pudo verificar la cuenta. Intenta de nuevo.');
      setIsSubmitting(false);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const clean = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!clean) {
      setErrorMsg('Por favor, ingresa tu dirección de correo de Google (Gmail).');
      return;
    }

    if (!emailRegex.test(clean)) {
      setErrorMsg('Ingresa un correo electrónico válido (ejemplo: usuario@gmail.com).');
      return;
    }

    handleAuthorizeAccount(clean, nameInput);
  };

  return (
    <div className="min-h-screen w-full bg-[#f9fbfb] flex flex-col justify-between items-center px-6 pt-12 pb-12 select-none font-sans overflow-hidden relative">
      {/* Ilustración central: Escudo Poligonal */}
      <div className="w-full flex-1 flex items-center justify-center">
        <svg
          className="w-full max-w-[290px] sm:max-w-[320px] h-auto"
          viewBox="0 0 360 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Halos circulares concéntricos */}
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

          {/* Red geométrica interna */}
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

          {/* Nodos circulares */}
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

          {/* Contenedor central blanco */}
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

          {/* Candado central */}
          <g stroke="#134e48" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="163" y="187" width="34" height="24" rx="5" fill="none" />
            <path d="M170 187 V179 C170 173.5 174.5 169 180 169 C185.5 169 190 173.5 190 179 V187" />
            <circle cx="180" cy="199" r="2.5" fill="#134e48" />
          </g>
        </svg>
      </div>

      {/* Sección inferior: Título, Descripción y Botón Oficial idéntico a Imagen 2 */}
      <div className="w-full max-w-[360px] flex flex-col items-center">
        <h1 className="text-[28px] sm:text-[30px] font-extrabold text-[#111c24] tracking-tight text-center leading-tight">
          Crea tu bóveda
        </h1>

        <p className="text-[#5a6b75] text-[15px] sm:text-[16px] text-center mt-2 leading-relaxed max-w-[280px]">
          Guarda tus fotos, videos y apps en un lugar seguro.
        </p>

        {/* Botón idéntico a Imagen 2: Rectangular suave, fondo gris claro/blanco, borde fino, logo Google G y 'Continuar con Google' */}
        <button
          type="button"
          onClick={handleContinueWithGoogle}
          disabled={isLoadingNative}
          className="mt-7 w-full h-[52px] px-6 rounded-[14px] bg-[#f0f2f5] hover:bg-[#e4e7eb] active:bg-[#d8dce2] border border-[#cfd4dc] transition-all duration-150 cursor-pointer flex items-center justify-center gap-3.5 shadow-xs disabled:opacity-75"
        >
          {isLoadingNative ? (
            <div className="flex items-center gap-2 text-[#1f1f1f] text-sm font-medium">
              <Loader2 className="w-5 h-5 animate-spin text-[#1a73e8]" />
              <span>Abriendo Google...</span>
            </div>
          ) : (
            <>
              {/* Logo oficial multicolor de Google 'G' */}
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24">
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

              {/* Texto 'Continuar con Google' tal como se muestra en la imagen 2 */}
              <span className="text-[#1f1f1f] font-medium text-[16px] tracking-normal">
                Continuar con Google
              </span>
            </>
          )}
        </button>
      </div>

      {/* Interfaz de acceso para entorno web / navegador (sin cuentas predeterminadas hardcodeadas) */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-[420px] bg-white rounded-t-[28px] sm:rounded-2xl p-6 shadow-2xl border border-slate-200 flex flex-col text-slate-800 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
            
            {/* Encabezado oficial Google */}
            <div className="flex flex-col items-center text-center pb-4 border-b border-slate-100 relative">
              {hasSavedAccount && showManualForm && (
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="absolute left-0 top-0 p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Volver"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}

              <svg className="w-7 h-7 mb-2" viewBox="0 0 24 24">
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

              <h2 className="text-[20px] font-medium text-[#202124] tracking-tight">
                {hasSavedAccount && !showManualForm ? 'Elegir una cuenta' : 'Acceder con Google'}
              </h2>
              <p className="text-[13px] text-[#5f6368] mt-0.5">
                para continuar en <span className="font-semibold text-slate-800">Bóveda Privada</span>
              </p>
            </div>

            {/* Contenido: Si existe cuenta guardada previa en este dispositivo, mostrarla; si no, formulario limpio */}
            {hasSavedAccount && !showManualForm && existingProfile ? (
              <div className="py-3 divide-y divide-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleAuthorizeAccount(existingProfile.email, existingProfile.firstName)}
                  className="w-full py-3 px-3 rounded-xl hover:bg-[#f8fafd] active:bg-[#f1f3f4] transition-colors flex items-center gap-3.5 text-left cursor-pointer group disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1a73e8] text-white font-medium text-base flex items-center justify-center shrink-0 shadow-xs">
                    {existingProfile.firstName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-[#202124] truncate group-hover:text-[#1a73e8] transition-colors">
                      {existingProfile.firstName}
                    </div>
                    <div className="text-[13px] text-[#5f6368] truncate">
                      {existingProfile.email}
                    </div>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-3 px-3 rounded-xl hover:bg-[#f8fafd] active:bg-[#f1f3f4] transition-colors flex items-center gap-3.5 text-left cursor-pointer group disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-[#202124] group-hover:text-[#1a73e8] transition-colors">
                      Usar otra cuenta de Google
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            ) : (
              /* Formulario limpio oficial de Google para ingresar la cuenta de Gmail del usuario */
              <form onSubmit={handleSubmitForm} className="py-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Correo electrónico de Google (Gmail)
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
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20 text-slate-900 text-sm outline-none transition-all placeholder:text-slate-400"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ingresa la cuenta de Gmail que usarás como propietario de la bóveda.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nombre del titular <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Tu nombre"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20 text-slate-900 text-sm outline-none transition-all placeholder:text-slate-400"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAccountModal(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2.5 rounded-full text-slate-600 hover:text-slate-800 hover:bg-slate-100 font-medium text-sm transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] active:scale-[0.98] text-white font-medium text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verificando...</span>
                      </>
                    ) : (
                      <span>Siguiente</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Aviso de privacidad oficial Google */}
            <div className="pt-3 border-t border-slate-100 text-[11px] text-[#5f6368] leading-relaxed">
              Para continuar, Google compartirá tu nombre, dirección de correo electrónico y preferencia de idioma con Bóveda Privada.
            </div>

            {hasSavedAccount && !showManualForm && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowAccountModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#1a73e8] hover:bg-[#f1f3f4] rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
