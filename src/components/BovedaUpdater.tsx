import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  RefreshCw,
  Download,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Shield,
  Clock,
  ArrowRight,
  Bell,
  Check,
  Smartphone,
  Globe
} from 'lucide-react';
import { getSafeAppVersionCode, downloadAndInstallApk, onDownloadProgress } from '../services/nativeUpdaterBridge';
import { updateService } from '../services/updateService';
import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER, CURRENT_RELEASE_DATE, CURRENT_CHANGELOG } from '../version';
import { NeonSwitch } from './NeonSwitch';

interface BovedaUpdaterProps {
  onOpenChangelog?: () => void;
  onNavigateToBackup?: () => void;
}

export const BovedaUpdater: React.FC<BovedaUpdaterProps> = ({ onOpenChangelog, onNavigateToBackup }) => {
  const cachedCheck = updateService.getLastCheckResult();
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(() => !!cachedCheck?.hasUpdate);
  const [downloadUrl, setDownloadUrl] = useState<string>(() => cachedCheck?.downloadUrl || '');
  const [serverVersionName, setServerVersionName] = useState<string>(() => cachedCheck?.latestVersion || '');
  const [serverVersionCode, setServerVersionCode] = useState<number>(() => cachedCheck?.buildNumber || 0);
  const [currentInstalledCode, setCurrentInstalledCode] = useState<number>(CURRENT_BUILD_NUMBER);
  const [installedVersionName, setInstalledVersionName] = useState<string>(CURRENT_APP_VERSION);
  const [loading, setLoading] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [downloadStage, setDownloadStage] = useState<string>('Iniciando canal seguro...');
  const [downloadSize, setDownloadSize] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [isNative, setIsNative] = useState<boolean>(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState<boolean>(() => !!cachedCheck);
  const [lastCheckTime, setLastCheckTime] = useState<string>(() => cachedCheck ? 'Reciente' : 'Al iniciar');
  const [activeChangelog, setActiveChangelog] = useState<string[]>(() => cachedCheck?.changelog || CURRENT_CHANGELOG);
  const [installCompleted, setInstallCompleted] = useState<boolean>(false);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(() => updateService.isAutoCheckEnabled());

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Formatear hora de última comprobación
  const getFormattedTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Toggle de avisos automáticos
  const handleToggleAutoCheck = (enabled: boolean) => {
    setAutoCheckUpdates(enabled);
    updateService.setAutoCheckEnabled(enabled);
  };

  // Lógica unificada de verificación
  const verificarActualizaciones = useCallback(async (esManual: boolean = false) => {
    setLoading(true);
    if (esManual) {
      setStatus('Escaneando GitHub Releases en busca de nuevas compilaciones...');
    }

    try {
      // 1. Obtener la versión instalada en el dispositivo
      let versionActual = CURRENT_BUILD_NUMBER;
      let nombreActual = CURRENT_APP_VERSION;
      try {
        const info = await getSafeAppVersionCode();
        if (info.versionCode) {
          versionActual = info.versionCode;
          setCurrentInstalledCode(versionActual);
        }
        if (info.versionName) {
          nombreActual = info.versionName;
          setInstalledVersionName(nombreActual);
        }
      } catch {
        setCurrentInstalledCode(CURRENT_BUILD_NUMBER);
      }

      // 2. Comprobar actualizaciones a través de updateService
      const res = await updateService.checkForUpdates(true);

      setServerVersionName(res.latestVersion);
      if (res.buildNumber) {
        setServerVersionCode(res.buildNumber);
      }
      if (res.changelog && res.changelog.length > 0) {
        setActiveChangelog(res.changelog);
      }
      setHasCheckedOnce(true);
      setLastCheckTime(getFormattedTime());

      if (res.hasUpdate) {
        setUpdateAvailable(true);
        setDownloadUrl(res.downloadUrl || '');
        setStatus(`Nueva versión v${res.latestVersion} lista para instalar.`);
      } else {
        setUpdateAvailable(false);
        if (esManual) {
          setStatus(`Tu aplicación está al día en la versión más reciente (v${nombreActual}, Build ${versionActual}).`);
        }
      }
    } catch (error: any) {
      setUpdateAvailable(false);
      setHasCheckedOnce(true);
      setLastCheckTime(getFormattedTime());
      if (esManual) {
        setStatus(error?.message || 'No se pudo conectar a GitHub. Revisa tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Comprobación inicial al montar
  useEffect(() => {
    verificarActualizaciones(false);
  }, [verificarActualizaciones]);

  // Ejecución de la descarga e instalación automática
  const ejecutarActualizacion = async () => {
    if (!downloadUrl) return;
    setIsInstalling(true);
    setInstallCompleted(false);
    setDownloadPercent(8);
    setDownloadStage('Conectando con GitHub Releases y canal seguro...');
    setDownloadSize('');

    let listenerHandle: { remove: () => void } | null = null;
    let progressTimer: any = null;

    try {
      listenerHandle = await onDownloadProgress((p) => {
        if (p && typeof p.percent === 'number') {
          const clamped = Math.min(Math.max(p.percent, 8), 98);
          setDownloadPercent(clamped);
          if (p.total > 0) {
            const loadedMb = (p.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = (p.total / (1024 * 1024)).toFixed(1);
            setDownloadSize(`${loadedMb} / ${totalMb} MB`);
          }
          if (clamped < 30) {
            setDownloadStage('Descargando paquete de actualización APK...');
          } else if (clamped < 75) {
            setDownloadStage('Transfiriendo archivos del sistema y componentes...');
          } else if (clamped < 95) {
            setDownloadStage('Comprobando firma criptográfica SHA-256...');
          } else {
            setDownloadStage('Finalizando descarga...');
          }
        }
      });

      progressTimer = setInterval(() => {
        setDownloadPercent((prev) => {
          if (prev < 92) {
            const step = prev < 35 ? 4 : (prev < 70 ? 3 : 1);
            const next = prev + step;
            if (next >= 30 && next < 65) {
              setDownloadStage('Descargando paquete de actualización APK...');
            } else if (next >= 65 && next < 88) {
              setDownloadStage('Verificando integridad y firma SHA-256...');
            } else if (next >= 88) {
              setDownloadStage('Preparando instalador de Android...');
            }
            return next;
          }
          return prev;
        });
      }, 350);

      const res = await downloadAndInstallApk(downloadUrl);

      clearInterval(progressTimer);
      setDownloadPercent(100);
      setInstallCompleted(true);
      setDownloadStage('¡Descarga completada! Abriendo instalador de Android...');
      setStatus(res.message || 'Instalador de Android abierto en pantalla. Confirma la instalación.');
    } catch (err: any) {
      clearInterval(progressTimer);
      setStatus(err.message || 'No se pudo completar la instalación automática.');
      setIsInstalling(false);
      setDownloadPercent(0);
      setInstallCompleted(false);
    } finally {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
      setTimeout(() => {
        if (!installCompleted) {
          setIsInstalling(false);
        }
      }, 6000);
    }
  };

  return (
    <div className="bg-[radial-gradient(circle_at_center,#111827_0%,#030712_100%)] p-4 sm:p-5 rounded-3xl space-y-4 sm:space-y-5 relative font-sans shadow-2xl border border-white/[0.05] box-border">
      {/* ======================================================== */}
      {/* TARJETA 1: ESTADO ACTUAL Y DATOS DE GITHUB               */}
      {/* ======================================================== */}
      <section className="bg-slate-900/40 backdrop-blur-lg border border-white/[0.08] border-t border-t-white/10 rounded-3xl p-4.5 sm:p-5 shadow-2xl shadow-black/40 space-y-4 relative overflow-hidden transition-all">
        {/* Encabezado de la tarjeta */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              ESTADO ACTUAL Y GITHUB
            </span>
            <h3 className="text-white text-base font-semibold truncate">
              {updateAvailable
                ? `Nueva versión v${serverVersionName || 'disponible'}`
                : 'Sistema actualizado y protegido'}
            </h3>
          </div>

          {updateAvailable ? (
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-400/30 flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              Actualización lista
            </span>
          ) : (
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
              Al día
            </span>
          )}
        </div>

        {/* Bloque de datos y métricas estilo cristal */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-950/40 border border-white/[0.06] rounded-2xl p-2.5 sm:p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 block font-medium">Versión instalada</span>
              <span className="text-white font-mono font-semibold truncate block">
                v{installedVersionName} ({currentInstalledCode})
              </span>
            </div>
          </div>

          <div className="bg-slate-950/40 border border-white/[0.06] rounded-2xl p-2.5 sm:p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 block font-medium">Servidor GitHub</span>
              <span className="text-emerald-300 font-semibold truncate block">En línea</span>
            </div>
          </div>
        </div>

        {/* Información adicional de última comprobación */}
        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/30 px-3.5 py-2 rounded-2xl border border-white/[0.04]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Última comprobación:</span>
          </div>
          <span className="text-slate-200 font-mono font-medium">{lastCheckTime}</span>
        </div>

        {/* Mensaje de estado cuando corresponda */}
        {status && (
          <div className={`p-3 rounded-2xl text-xs font-medium border leading-relaxed ${
            updateAvailable
              ? 'bg-blue-950/30 border-blue-500/30 text-blue-200'
              : 'bg-slate-950/40 border-white/[0.06] text-slate-300'
          }`}>
            {status}
          </div>
        )}

        {/* Barra de progreso de descarga si se está instalando */}
        {isInstalling && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-indigo-500/50 space-y-3 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
                <span className="font-semibold text-white">
                  {installCompleted ? '¡Actualización lista!' : 'Descargando paquete APK...'}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-400/30">
                {downloadPercent}%
              </span>
            </div>

            {/* Barra con reflejo */}
            <div className="w-full h-3 rounded-full bg-slate-900 border border-slate-700/80 p-0.5 overflow-hidden shadow-inner relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 transition-all duration-300 ease-out shadow-[0_0_12px_rgba(99,102,241,0.6)] relative overflow-hidden"
                style={{ width: `${Math.max(downloadPercent, 6)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse rounded-full" />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="truncate">{downloadStage}</span>
              {downloadSize && <span className="text-blue-300 font-bold shrink-0 ml-2">{downloadSize}</span>}
            </div>
          </div>
        )}

        {/* Botón de Acción Principal - Degradado suave de azul cobalto a violeta oscuro */}
        <div className="pt-1">
          {updateAvailable ? (
            <button
              type="button"
              onClick={ejecutarActualizacion}
              disabled={isInstalling}
              className="w-full py-4 px-5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 active:scale-[0.99] text-white font-bold rounded-2xl text-sm tracking-wide shadow-xl shadow-indigo-950/60 hover:shadow-indigo-900/70 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
            >
              <Download className={`w-4 h-4 ${isInstalling ? 'animate-bounce' : ''}`} />
              <span>
                {isInstalling ? 'Descargando e instalando...' : `Instalar Actualización v${serverVersionName || 'Nueva'}`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => verificarActualizaciones(true)}
              disabled={loading || isInstalling}
              className="w-full py-4 px-5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 active:scale-[0.99] text-white font-bold rounded-2xl text-sm tracking-wide shadow-xl shadow-indigo-950/60 hover:shadow-indigo-900/70 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Escaneando GitHub Releases...' : 'Buscar Actualizaciones'}</span>
            </button>
          )}
        </div>
      </section>

      {/* ======================================================== */}
      {/* TARJETA 2: LISTA DE NOVEDADES CON DISEÑO LIMPIO          */}
      {/* ======================================================== */}
      <section className="bg-slate-900/40 backdrop-blur-lg border border-white/[0.08] border-t border-t-white/10 rounded-3xl p-4.5 sm:p-5 shadow-2xl shadow-black/40 space-y-4 relative overflow-hidden transition-all">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              LISTA DE NOVEDADES
            </span>
            <h3 className="text-white text-base font-semibold flex items-center gap-2">
              <span>Versión v{serverVersionName || installedVersionName}</span>
              <span className="text-xs font-normal text-slate-400 font-mono">({CURRENT_RELEASE_DATE})</span>
            </h3>
          </div>
        </div>

        <ul className="space-y-2.5 pt-1">
          {activeChangelog.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3 text-xs text-slate-200 leading-relaxed">
              <div className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span className="flex-1">{item}</span>
            </li>
          ))}
        </ul>

        <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Tus fotos, notas y claves permanecen 100% cifradas e intactas en cada actualización.</span>
        </div>
      </section>

      {/* ======================================================== */}
      {/* TARJETA 3: SWITCH DE AVISOS Y CONSEJO DE SEGURIDAD       */}
      {/* ======================================================== */}
      <section className="bg-slate-900/40 backdrop-blur-lg border border-white/[0.08] border-t border-t-white/10 rounded-3xl p-4.5 sm:p-5 shadow-2xl shadow-black/40 space-y-4 relative overflow-hidden transition-all">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            CONFIGURACIÓN Y SEGURIDAD
          </span>
          <h3 className="text-white text-base font-semibold">
            Avisos y Protección Criptográfica
          </h3>
        </div>

        {/* Fila interactiva del Switch */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-white truncate">Avisos automáticos al entrar</h4>
              <p className="text-xs text-slate-400 truncate">Notificar si hay una nueva versión disponible</p>
            </div>
          </div>

          <NeonSwitch
            checked={autoCheckUpdates}
            onChange={handleToggleAutoCheck}
            ariaLabel="Avisos automáticos de versión"
          />
        </div>

        {/* Consejo de seguridad integrado */}
        <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-white/[0.06] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Consejo de seguridad permanente</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Antes de cualquier actualización mayor del sistema operativo, siempre puedes exportar un respaldo cifrado desde{' '}
            {onNavigateToBackup ? (
              <button
                type="button"
                onClick={onNavigateToBackup}
                className="text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
              >
                Copia de Seguridad
              </button>
            ) : (
              <span className="text-indigo-300 font-semibold">Copia de Seguridad</span>
            )}
            . Cada paquete comprueba su firma criptográfica antes de ejecutarse.
          </p>
        </div>
      </section>
    </div>
  );
};
