import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import {
  signInWithGoogle,
  signInWithGoogleCredential,
  GOOGLE_OAUTH_CLIENT_ID,
} from '../services/firebaseAuthService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Asegurar que el script oficial de Google Identity Services esté listo en el dispositivo
  useEffect(() => {
    const initGsiIfAvailable = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_OAUTH_CLIENT_ID,
            ux_mode: 'popup',
            auto_select: false,
            cancel_on_tap_outside: true,
            callback: async (response) => {
              if (!response.credential) return;
              setIsLoading(true);
              setErrorMessage(null);
              const res = await signInWithGoogleCredential(response.credential);
              setIsLoading(false);
              if (res.success && res.profile) {
                showToast(`Cuenta verificada: ${res.profile.email}`, 'success');
                onComplete();
              } else if (res.error) {
                setErrorMessage(res.error);
              }
            },
          });
        } catch (err) {
          console.warn('GSI init warning:', err);
        }
      }
    };

    if (window.google?.accounts) {
      initGsiIfAvailable();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      );
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initGsiIfAvailable;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initGsiIfAvailable);
        return () => existingScript.removeEventListener('load', initGsiIfAvailable);
      }
    }
  }, [onComplete, showToast]);

  const waitForGoogleScript = async (timeoutMs = 4000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.google?.accounts?.oauth2) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return Boolean(window.google?.accounts?.oauth2);
  };

  const handleContinueWithGmail = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const ready = await waitForGoogleScript();
      if (!ready) {
        setErrorMessage(
          'No se pudo conectar con Google. Verifica tu conexión a internet e inténtalo de nuevo.'
        );
        setIsLoading(false);
        return;
      }

      const res = await signInWithGoogle();
      if (res.success && res.profile) {
        showToast(`Bienvenido, ${res.profile.firstName}`, 'success');
        onComplete();
        return;
      }

      if (res.error) {
        // No mostrar alerta roja si solo cerró la ventana voluntariamente
        if (
          res.error.includes('cerrada') ||
          res.error.includes('cancelad')
        ) {
          setIsLoading(false);
          return;
        }
        setErrorMessage(res.error);
      }
    } catch {
      setErrorMessage('Error al abrir el selector oficial de cuentas de Google.');
    } finally {
      setIsLoading(false);
    }
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
          onClick={handleContinueWithGmail}
          disabled={isLoading}
          className="mt-7 w-full max-w-[270px] h-[50px] px-5 rounded-full bg-gradient-to-r from-[#1b4d48] to-[#235e58] hover:from-[#16403c] hover:to-[#1d504b] active:scale-[0.98] disabled:opacity-70 text-white font-semibold text-[15px] tracking-wide shadow-[0_8px_20px_-4px_rgba(31,81,76,0.38)] border border-white/10 transition-all duration-150 cursor-pointer flex items-center justify-center gap-3"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-white" />
              <span className="whitespace-nowrap">Conectando con Google...</span>
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

        {errorMessage && (
          <div className="mt-4 w-full max-w-[290px] p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 leading-snug">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};
