import React, { useState } from 'react';
import { User, Mail, Calendar, ArrowRight, ShieldCheck, Sparkles, Lock, CheckCircle } from 'lucide-react';
import { userProfileService } from '../services/userProfileService';

interface InitialRegisterViewProps {
  onComplete: () => void;
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const InitialRegisterView: React.FC<InitialRegisterViewProps> = ({
  onComplete,
  showToast,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanAge = parseInt(age.trim(), 10);
    const cleanEmail = email.trim();

    if (!cleanFirst) {
      setError('Por favor, ingresa tu(s) nombre(s).');
      return;
    }
    if (!cleanLast) {
      setError('Por favor, ingresa tus apellidos.');
      return;
    }
    if (isNaN(cleanAge) || cleanAge <= 0 || cleanAge > 120) {
      setError('Ingresa una edad válida en números (ejemplo: 28).');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Ingresa un correo electrónico válido (ejemplo: usuario@correo.com).');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      userProfileService.saveUserProfile({
        firstName: cleanFirst,
        lastName: cleanLast,
        age: cleanAge,
        email: cleanEmail,
      });

      showToast(`¡Bienvenido(a), ${cleanFirst}! Perfil guardado con éxito.`, 'success');

      // Transition smoothly to PIN setup
      setTimeout(() => {
        onComplete();
      }, 300);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('No se pudo guardar la información local. Inténtalo de nuevo.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-200"
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
            <ShieldCheck className="w-9 h-9 sm:w-11 sm:h-11 text-white stroke-[2.2]" />
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
            <Sparkles className="w-3 h-3" />
            <span>Bienvenido a tu Bóveda Privada</span>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--theme-text-main)' }}
          >
            Registro Inicial
          </h1>
          <p
            className="text-xs sm:text-sm mt-1.5 max-w-xs mx-auto leading-relaxed"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Crea tu perfil local para personalizar tu espacio de máxima seguridad y cifrado.
          </p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-3xl p-5 sm:p-7 shadow-2xl border transition-colors backdrop-blur-sm"
          style={{
            backgroundColor: 'var(--theme-bg-card)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-medium border transition-all outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--theme-bg-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                />
              </div>
            </div>

            {/* Grid: Edad y Correo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Edad */}
              <div className="sm:col-span-1">
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  Edad <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <Calendar className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="120"
                    value={age}
                    onChange={(e) => {
                      setAge(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="25"
                    required
                    disabled={isSubmitting}
                    className="w-full rounded-2xl pl-10 pr-3 py-3 text-sm font-medium border transition-all outline-none focus:ring-2 text-center"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
              </div>

              {/* Correo Electrónico */}
              <div className="sm:col-span-2">
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  Correo Electrónico <span className="text-rose-500">*</span>
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
                    disabled={isSubmitting}
                    className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm font-medium border transition-all outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>
              </div>
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
                <span>{error}</span>
              </div>
            )}

            {/* Privacy notice banner */}
            <div
              className="p-3 rounded-2xl border text-xs flex items-start gap-2.5 transition-colors"
              style={{
                backgroundColor: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-primary)' }} />
              <div className="leading-relaxed text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                <strong style={{ color: 'var(--theme-text-main)' }}>100% Privado y Local:</strong> Tus datos se almacenan exclusivamente en este dispositivo y jamás se envían a ningún servidor externo.
              </div>
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                boxShadow: '0 8px 24px -4px var(--theme-glow)',
              }}
            >
              <span>Guardar y Continuar</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="mt-5 text-center flex items-center justify-center gap-1.5 text-[11px]" style={{ color: 'var(--theme-text-subtle)' }}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span>Configuración segura en 2 sencillos pasos</span>
        </div>
      </div>
    </div>
  );
};
