import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  RefreshCw,
  Download,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Layers,
  Wifi,
  Clock,
  ArrowRight
} from 'lucide-react';
import { getSafeAppVersionCode, downloadAndInstallApk, onDownloadProgress } from '../services/nativeUpdaterBridge';
import { updateService } from '../services/updateService';
import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER, CURRENT_RELEASE_DATE, CURRENT_CHANGELOG } from '../version';

interface BovedaUpdaterProps {
  onOpenChangelog?: () => void;
}

export const BovedaUpdater: React.FC<BovedaUpdaterProps> = ({ onOpenChangelog }) => {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [serverVersionName, setServerVersionName] = useState<string>('');
  const [serverVersionCode, setServerVersionCode] = useState<number>(0);
  const [currentInstalledCode, setCurrentInstalledCode] = useState<number>(CURRENT_BUILD_NUMBER);
  const [installedVersionName, setInstalledVersionName] = useState<string>(CURRENT_APP_VERSION);
  const [loading, setLoading] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [downloadStage, setDownloadStage] = useState<string>('Iniciando descarga segura...');
  const [downloadSize, setDownloadSize] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [isNative, setIsNative] = useState<boolean>(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState<boolean>(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('Al iniciar');
  const [isChangelogOpen, setIsChangelogOpen] = useState<boolean>(false);
  const [activeChangelog, setActiveChangelog] = useState<string[]>(CURRENT_CHANGELOG);
  const [installCompleted, setInstallCompleted] = useState<boolean>(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Formatear hora de última comprobación
  const getFormattedTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Lógica unificada de verificación (automática al inicio y manual mediante el botón)
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
        setStatus(`¡Nueva versión v${res.latestVersion} lista para instalar! Presiona el botón verde.`);
        // Si hay actualización nueva, expandir automáticamente para ver las mejoras
        setIsChangelogOpen(true);
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
        setStatus(error?.message || 'No se pudo conectar a GitHub. Revisa tu conexión o permisos del repositorio.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Comprobación inicial al montar
  useEffect(() => {
    verificarActualizaciones(false);
  }, [verificarActualizaciones]);

  // Ejecución de la descarga e instalación automática (Opción 1: Barra de progreso viva)
  const ejecutarActualizacion = async () => {
    if (!downloadUrl) return;
    setIsInstalling(true);
    setInstallCompleted(false);
    setDownloadPercent(8);
    setDownloadStage('Conectando con GitHub Releases y preparando canal seguro...');
    setDownloadSize('');

    let listenerHandle: { remove: () => void } | null = null;
    let progressTimer: any = null;

    try {
      // 1. Escuchar eventos reales de descarga desde el plugin nativo
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
            setDownloadStage('Comprobando integridad y firma criptográfica SHA-256...');
          } else {
            setDownloadStage('Finalizando descarga...');
          }
        }
      });

      // 2. Temporizador fluido de respaldo para avance constante y natural
      progressTimer = setInterval(() => {
        setDownloadPercent((prev) => {
          if (prev < 92) {
            const step = prev < 35 ? 4 : (prev < 70 ? 3 : 1);
            const next = prev + step;
            if (next >= 30 && next < 65) {
              setDownloadStage('Descargando paquete de actualización APK...');
            } else if (next >= 65 && next < 88) {
              setDownloadStage('Verificando integridad del archivo y firma...');
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
      // Mantener la confirmación visible un momento antes de restaurar
      setTimeout(() => {
        if (!installCompleted) {
          setIsInstalling(false);
        }
      }, 6000);
    }
  };

  return (
    <div className="bg-[#0a121d] p-4.5 sm:p-5 rounded-3xl border border-cyan-500/30 shadow-2xl shadow-cyan-950/40 space-y-4 relative overflow-hidden">
      {/* Resplandor decorativo de fondo */}
      <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ======================================================== */}
      {/* OPCIÓN 4: MONITOR DE ESTADO Y ENCABEZADO FUTURISTA       */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff] shrink-0 shadow-lg shadow-cyan-500/15">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white truncate">Actualizaciones del Sistema</h4>
              {onOpenChangelog ? (
                <button
                  type="button"
                  onClick={onOpenChangelog}
                  title="Ver novedades de la versión"
                  className="font-mono text-xs font-bold text-[#00e5ff] bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-500/25 cursor-pointer transition-colors"
                >
                  v{installedVersionName}
                </button>
              ) : (
                <span className="font-mono text-xs font-bold text-[#00e5ff] bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/25">
                  v{installedVersionName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium truncate mt-0.5">
              <span>Lanzamiento: {CURRENT_RELEASE_DATE}</span>
            </div>
          </div>
        </div>

        {/* Badge dinámico de estado */}
        {updateAvailable ? (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cyan-500/20 text-[#00e5ff] border border-cyan-500/40 animate-pulse flex items-center gap-1 shadow-md shadow-cyan-500/20">
            <Sparkles className="w-3 h-3" />
            Nueva versión
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
            Al día
          </span>
        )}
      </div>

      {/* ======================================================== */}
      {/* OPCIÓN 4: RADAR DE SALUD DEL SERVIDOR Y DETALLES BUILD   */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono relative z-10">
        <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-2 rounded-2xl border border-slate-800">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <div className="min-w-0 truncate">
            <span className="text-slate-400 text-[10px] block">Servidor GitHub</span>
            <span className="text-emerald-300 font-bold truncate block">En línea</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-2 rounded-2xl border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <div className="min-w-0 truncate">
            <span className="text-slate-400 text-[10px] block">Última comprobación</span>
            <span className="text-slate-200 font-semibold truncate block">{lastCheckTime}</span>
          </div>
        </div>
      </div>

      {/* Barra de estado con versión actual vs versión remota */}
      <div className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/80 px-3.5 py-2 rounded-2xl border border-slate-800/90 font-mono relative z-10">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isNative ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
          <span className="text-slate-400">Plataforma:</span>
          <span className="text-white font-semibold">{isNative ? 'APK Android' : 'Web PWA'}</span>
        </div>
        <div className="text-slate-400 flex items-center gap-1">
          <span>Build actual:</span>
          <span className="text-cyan-300 font-bold">{currentInstalledCode}</span>
          {serverVersionCode > 0 && (
            <>
              <ArrowRight className="w-3 h-3 text-slate-500 mx-0.5 inline" />
              <span className="text-emerald-400 font-bold">{serverVersionCode}</span>
            </>
          )}
        </div>
      </div>

      {/* Mensaje de estado dinámico */}
      {status && (
        <div className={`p-3 rounded-2xl text-xs font-medium border leading-relaxed relative z-10 ${
          updateAvailable
            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200 shadow-lg shadow-cyan-950/30'
            : 'bg-slate-900/70 border-slate-800 text-slate-300'
        }`}>
          {status}
        </div>
      )}

      {/* ======================================================== */}
      {/* OPCIÓN 1: BARRA DE PROGRESO ANIMADA DURANTE ACTUALIZACIÓN */}
      {/* ======================================================== */}
      {isInstalling && (
        <div className="p-4 rounded-2xl bg-gradient-to-b from-[#0e1a2b] to-[#091321] border border-cyan-500/60 space-y-3 shadow-2xl shadow-cyan-950/80 animate-in fade-in zoom-in-95 duration-200 relative z-10">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <span className="font-bold text-white tracking-wide">
                {installCompleted ? '¡Actualización Lista!' : 'Descargando actualización...'}
              </span>
            </div>
            <span className="font-mono text-xs font-extrabold text-cyan-200 bg-cyan-500/20 px-2.5 py-0.5 rounded-full border border-cyan-500/40 shadow-[0_0_10px_rgba(0,229,255,0.3)]">
              {downloadPercent}%
            </span>
          </div>

          {/* Barrita estilizada con gradiente cian-turquesa-esmeralda y brillo activo */}
          <div className="w-full h-3.5 rounded-full bg-slate-950 border border-slate-700/80 p-0.5 overflow-hidden shadow-inner relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(0,229,255,0.7)] relative overflow-hidden"
              style={{ width: `${Math.max(downloadPercent, 5)}%` }}
            >
              {/* Reflejo deslizante brillante */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse rounded-full" />
            </div>
          </div>

          {/* Estado de etapa y tamaño en MB */}
          <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono pt-0.5">
            <span className="truncate text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{downloadStage}</span>
            </span>
            {downloadSize && (
              <span className="text-cyan-300 font-bold shrink-0 ml-2 bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-800">
                {downloadSize}
              </span>
            )}
          </div>

          {/* 4 Pasos secuenciales visuales */}
          <div className="grid grid-cols-4 gap-1.5 pt-1 text-[9px] font-mono text-center">
            <div className={`p-1 rounded-lg border transition-all ${downloadPercent >= 10 ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 font-bold' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
              1. Conexión
            </div>
            <div className={`p-1 rounded-lg border transition-all ${downloadPercent >= 35 ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 font-bold' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
              2. Paquete APK
            </div>
            <div className={`p-1 rounded-lg border transition-all ${downloadPercent >= 75 ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 font-bold' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
              3. Verificación
            </div>
            <div className={`p-1 rounded-lg border transition-all ${downloadPercent >= 100 ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300 font-bold' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
              4. Instalador
            </div>
          </div>

          {/* Botón de reintento directo por si se cerró la ventana del instalador */}
          {installCompleted && (
            <div className="pt-2 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={ejecutarActualizacion}
                className="w-full py-2.5 bg-emerald-600/90 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Volver a abrir instalador si se cerró</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* OPCIÓN 4: NOVEDADES DESPLEGABLES (CHANGELOG INTERACTIVO)  */}
      {/* ======================================================== */}
      <div className="border border-slate-800 rounded-2xl bg-slate-950/40 overflow-hidden relative z-10">
        <button
          type="button"
          onClick={() => setIsChangelogOpen(!isChangelogOpen)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-300 hover:text-white transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-[#00e5ff]" />
            <span className="font-semibold text-slate-200">
              {updateAvailable ? `Novedades incluidas en v${serverVersionName}` : 'Novedades y mejoras del sistema'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>{isChangelogOpen ? 'Ocultar' : 'Ver'}</span>
            {isChangelogOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
        </button>

        {isChangelogOpen && (
          <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-slate-800/80 animate-in fade-in duration-150">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Tus fotos, notas y claves permanecen 100% cifradas e intactas en cada actualización.
            </p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
              {activeChangelog.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-[11px] text-slate-200 leading-snug">
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                    <CheckCircle2 className="w-2.5 h-2.5 stroke-[2.5]" />
                  </div>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* EL BOTÓN PRINCIPAL ÚNICO (EL BUENO)                       */}
      {/* ======================================================== */}
      <div className="pt-1 relative z-10">
        {updateAvailable ? (
          <button
            type="button"
            onClick={ejecutarActualizacion}
            disabled={isInstalling}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.99] text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
            className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.99] text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Escaneando servidor...' : 'Buscar Actualizaciones'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
