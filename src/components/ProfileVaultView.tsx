import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Calendar,
  Edit3,
  HardDrive,
  ShieldCheck,
  FileText,
  LifeBuoy,
  CheckCircle2,
  ChevronRight,
  X,
  Save,
  Image,
  Video,
  Music,
  Grid,
  Info,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import {
  userProfileService,
  UserProfile,
  calculateAgeFromBirthDate,
  formatBirthDateMask,
} from '../services/userProfileService';
import { signInWithGoogle, signOutFromFirebase } from '../services/firebaseAuthService';
import { CURRENT_APP_VERSION } from '../version';

interface ProfileVaultViewProps {
  counts: {
    photos: number;
    videos: number;
    audios: number;
    apps: number;
    totalBytes: number;
    photoBytes?: number;
    videoBytes?: number;
    audioBytes?: number;
    appBytes?: number;
  };
  showToast: (message: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
  onOpenSettings?: () => void;
}

export const ProfileVaultView: React.FC<ProfileVaultViewProps> = ({
  counts,
  showToast,
  onOpenSettings,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(() => userProfileService.getUserProfile());
  const [isEditing, setIsEditing] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editCalculatedAge, setEditCalculatedAge] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Modals for Support and Terms
  const [activeInfoModal, setActiveInfoModal] = useState<'privacy' | 'terms' | 'support' | null>(null);

  useEffect(() => {
    return userProfileService.subscribe((updated) => {
      setProfile(updated);
    });
  }, []);

  const openEditModal = () => {
    if (profile) {
      setEditFirst(profile.firstName);
      setEditLast(profile.lastName || '');
      setEditBirthDate(profile.birthDate || '');
      setEditCalculatedAge(profile.age || (profile.birthDate ? calculateAgeFromBirthDate(profile.birthDate) : null));
      setEditEmail(profile.email);
    } else {
      setEditFirst('');
      setEditLast('');
      setEditBirthDate('');
      setEditCalculatedAge(null);
      setEditEmail('');
    }
    setEditError(null);
    setIsEditing(true);
  };

  const handleBirthDateEdit = (val: string) => {
    const masked = formatBirthDateMask(val);
    setEditBirthDate(masked);
    setEditError(null);
    if (masked.length === 10) {
      const a = calculateAgeFromBirthDate(masked);
      setEditCalculatedAge(a);
    } else {
      setEditCalculatedAge(null);
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFirst = editFirst.trim();
    const cleanLast = editLast.trim();
    const cleanEmail = editEmail.trim();

    if (!cleanFirst) {
      setEditError('Ingresa tu(s) nombre(s).');
      return;
    }

    let age: number | undefined = undefined;
    if (editBirthDate) {
      if (editBirthDate.length !== 10) {
        setEditError('La fecha de nacimiento debe tener el formato DD/MM/AAAA.');
        return;
      }
      const calc = calculateAgeFromBirthDate(editBirthDate);
      if (calc === null || calc < 1 || calc > 120) {
        setEditError('Por favor, ingresa una fecha de nacimiento válida.');
        return;
      }
      age = calc;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setEditError('Ingresa un correo electrónico válido.');
      return;
    }

    userProfileService.saveUserProfile({
      firstName: cleanFirst,
      lastName: cleanLast,
      birthDate: editBirthDate || undefined,
      age: age ?? profile?.age,
      email: cleanEmail,
      emailVerified: profile?.emailVerified !== undefined ? profile.emailVerified : true,
      photoURL: profile?.photoURL,
      authProvider: profile?.authProvider,
    });

    setIsEditing(false);
    showToast('Perfil actualizado correctamente', 'success');
  };

  const handleConnectGoogle = async () => {
    setIsSyncingGoogle(true);
    try {
      const res = await signInWithGoogle();
      if (res.success && res.profile) {
        showToast('Cuenta de Google vinculada con éxito', 'success');
      } else {
        showToast(res.error || 'No se pudo vincular la cuenta de Google', 'error');
      }
    } catch {
      showToast('Error al conectar con Google', 'error');
    } finally {
      setIsSyncingGoogle(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const totalItems = counts.photos + counts.videos + counts.audios + counts.apps;
  const initials = userProfileService.getInitials(profile);

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-[max(calc(env(safe-area-inset-bottom,0px)+4.75rem),5rem)] animate-in fade-in duration-200 select-none box-border space-y-4">
      {/* Fixed Pinned Header */}
      <header
        className="fixed top-0 left-0 right-0 z-30 [backdrop-filter:blur(24px)] backdrop-blur-xl border-b safe-top-sticky pb-3 px-4 shadow-md transition-all"
        style={{
          backgroundColor: 'var(--theme-bg-header, rgba(6, 11, 20, 0.94))',
          borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.8))',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-0.5" style={{ color: 'var(--theme-text-main, #ffffff)' }}>
              Mi <span style={{ color: 'var(--theme-primary, #00e5ff)' }}>Perfil</span>
            </h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
              DATOS PERSONALES Y RESUMEN GENERAL
            </p>
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="safe-top-header-spacer shrink-0 w-full mb-3" />

      {/* 1. ENCABEZADO DE PERFIL CON AVATAR DE GOOGLE */}
      <div
        className="rounded-3xl p-5 sm:p-6 shadow-xl border transition-colors relative overflow-hidden"
        style={{
          backgroundColor: 'var(--theme-bg-card)',
          borderColor: 'var(--theme-border)',
        }}
      >
        {/* Glow ambient background accent */}
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: 'var(--theme-primary)' }}
        />

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 relative z-10 text-center sm:text-left">
          {/* Avatar / Foto de Google o Iniciales */}
          <div className="relative group">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.firstName}
                className="w-20 h-20 sm:w-22 sm:h-22 rounded-3xl object-cover shadow-xl border-2"
                style={{
                  borderColor: 'var(--theme-border)',
                  boxShadow: '0 8px 24px -4px var(--theme-glow)',
                }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-20 h-20 sm:w-22 sm:h-22 rounded-3xl flex items-center justify-center text-white text-2xl font-black shadow-xl tracking-wider select-none border-2"
                style={{
                  background: profile?.avatarColor || 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                  borderColor: 'var(--theme-border)',
                  boxShadow: '0 8px 24px -4px var(--theme-glow)',
                }}
              >
                {initials}
              </div>
            )}
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 shadow-sm"
              style={{
                backgroundColor: 'var(--theme-bg-card)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>

          {/* Información del Perfil */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2
                  className="text-xl sm:text-2xl font-black tracking-tight"
                  style={{ color: 'var(--theme-text-main)' }}
                >
                  {profile ? `${profile.firstName} ${profile.lastName || ''}`.trim() : 'Usuario de la Bóveda'}
                </h2>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1.5">
                  {/* Google Badge */}
                  {profile?.authProvider === 'google.com' ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border shadow-sm"
                      style={{
                        backgroundColor: 'rgba(66, 133, 244, 0.1)',
                        borderColor: 'rgba(66, 133, 244, 0.3)',
                        color: '#3b82f6',
                      }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                      </svg>
                      <span>Google Verificado</span>
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        borderColor: 'rgba(16, 185, 129, 0.25)',
                        color: '#059669',
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>Correo Verificado</span>
                    </span>
                  )}

                  {/* Age Badge (only if user provided birth date) */}
                  {profile?.age && profile.age > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                        color: 'var(--theme-primary)',
                      }}
                    >
                      <User className="w-3 h-3" />
                      <span>{profile.age} años</span>
                    </span>
                  ) : null}

                  {profile?.birthDate ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: 'var(--theme-bg-secondary)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text-muted)',
                      }}
                    >
                      <Calendar className="w-3 h-3" />
                      <span>{profile.birthDate}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center gap-2 mx-auto sm:mx-0">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 shadow-sm"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                >
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                  <span>Editar</span>
                </button>

                {profile?.authProvider !== 'google.com' && (
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={isSyncingGoogle}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 shadow-sm"
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#1f2937',
                      borderColor: '#e5e7eb',
                    }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGoogle ? 'animate-spin' : ''}`} />
                    <span>Conectar Google</span>
                  </button>
                )}
              </div>
            </div>

            {/* Correo Electrónico */}
            <div
              className="mt-3 pt-3 border-t flex items-center justify-center sm:justify-start gap-2 text-xs"
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text-muted)',
              }}
            >
              <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-primary)' }} />
              <span className="truncate font-mono">{profile?.email || 'Sin correo configurado'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TARJETA DE RESUMEN DE ALMACENAMIENTO */}
      <div
        className="rounded-3xl p-5 shadow-xl border transition-colors space-y-4"
        style={{
          backgroundColor: 'var(--theme-bg-card)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)',
                borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                color: 'var(--theme-primary)',
              }}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-main)' }}>
                Almacenamiento Protegido
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                Espacio utilizado en este dispositivo
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-base font-black font-mono" style={{ color: 'var(--theme-primary)' }}>
              {formatSize(counts.totalBytes)}
            </span>
            <p className="text-[10px]" style={{ color: 'var(--theme-text-subtle)' }}>
              {totalItems} archivos en total
            </p>
          </div>
        </div>

        {/* Barra Visual de Almacenamiento */}
        <div>
          <div
            className="w-full h-2.5 rounded-full overflow-hidden flex border"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div
              className="h-full transition-all duration-500 rounded-full"
              style={{
                width: totalItems > 0 ? '100%' : '0%',
                background: 'linear-gradient(90deg, var(--theme-primary), #2563eb)',
                boxShadow: '0 0 10px var(--theme-glow)',
              }}
            />
          </div>
          <div className="flex justify-between items-center mt-1.5 text-[10px]" style={{ color: 'var(--theme-text-subtle)' }}>
            <span>Bóveda Local Cifrada</span>
            <span>Espacio de Almacenamiento Dinámico</span>
          </div>
        </div>

        {/* Desglose de Categorías */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* Fotos */}
          <div
            className="p-3 rounded-2xl border flex items-center gap-2.5 transition-colors"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 flex items-center justify-center shrink-0">
              <Image className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold truncate" style={{ color: 'var(--theme-text-main)' }}>Fotos</p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                {counts.photos} {counts.photos === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          {/* Videos */}
          <div
            className="p-3 rounded-2xl border flex items-center gap-2.5 transition-colors"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold truncate" style={{ color: 'var(--theme-text-main)' }}>Videos</p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                {counts.videos} {counts.videos === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          {/* Audios */}
          <div
            className="p-3 rounded-2xl border flex items-center gap-2.5 transition-colors"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center shrink-0">
              <Music className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold truncate" style={{ color: 'var(--theme-text-main)' }}>Audios</p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                {counts.audios} {counts.audios === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          {/* Apps */}
          <div
            className="p-3 rounded-2xl border flex items-center gap-2.5 transition-colors"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <Grid className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold truncate" style={{ color: 'var(--theme-text-main)' }}>Apps</p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                {counts.apps} {counts.apps === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SECCIÓN DE SOPORTE, TÉRMINOS Y LICENCIA */}
      <div
        className="rounded-3xl p-5 shadow-xl border transition-colors space-y-3"
        style={{
          backgroundColor: 'var(--theme-bg-card)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <h3
          className="text-xs font-bold uppercase tracking-wider px-1"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          Soporte y Legal
        </h3>

        <div className="space-y-1.5">
          {/* Privacidad Total */}
          <button
            type="button"
            onClick={() => setActiveInfoModal('privacy')}
            className="w-full p-3.5 rounded-2xl border flex items-center justify-between transition-colors cursor-pointer group"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center border"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--theme-primary) 25%, transparent)',
                  color: 'var(--theme-primary)',
                }}
              >
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold" style={{ color: 'var(--theme-text-main)' }}>
                  Privacidad y Cero Rastreo
                </p>
                <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                  Cifrado militar local en tu dispositivo
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--theme-text-subtle)' }} />
          </button>

          {/* Términos y Licencia */}
          <button
            type="button"
            onClick={() => setActiveInfoModal('terms')}
            className="w-full p-3.5 rounded-2xl border flex items-center justify-between transition-colors cursor-pointer group"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center border"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--theme-primary) 25%, transparent)',
                  color: 'var(--theme-primary)',
                }}
              >
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold" style={{ color: 'var(--theme-text-main)' }}>
                  Términos de Uso y Licencia
                </p>
                <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                  Licencia Apache-2.0 de software seguro
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--theme-text-subtle)' }} />
          </button>

          {/* Asistencia y Soporte */}
          <button
            type="button"
            onClick={() => setActiveInfoModal('support')}
            className="w-full p-3.5 rounded-2xl border flex items-center justify-between transition-colors cursor-pointer group"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center border"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--theme-primary) 25%, transparent)',
                  color: 'var(--theme-primary)',
                }}
              >
                <LifeBuoy className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold" style={{ color: 'var(--theme-text-main)' }}>
                  Centro de Ayuda y Preguntas
                </p>
                <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                  Recuperación de clave, respaldo y dudas
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--theme-text-subtle)' }} />
          </button>
        </div>

        {/* Versión de la App */}
        <div
          className="mt-4 pt-3 border-t flex items-center justify-between text-[11px]"
          style={{
            borderColor: 'var(--theme-border)',
            color: 'var(--theme-text-subtle)',
          }}
        >
          <span>Versión Instalada</span>
          <span className="font-mono font-bold" style={{ color: 'var(--theme-text-main)' }}>
            v{CURRENT_APP_VERSION}
          </span>
        </div>
      </div>

      {/* MODAL: EDITAR PERFIL */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-3xl p-6 shadow-2xl border transition-all"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text-main)',
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                    color: 'var(--theme-primary)',
                  }}
                >
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-main)' }}>
                  Editar Mis Datos
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-left">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--theme-text-main)' }}>
                  Nombre(s) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFirst}
                  onChange={(e) => setEditFirst(e.target.value)}
                  required
                  className="w-full rounded-xl px-3.5 py-2.5 text-xs font-medium border outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--theme-bg-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--theme-text-main)' }}>
                  Apellidos (Opcional)
                </label>
                <input
                  type="text"
                  value={editLast}
                  onChange={(e) => setEditLast(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-xs font-medium border outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--theme-bg-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold" style={{ color: 'var(--theme-text-main)' }}>
                    Fecha de Nacimiento (Opcional)
                  </label>
                  {editCalculatedAge !== null && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-emerald-600"
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderColor: 'rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      {editCalculatedAge} años
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editBirthDate}
                  onChange={(e) => handleBirthDateEdit(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                  className="w-full rounded-xl px-3.5 py-2.5 text-xs font-mono font-medium border outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--theme-bg-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--theme-text-main)' }}>
                  Correo Electrónico <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="w-full rounded-xl px-3.5 py-2.5 text-xs font-medium border outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--theme-bg-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                />
              </div>

              {editError && (
                <div
                  className="p-2.5 rounded-xl text-xs border"
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    borderColor: 'rgba(244, 63, 94, 0.3)',
                    color: '#e11d48',
                  }}
                >
                  {editError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text-main)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                  style={{
                    background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                    boxShadow: '0 4px 14px -2px var(--theme-glow)',
                  }}
                >
                  <Save className="w-3.5 h-3.5 text-white" />
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INFO MODAL (PRIVACY / TERMS / SUPPORT) */}
      {activeInfoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl border transition-all max-h-[85vh] flex flex-col"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text-main)',
            }}
          >
            <div className="flex justify-between items-center pb-3 border-b mb-3" style={{ borderColor: 'var(--theme-border)' }}>
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
                <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-main)' }}>
                  {activeInfoModal === 'privacy' && 'Privacidad y Cero Rastreo'}
                  {activeInfoModal === 'terms' && 'Términos de Uso y Licencia'}
                  {activeInfoModal === 'support' && 'Centro de Ayuda y Preguntas'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3.5 text-xs pr-1 leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
              {activeInfoModal === 'privacy' && (
                <>
                  <div
                    className="p-3.5 rounded-2xl border"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.08)',
                      borderColor: 'rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    <p className="font-bold text-emerald-600 mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      100% Privado y en tu Teléfono
                    </p>
                    <p>
                      Esta aplicación no envía absolutamente ningún archivo, foto, video, contraseña ni dato personal a servidores externos ni en la nube.
                    </p>
                  </div>
                  <p>
                    Todo el cifrado se realiza matemáticamente en el procesador de tu dispositivo utilizando el algoritmo <strong>AES-256-GCM</strong> con derivación de claves PBKDF2 y sal aleatoria única.
                  </p>
                  <p>
                    Ni los creadores de la app, ni terceros, ni operadoras pueden acceder al contenido de tu bóveda sin tu PIN maestro.
                  </p>
                </>
              )}

              {activeInfoModal === 'terms' && (
                <>
                  <p>
                    <strong>Licencia de Software:</strong> Bóveda Segura se distribuye bajo términos de código abierto Apache-2.0.
                  </p>
                  <p>
                    <strong>Responsabilidad de la Clave:</strong> Al ser una aplicación con arquitectura de conocimiento cero (Zero-Knowledge), no existe una base de datos central de contraseñas.
                  </p>
                  <p>
                    Es tu responsabilidad conservar tu <strong>Clave de Respaldo Maestra de 16 caracteres</strong> para poder recuperar tu acceso si alguna vez olvidas tu PIN.
                  </p>
                </>
              )}

              {activeInfoModal === 'support' && (
                <>
                  <p className="font-semibold" style={{ color: 'var(--theme-text-main)' }}>
                    ¿Cómo recupero mi bóveda si olvido el PIN?
                  </p>
                  <p>
                    En la pantalla de bloqueo de la calculadora o PIN, mantén presionado el icono de bloqueo o selecciona &quot;¿Olvidaste tu PIN?&quot; e introduce tu Clave Maestra de 16 caracteres.
                  </p>
                  <p className="font-semibold pt-1" style={{ color: 'var(--theme-text-main)' }}>
                    ¿Cómo paso mi información a otro teléfono?
                  </p>
                  <p>
                    Ve a <strong>Ajustes &gt; Copia de Seguridad</strong> y descarga tu archivo cifrado <code>.vault</code>. Pásalo a tu nuevo teléfono e impórtalo usando tu misma clave o PIN.
                  </p>
                </>
              )}
            </div>

            <div className="pt-3 border-t mt-4" style={{ borderColor: 'var(--theme-border)' }}>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="w-full py-2.5 rounded-xl font-bold text-xs text-white cursor-pointer transition-all"
                style={{
                  background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                  boxShadow: '0 4px 14px -2px var(--theme-glow)',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
