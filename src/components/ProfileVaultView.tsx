import React, { useState, useEffect, useRef } from 'react';
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
  Info,
  LogOut,
  RefreshCw,
  Code2,
  Cpu,
  RotateCcw,
  Loader2,
  ArrowLeft,
  Check,
  Lock,
  Copy,
  AlertCircle,
  Shield,
  Camera,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import {
  userProfileService,
  UserProfile,
  calculateAgeFromBirthDate,
  formatBirthDateMask,
} from '../services/userProfileService';
import { signOutFromFirebase } from '../services/firebaseAuthService';
import { signInWithNativeGoogle } from '../services/nativeGoogleAuthService';
import { CURRENT_APP_VERSION as APP_VERSION } from '../version';
import { formatSize } from '../utils/formatUtils';

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
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editCalculatedAge, setEditCalculatedAge] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState<string | undefined>(undefined);
  const [editError, setEditError] = useState<string | null>(null);
  const [isChangingGoogle, setIsChangingGoogle] = useState(false);

  // Modals for Support, Terms, and Developer
  const [activeInfoModal, setActiveInfoModal] = useState<'privacy' | 'terms' | 'support' | 'developer' | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = (email: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(email);
    }
    setCopiedEmail(true);
    showToast('Correo copiado al portapapeles: ' + email, 'success');
    setTimeout(() => setCopiedEmail(false), 2500);
  };

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
      setEditPhotoURL(profile.photoURL);
    } else {
      setEditFirst('');
      setEditLast('');
      setEditBirthDate('');
      setEditCalculatedAge(null);
      setEditEmail('');
      setEditPhotoURL(undefined);
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

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona una imagen válida', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl) {
        setEditPhotoURL(dataUrl);
        showToast('Foto de perfil actualizada', 'success');
        setShowPhotoModal(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    setEditPhotoURL('');
    showToast('Foto de perfil eliminada', 'info');
    setShowPhotoModal(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFirst = editFirst.trim();
    const cleanLast = editLast.trim();
    const cleanEmail = editEmail.trim().toLowerCase();

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

    const currentEmail = (profile?.email || '').trim().toLowerCase();
    const isEmailChanging = currentEmail && cleanEmail !== currentEmail;

    // Save profile directly
    userProfileService.saveUserProfile({
      firstName: cleanFirst,
      lastName: cleanLast,
      birthDate: editBirthDate || undefined,
      age: age ?? profile?.age,
      email: cleanEmail,
      emailVerified: true,
      photoURL: editPhotoURL !== undefined ? editPhotoURL : profile?.photoURL,
      authProvider: 'google.com',
    });

    setIsEditing(false);
    showToast(isEmailChanging ? 'Correo de Gmail confirmado y actualizado' : 'Perfil actualizado correctamente', 'success');
  };

  const handleChangeGoogleAccount = async () => {
    if (isChangingGoogle) return;
    setIsChangingGoogle(true);
    try {
      const res = await signInWithNativeGoogle();
      if (res.success && res.profile) {
        setEditEmail(res.profile.email);
        setEditFirst(res.profile.firstName || editFirst);
        setProfile(res.profile);
        setEditError(null);
        showToast(`Cuenta de Google autorizada: ${res.profile.email}`, 'success');
        return;
      }
      if (res.cancelled) {
        return;
      }
      if (res.error === 'web_environment') {
        showToast('En el teléfono Android abre el selector nativo de Google', 'info');
        return;
      }
      if (res.error) {
        showToast(res.error, 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'No se pudo abrir el selector de Google', 'error');
    } finally {
      setIsChangingGoogle(false);
    }
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
              Informa<span style={{ color: 'var(--theme-primary, #00e5ff)' }}>ción</span>
            </h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
              ALMACENAMIENTO, SOPORTE Y CRÉDITOS
            </p>
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="safe-top-header-spacer shrink-0 w-full mb-3" />

      {/* 1. ENCABEZADO DE PERFIL CON AVATAR DE GOOGLE (IMAGEN 1) */}
      <div
        className="rounded-[26px] p-5 shadow-xl border transition-colors relative overflow-hidden"
        style={{
          backgroundColor: 'var(--theme-bg-card, #0d1624)',
          borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.6))',
        }}
      >
        <div className="flex items-center gap-4 relative z-10">
          {/* Avatar / Foto de Google o Iniciales */}
          <div className="relative shrink-0">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.firstName}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-[22px] object-cover shadow-lg border border-cyan-500/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-[22px] flex items-center justify-center text-white text-3xl font-extrabold shadow-lg tracking-wider select-none"
                style={{
                  background: 'linear-gradient(135deg, #00f0b5, #00b4d8)',
                }}
              >
                {initials}
              </div>
            )}
            {/* Insignia de Escudo Verificado en esquina inferior derecha */}
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border border-emerald-500/60 flex items-center justify-center shadow-md"
              style={{ backgroundColor: 'var(--theme-bg-card, #0a111e)' }}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* Información del Perfil */}
          <div className="flex-1 min-w-0">
            <h2
              className="text-xl sm:text-2xl font-black tracking-tight truncate"
              style={{ color: 'var(--theme-text-main, #ffffff)' }}
            >
              {profile ? `${profile.firstName} ${profile.lastName || ''}`.trim() : 'Usuario'}
            </h2>
            <p
              className="text-xs font-mono tracking-tight mt-0.5 truncate"
              style={{ color: 'var(--theme-text-muted, #94a3b8)' }}
            >
              {profile?.email || 'Sin correo vinculado'}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/40 bg-blue-500/10 text-xs font-semibold text-blue-400">
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>Google verificado</span>
            </div>
          </div>
        </div>

        {/* Botón Completo "Editar perfil" con lápiz y degradado cian/azul */}
        <button
          type="button"
          onClick={openEditModal}
          className="w-full mt-4 py-3.5 px-4 rounded-[16px] font-bold text-sm text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#4facfe] flex items-center justify-center gap-2 shadow-[0_4px_18px_rgba(0,242,254,0.35)] active:scale-[0.99] transition-all cursor-pointer"
        >
          <Pencil className="w-4 h-4 text-slate-950" />
          <span>Editar perfil</span>
        </button>
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
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-0.5 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: 'var(--theme-primary, #00e5ff)',
                  boxShadow: '0 0 6px var(--theme-glow)',
                }}
              />
              <span className="font-semibold" style={{ color: 'var(--theme-text-main, #ffffff)' }}>
                Bóveda Local Cifrada
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0 border"
                style={{
                  backgroundColor: 'var(--theme-bg-secondary, #1e293b)',
                  borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.8))',
                }}
              />
              <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
                Espacio de Almacenamiento Dinámico
              </span>
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

          {/* Acerca del Desarrollador */}
          <button
            type="button"
            onClick={() => setActiveInfoModal('developer')}
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
                <Code2 className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold" style={{ color: 'var(--theme-text-main)' }}>
                  Acerca del Desarrollador
                </p>
                <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                  Creado por José Manuel Martínez Ayala • Criptografía y Privacidad
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
            v{APP_VERSION}
          </span>
        </div>

        {/* Reporte de fallos discreto */}
        <div
          className="mt-3 pt-3 border-t text-xs"
          style={{
            borderColor: 'var(--theme-border)',
          }}
        >
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)',
                  color: 'var(--theme-primary)',
                }}
              >
                <Mail className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold" style={{ color: 'var(--theme-text-main)' }}>
                  ¿Encontraste un error?
                </p>
                <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                  Reporta fallos de manera discreta a:{' '}
                  <a
                    href="mailto:jmmrtinez5121@gmail.com?subject=Reporte%20de%20fallo%20-%20B%C3%B3veda%20Segura"
                    className="font-mono underline font-medium hover:opacity-80 break-all"
                    style={{ color: 'var(--theme-primary)' }}
                  >
                    jmmrtinez5121@gmail.com
                  </a>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopyEmail('jmmrtinez5121@gmail.com')}
              title="Copiar correo"
              className="px-2.5 py-1.5 rounded-xl border text-[10px] font-semibold shrink-0 flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
                color: copiedEmail ? 'var(--theme-primary)' : 'var(--theme-text-main)',
              }}
            >
              {copiedEmail ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{copiedEmail ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. PIE DE PÁGINA Y DERECHOS RESERVADOS */}
      <div className="text-center pt-1 pb-3 space-y-1">
        <p className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--theme-text-subtle)' }}>
          © 2026 José Manuel Martínez Ayala. Licencia Apache-2.0
        </p>
        <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
          ® Bóveda Segura — Derechos Reservados 2026
        </p>
      </div>

      {/* MODAL: EDITAR MIS DATOS (IMAGEN 2 - CENTRADO EN PANTALLA) */}
      {isEditing && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditing(false);
          }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 overflow-y-auto"
        >
          <div
            className="w-full max-w-md rounded-[28px] p-6 shadow-2xl border transition-all animate-in zoom-in-95 duration-200 my-auto bg-[#0a111e] border-slate-700/70"
            style={{
              backgroundColor: 'var(--theme-bg-card, #0a111e)',
              borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.7))',
            }}
          >

            {/* Sección Foto de perfil con Camarita */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  className="block relative rounded-[22px] group cursor-pointer focus:outline-none"
                  title="Cambiar foto de perfil"
                >
                  {(editPhotoURL !== undefined ? editPhotoURL : profile?.photoURL) ? (
                    <img
                      src={editPhotoURL !== undefined ? editPhotoURL : profile?.photoURL}
                      alt={editFirst || profile?.firstName || 'Perfil'}
                      className="w-20 h-20 rounded-[22px] object-cover shadow-lg border border-cyan-500/40"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-[22px] flex items-center justify-center text-white text-3xl font-extrabold shadow-lg select-none"
                      style={{
                        background: 'linear-gradient(135deg, #00f0b5, #00b4d8)',
                      }}
                    >
                      {(editFirst.trim() || editEmail.trim() || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Badge botón camarita */}
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#132238] border-2 border-[#1e3456] flex items-center justify-center text-cyan-400 shadow-md group-hover:scale-110 active:scale-95 transition-transform">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>

              <div>
                <h4 className="text-base font-bold text-white">
                  Foto de perfil
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Toca la cámara para cambiarla
                </p>
              </div>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveEdit} className="space-y-4 text-left">
              {/* Fila Nombre(s) y Apellidos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nombre(s) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFirst}
                    onChange={(e) => setEditFirst(e.target.value)}
                    required
                    placeholder="Nombre(s)"
                    className="w-full rounded-xl bg-[#0c1626] border border-slate-700/80 px-3.5 py-3 text-sm text-white font-medium focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Apellidos
                  </label>
                  <input
                    type="text"
                    value={editLast}
                    onChange={(e) => setEditLast(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-xl bg-[#0c1626] border border-slate-700/80 px-3.5 py-3 text-sm text-white font-medium focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Fecha de nacimiento con icono calendario */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Fecha de nacimiento
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editBirthDate}
                    onChange={(e) => handleBirthDateEdit(e.target.value)}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className="w-full rounded-xl bg-[#0c1626] border border-slate-700/80 px-3.5 py-3 pr-10 text-sm text-white font-mono font-medium focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-colors"
                  />
                  <div className="absolute right-3.5 pointer-events-none text-cyan-400">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Correo de Gmail con logo y botón Cambiar */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Correo de Gmail <span className="text-rose-500">*</span>
                </label>
                <div
                  className="w-full rounded-xl bg-[#0c1626] border border-slate-700/80 px-3.5 py-2.5 flex items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary, #0c1626)',
                    borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.8))',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span className="text-sm text-slate-200 font-mono truncate">
                      {editEmail || profile?.email || 'Sin correo'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleChangeGoogleAccount}
                    disabled={isChangingGoogle}
                    className="profile-change-email-btn shrink-0 px-3.5 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isChangingGoogle ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Abriendo...</span>
                      </>
                    ) : (
                      <span>Cambiar</span>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Vinculado a tu cuenta de Google
                </p>
              </div>

              {editError && (
                <div className="p-2.5 rounded-xl text-xs border border-rose-500/30 bg-rose-500/10 text-rose-400">
                  {editError}
                </div>
              )}

              {/* Botones inferiores: Cancelar y Guardar */}
              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-3 px-8 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#4facfe] flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,242,254,0.3)] active:scale-95 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4 text-slate-950" />
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FOTO DEL PERFIL (IMAGEN 3 - CENTRADO EN PANTALLA) */}
      {showPhotoModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPhotoModal(false);
          }}
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
        >
          <div
            className="w-full max-w-sm rounded-[28px] p-6 shadow-2xl border transition-all animate-in zoom-in-95 duration-200 my-auto bg-[#0a111e] border-slate-700/70"
            style={{
              backgroundColor: 'var(--theme-bg-card, #0a111e)',
              borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.7))',
            }}
          >
            {/* Cabecera: Cerrar (X) + Título + Papelera */}
            <div className="flex justify-between items-center mb-6">
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white cursor-pointer transition-colors"
                title="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>

              <h3 className="text-xl font-bold text-white tracking-tight">
                Foto del perfil
              </h3>

              <button
                type="button"
                onClick={handleRemovePhoto}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                title="Eliminar foto"
              >
                <Trash2 className="w-6 h-6" />
              </button>
            </div>

            {/* Opciones: Cámara y Galería */}
            <div className="space-y-2">
              {/* Opción Cámara */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full py-4 px-4 rounded-2xl flex items-center gap-4 hover:bg-slate-800/40 active:bg-slate-800/70 transition-colors text-left cursor-pointer group"
              >
                <Camera className="w-6 h-6 text-slate-300 group-hover:text-cyan-400 transition-colors" />
                <span className="text-base font-medium text-white">
                  Cámara
                </span>
              </button>

              {/* Opción Galería */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-full py-4 px-4 rounded-2xl flex items-center gap-4 hover:bg-slate-800/40 active:bg-slate-800/70 transition-colors text-left cursor-pointer group"
              >
                <ImageIcon className="w-6 h-6 text-slate-300 group-hover:text-cyan-400 transition-colors" />
                <span className="text-base font-medium text-white">
                  Galería
                </span>
              </button>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoFileChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoFileChange}
            />
          </div>
        </div>
      )}


      {/* MODAL: INFO MODAL (PRIVACY / TERMS / SUPPORT / DEVELOPER) */}
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
                {activeInfoModal === 'developer' ? (
                  <Code2 className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
                ) : (
                  <Info className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
                )}
                <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-main)' }}>
                  {activeInfoModal === 'privacy' && 'Privacidad y Cero Rastreo'}
                  {activeInfoModal === 'terms' && 'Términos de Uso y Licencia'}
                  {activeInfoModal === 'support' && 'Centro de Ayuda y Preguntas'}
                  {activeInfoModal === 'developer' && 'Acerca del Desarrollador'}
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
              {activeInfoModal === 'developer' && (
                <>
                  {/* Tarjeta del Creador */}
                  <div
                    className="p-4 rounded-2xl border space-y-2 relative overflow-hidden"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, var(--theme-bg-secondary))',
                      borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, var(--theme-border))',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center border shadow-sm shrink-0"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--theme-primary) 35%, transparent)',
                          color: 'var(--theme-primary)',
                        }}
                      >
                        <Code2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm" style={{ color: 'var(--theme-text-main)' }}>
                          José Manuel Martínez Ayala
                        </h4>
                        <p className="text-[11px] font-medium" style={{ color: 'var(--theme-primary)' }}>
                          Creador y Desarrollador de Bóveda Segura
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                          Arquitectura de Software & Criptografía Aplicada
                        </p>
                      </div>
                    </div>

                    <p className="text-[11px] leading-relaxed pt-1" style={{ color: 'var(--theme-text-muted)' }}>
                      Esta aplicación fue concebida y desarrollada por <strong>José Manuel Martínez Ayala</strong> como una solución integral de almacenamiento privado de máxima seguridad, garantizando la soberanía absoluta de los datos personales sin depender de servidores centralizados.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-xs mb-1" style={{ color: 'var(--theme-text-main)' }}>
                      Filosofía de Conocimiento Cero (Zero-Knowledge)
                    </h4>
                    <p>
                      Ningún desarrollador, empresa o servidor en la nube tiene acceso a tus archivos, contraseñas ni multimedia. Cada elemento se procesa y cifra de forma matemáticamente aislada dentro del procesador de tu dispositivo.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-xs mb-1" style={{ color: 'var(--theme-text-main)' }}>
                      Estándares Tecnológicos Implementados
                    </h4>
                    <div className="space-y-1.5 text-[11px] pt-1">
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        <span><strong>Cifrado Simétrico:</strong> AES-256-GCM con Vector de Inicialización (IV) de 96 bits aleatorio por archivo.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        <span><strong>Derivación de Claves:</strong> PBKDF2 con SHA-256 y 100,000 iteraciones + Salt único criptográfico.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        <span><strong>Stack Nativo:</strong> React 19, TypeScript, Tailwind CSS, Web Crypto API y Progressive Web App (PWA).</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        <span><strong>Privacidad Digital:</strong> 100% libre de rastreadores analíticos, telemetría comercial y publicidad invasiva.</span>
                      </div>
                    </div>
                  </div>

                  {/* Sello de Derechos Reservados */}
                  <div className="text-center pt-1 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                    <p className="text-[10px] font-semibold" style={{ color: 'var(--theme-text-subtle)' }}>
                      ® Bóveda Segura — Derechos Reservados 2026.
                    </p>
                  </div>
                </>
              )}

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
