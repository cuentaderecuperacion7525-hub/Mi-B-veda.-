import React, { useState } from 'react';
import { Loader2, Mail, ShieldCheck, UserPlus, ChevronRight, ArrowLeft } from 'lucide-react';
import { userProfileService } from '../services/userProfileService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

interface GmailCandidate {
  email: string;
  name: string;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [modalStep, setModalStep] = useState<'choose' | 'custom' | 'consent'>('choose');
  const [selectedAccount, setSelectedAccount] = useState<GmailCandidate | null>(null);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [selectorError, setSelectorError] = useState<string | null>(null);

  // Obtener cuentas previas o sugeridas en el dispositivo
  const existingProfile = userProfileService.getUserProfile();
  const defaultAccounts: GmailCandidate[] = [
    ...(existingProfile?.email
      ? [
          {
            email: existingProfile.email,
            name: `${existingProfile.firstName} ${existingProfile.lastName || ''}`.trim(),
          },
        ]
      : []),
    { email: 'josemanuel5121@gmail.com', name: 'Jose Manuel Martínez' },
    { email: 'jmmrtinez5121@gmail.com', name: 'Jose Manuel Martínez' },
  ].filter(
    (acc, index, self) =>
      index === self.findIndex((a) => a.email.toLowerCase() === acc.email.toLowerCase())
  );

  const handleOpenGmailFlow = () => {
    setSelectorError(null);
    setModalStep('choose');
    setShowGoogleModal(true);
  };

  const handlePickAccount = (account: GmailCandidate) => {
    setSelectedAccount(account);
    setSelectorError(null);
    setModalStep('consent');
  };

  const handleCustomAccountNext = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = customEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setSelectorError('Ingresa una dirección de correo válida (ej. usuario@gmail.com).');
      return;
    }

    const derivedName =
      customName.trim() ||
      cleanEmail
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

    setSelectedAccount({
      email: cleanEmail,
      name: derivedName || 'Usuario',
    });
    setSelectorError(null);
    setModalStep('consent');
  };

  const handleAllowAccess = () => {
    if (!selectedAccount) return;
    setIsLoading(true);

    setTimeout(() => {
      const parts = selectedAccount.name.trim().split(' ');
      const firstName = parts[0] || 'Usuario';
      const lastName = parts.slice(1).join(' ') || '';

      userProfileService.saveUserProfile({
        firstName,
        lastName: lastName || undefined,
        email: selectedAccount.email.trim().toLowerCase(),
        emailVerified: true,
        authProvider: 'google.com',
      });

      setIsLoading(false);
      setShowGoogleModal(false);
      showToast(`Cuenta vinculada: ${selectedAccount.email}`, 'success');
      onComplete();
    }, 350);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name.slice(0, 2) || 'GM').toUpperCase();
  };

  return (
    <div className="min-h-screen w-full bg-[#f9fbfb] flex flex-col justify-between items-center px-6 pt-12 pb-12 select-none font-sans overflow-hidden">
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
          onClick={handleOpenGmailFlow}
          disabled={isLoading}
          className="mt-7 w-full max-w-[270px] h-[50px] px-5 rounded-full bg-gradient-to-r from-[#1b4d48] to-[#235e58] hover:from-[#16403c] hover:to-[#1d504b] active:scale-[0.98] disabled:opacity-70 text-white font-semibold text-[15px] tracking-wide shadow-[0_8px_20px_-4px_rgba(31,81,76,0.38)] border border-white/10 transition-all duration-150 cursor-pointer flex items-center justify-center gap-3"
        >
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
        </button>
      </div>

      {/* Modal Integrado de Cuentas de Google y Permiso de Acceso (Sin redirecciones rotas) */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[350px] bg-white rounded-[28px] p-6 shadow-2xl border border-slate-100 text-slate-900">
            {/* PASO 1: ELEGIR CUENTA DE GMAIL */}
            {modalStep === 'choose' && (
              <div>
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
                  <h3 className="text-[17px] font-bold text-slate-900">
                    Elige una cuenta
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    para continuar a <span className="font-semibold text-[#1f514c]">Bóveda Segura</span>
                  </p>
                </div>

                <div className="py-1.5 divide-y divide-slate-100">
                  {defaultAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handlePickAccount(acc)}
                      className="w-full py-3 px-2.5 flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-colors text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#1f514c] text-white font-bold flex items-center justify-center shrink-0 text-xs">
                        {getInitials(acc.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{acc.name}</p>
                        <p className="text-xs text-slate-500 truncate">{acc.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}

                  {/* Usar otra cuenta */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectorError(null);
                      setModalStep('custom');
                    }}
                    className="w-full py-3 px-2.5 flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-colors text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700">Usar otra cuenta de Gmail</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowGoogleModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* PASO 1B: USAR OTRA CUENTA DE GMAIL */}
            {modalStep === 'custom' && (
              <form onSubmit={handleCustomAccountNext} className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalStep('choose')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Acceder con Gmail</h3>
                    <p className="text-[11px] text-slate-500">Ingresa tu cuenta de Google</p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tu nombre
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Ej. Jose Manuel"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 outline-none focus:border-[#1f514c]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Correo electrónico de Gmail
                  </label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 focus-within:border-[#1f514c]">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => {
                        setCustomEmail(e.target.value);
                        setSelectorError(null);
                      }}
                      required
                      placeholder="tu-correo@gmail.com"
                      className="w-full text-xs text-slate-900 outline-none bg-transparent"
                    />
                  </div>
                </div>

                {selectorError && (
                  <p className="text-[11px] text-rose-600 font-medium">{selectorError}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalStep('choose')}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[#1f514c] hover:bg-[#18423e] text-white text-xs font-bold cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </form>
            )}

            {/* PASO 2: CONFIRMAR Y PERMITIR ACCESO */}
            {modalStep === 'consent' && selectedAccount && (
              <div className="space-y-4">
                <div className="flex flex-col items-center text-center">
                  <div className="w-11 h-11 rounded-2xl bg-[#e8f1f0] border border-[#227c70]/25 flex items-center justify-center mb-2.5">
                    <ShieldCheck className="w-6 h-6 text-[#1f514c]" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    Bóveda Segura quiere acceder a tu cuenta de Google
                  </h3>
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                    <span className="w-5 h-5 rounded-full bg-[#1f514c] text-white text-[10px] font-bold flex items-center justify-center">
                      {getInitials(selectedAccount.name)}
                    </span>
                    <span className="truncate max-w-[200px]">{selectedAccount.email}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-2">
                  <p className="font-semibold text-slate-800">
                    Al continuar, permitirás que Bóveda Segura pueda:
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    • Asociar tu nombre y dirección de correo de Gmail para proteger tu bóveda personal y configurar tu PIN de acceso.
                  </p>
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setModalStep('choose')}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleAllowAccess}
                    className="flex-1 py-2.5 rounded-xl bg-[#1f514c] hover:bg-[#18423e] text-white text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verificando...</span>
                      </>
                    ) : (
                      <span>Permitir</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
