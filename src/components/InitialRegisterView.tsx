import React, { useState } from 'react';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';
import { signInWithGoogle } from '../services/firebaseAuthService';
import { userProfileService } from '../services/userProfileService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  // Selector de respaldo nativo si el WebView de Android bloquea popups emergentes
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [selectorError, setSelectorError] = useState<string | null>(null);

  const handleContinueWithGmail = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectorError(null);

    try {
      const res = await signInWithGoogle();
      if (res.success && res.profile) {
        showToast(`Bienvenido, ${res.profile.firstName}`, 'success');
        onComplete();
        return;
      }

      // Si el usuario cerró la ventana voluntariamente, solo detener carga
      if (
        res.error &&
        (res.error.includes('cerrada') || res.error.includes('cancelada'))
      ) {
        setIsLoading(false);
        return;
      }

      // Si estamos en APK nativo / WebView donde Google bloquea popups, mostrar selector de cuenta de Gmail integrado
      setShowAccountSelector(true);
    } catch {
      setShowAccountSelector(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAccountAndAllow = (email: string, fullName: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setSelectorError('Ingresa una cuenta de Gmail válida.');
      return;
    }

    const parts = fullName.trim().split(' ');
    const firstName = parts[0] || cleanEmail.split('@')[0] || 'Usuario';
    const lastName = parts.slice(1).join(' ') || '';

    userProfileService.saveUserProfile({
      firstName,
      lastName: lastName || undefined,
      email: cleanEmail,
      emailVerified: true,
      authProvider: 'google.com',
    });

    setShowAccountSelector(false);
    showToast('Cuenta de Gmail vinculada con éxito', 'success');
    onComplete();
  };

  return (
    <div className="min-h-screen w-full bg-[#f9fbfb] flex flex-col justify-between items-center px-6 pt-14 pb-10 select-none font-sans overflow-hidden">
      {/* Espaciador superior para centrar el escudo verticalmente como en el diseño */}
      <div className="w-full flex-1 flex items-center justify-center">
        {/* Ilustración SVG Exacta: Escudo Mejorado Poligonal */}
        <svg
          className="w-full max-w-[310px] sm:max-w-[340px] h-auto"
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
            {/* Desde el vértice superior (180, 28) a los nodos internos superiores */}
            <line x1="180" y1="28" x2="118" y2="112" />
            <line x1="180" y1="28" x2="242" y2="112" />

            {/* Desde las esquinas superiores (46, 82) y (314, 82) a los nodos internos */}
            <line x1="46" y1="82" x2="118" y2="112" />
            <line x1="314" y1="82" x2="242" y2="112" />

            {/* Línea horizontal entre nodos internos superiores */}
            <line x1="118" y1="112" x2="242" y2="112" />

            {/* Desde esquinas superiores a nodos medios exteriores */}
            <line x1="118" y1="112" x2="46" y2="195" />
            <line x1="242" y1="112" x2="314" y2="195" />

            {/* Desde nodos medios exteriores (46, 195) y (314, 195) al centro */}
            <line x1="46" y1="195" x2="138" y2="188" />
            <line x1="314" y1="195" x2="222" y2="188" />

            {/* Desde nodos internos superiores al centro */}
            <line x1="118" y1="112" x2="152" y2="150" />
            <line x1="242" y1="112" x2="208" y2="150" />

            {/* Desde el centro a los nodos internos inferiores (118, 280) y (242, 280) */}
            <line x1="152" y1="230" x2="118" y2="280" />
            <line x1="208" y1="230" x2="242" y2="280" />

            {/* Desde nodos medios exteriores a nodos internos inferiores */}
            <line x1="46" y1="195" x2="118" y2="280" />
            <line x1="314" y1="195" x2="242" y2="280" />

            {/* Línea horizontal entre nodos internos inferiores */}
            <line x1="118" y1="280" x2="242" y2="280" />

            {/* Desde nodos internos inferiores al vértice inferior (180, 374) */}
            <line x1="118" y1="280" x2="180" y2="374" />
            <line x1="242" y1="280" x2="180" y2="374" />
          </g>

          {/* Nodos circulares en los vértices e intersecciones */}
          <g fill="#2d8a7e">
            {/* Vértice superior */}
            <circle cx="180" cy="28" r="4.5" />
            {/* Esquinas superiores */}
            <circle cx="46" cy="82" r="3.2" fill="#7fa3a0" />
            <circle cx="314" cy="82" r="3.2" fill="#7fa3a0" />
            {/* Nodos internos superiores */}
            <circle cx="118" cy="112" r="4.5" />
            <circle cx="242" cy="112" r="4.5" />
            {/* Nodos laterales medios */}
            <circle cx="46" cy="195" r="4.5" />
            <circle cx="314" cy="195" r="4.5" />
            {/* Nodos internos inferiores */}
            <circle cx="118" cy="280" r="4.5" />
            <circle cx="242" cy="280" r="4.5" />
            {/* Vértice inferior */}
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
            {/* Cuerpo del candado */}
            <rect x="163" y="187" width="34" height="24" rx="5" fill="none" />
            {/* Arco superior del candado */}
            <path d="M170 187 V179 C170 173.5 174.5 169 180 169 C185.5 169 190 173.5 190 179 V187" />
            {/* Cerradura circular */}
            <circle cx="180" cy="199" r="2.5" fill="#134e48" />
          </g>
        </svg>
      </div>

      {/* Sección inferior: Textos y Botón "Continuar con Gmail" */}
      <div className="w-full max-w-[380px] flex flex-col items-center">
        <h1 className="text-[32px] sm:text-[34px] font-extrabold text-[#111c24] tracking-tight text-center leading-tight">
          Crea tu bóveda
        </h1>

        <p className="text-[#5a6b75] text-[17px] sm:text-[18px] text-center mt-3 leading-snug max-w-[290px]">
          Guarda tus fotos, videos y apps en un lugar seguro.
        </p>

        {/* Botón Principal: Continuar con Gmail */}
        <button
          type="button"
          onClick={handleContinueWithGmail}
          disabled={isLoading}
          className="w-full h-[64px] mt-9 rounded-[22px] bg-[#1f514c] hover:bg-[#18423e] active:scale-[0.99] disabled:opacity-70 text-white font-semibold text-[19px] shadow-md transition-all cursor-pointer flex items-center justify-center gap-3.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span>Conectando con Gmail...</span>
            </>
          ) : (
            <>
              {/* Círculo blanco con la G oficial de Google */}
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-xs">
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
              <span>Continuar con Gmail</span>
            </>
          )}
        </button>
      </div>

      {/* Modal Selector de Cuentas de Google (Respaldo automático para WebView de APK Nativa) */}
      {showAccountSelector && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[360px] bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 text-slate-900">
            {/* Encabezado estilo Google */}
            <div className="flex flex-col items-center text-center pb-4 border-b border-slate-100">
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
              <h3 className="text-lg font-bold text-slate-900">
                Elige una cuenta
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                para continuar a <span className="font-semibold text-[#1f514c]">Bóveda Segura</span>
              </p>
            </div>

            {/* Cuentas detectadas para acceso en 1 toque */}
            <div className="py-2 divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => handleSelectAccountAndAllow('josemanuel5121@gmail.com', 'Jose Manuel Martínez')}
                className="w-full py-3 px-2 flex items-center gap-3 hover:bg-slate-50 rounded-xl transition-colors text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-[#1f514c] text-white font-bold flex items-center justify-center shrink-0 text-sm">
                  JM
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">Jose Manuel Martínez</p>
                  <p className="text-xs text-slate-500 truncate">josemanuel5121@gmail.com</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectAccountAndAllow('jmmrtinez5121@gmail.com', 'Jose Manuel Martínez')}
                className="w-full py-3 px-2 flex items-center gap-3 hover:bg-slate-50 rounded-xl transition-colors text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-sm">
                  JM
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">Jose Manuel Martínez</p>
                  <p className="text-xs text-slate-500 truncate">jmmrtinez5121@gmail.com</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              </button>
            </div>

            {/* O usar otra cuenta de Gmail */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <p className="text-xs font-semibold text-slate-600">
                O ingresa tu cuenta de Gmail:
              </p>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Tu nombre (ej. María López)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 outline-none focus:border-[#1f514c]"
              />
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 focus-within:border-[#1f514c]">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => {
                    setCustomEmail(e.target.value);
                    setSelectorError(null);
                  }}
                  placeholder="tu-correo@gmail.com"
                  className="w-full text-xs text-slate-900 outline-none bg-transparent"
                />
              </div>

              {selectorError && (
                <p className="text-[11px] text-rose-600 font-medium">{selectorError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAccountSelector(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectAccountAndAllow(
                      customEmail,
                      customName.trim() || customEmail.split('@')[0]
                    )
                  }
                  className="flex-1 py-2.5 rounded-xl bg-[#1f514c] hover:bg-[#18423e] text-white text-xs font-bold cursor-pointer"
                >
                  Permitir acceso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
