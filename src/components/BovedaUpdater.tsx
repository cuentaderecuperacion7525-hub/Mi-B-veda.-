import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  RefreshCw,
  Download,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { getSafeAppVersionCode, downloadAndInstallApk } from '../services/nativeUpdaterBridge';
import { updateService } from '../services/updateService';
import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER, CURRENT_RELEASE_DATE } from '../version';


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
  const [status, setStatus] = useState<string>('');
  const [isNative, setIsNative] = useState<boolean>(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState<boolean>(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Lógica unificada de verificación (automática al inicio y manual mediante el botón)
  const verificarActualizaciones = useCallback(async (esManual: boolean = false) => {
    setLoading(true);
    if (esManual) setStatus('Buscando actualizaciones en GitHub Releases...');

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
      setHasCheckedOnce(true);

      if (res.hasUpdate) {
        setUpdateAvailable(true);
        setDownloadUrl(res.downloadUrl || '');
        setStatus(`¡Nueva versión v${res.latestVersion} lista para instalar! Presiona el botón verde.`);
      } else {
        setUpdateAvailable(false);
        if (esManual) {
          setStatus(`Tu aplicación está al día en la versión más reciente (v${nombreActual}, Build ${versionActual}).`);
        }
      }
    } catch (error: any) {
      setUpdateAvailable(false);
      setHasCheckedOnce(true);
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

  // Ejecución de la descarga e instalación automática
  const ejecutarActualizacion = async () => {
    if (!downloadUrl) return;
    setIsInstalling(true);
    setStatus('Descargando actualización e iniciando el instalador de Android...');
    try {
      const res = await downloadAndInstallApk(downloadUrl);
      setStatus(res.message || 'Instalador de Android abierto en pantalla. Confirma la instalación.');
    } catch (err: any) {
      setStatus(err.message || 'No se pudo completar la instalación automática.');
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="bg-[#0a121d] p-4.5 sm:p-5 rounded-3xl border border-cyan-500/30 shadow-xl space-y-4">
      {/* Encabezado: Estado de la versión y plataforma */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff] shrink-0 shadow-lg shadow-cyan-500/10">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white truncate">Versión del Sistema</h4>
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
            <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
              Lanzamiento: {CURRENT_RELEASE_DATE}
            </p>
          </div>
        </div>

        {/* Badge dinámico de estado */}
        {updateAvailable ? (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cyan-500/20 text-[#00e5ff] border border-cyan-500/40 animate-pulse flex items-center gap-1">
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

      {/* Indicador de capa y comparación de versiones */}
      <div className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/80 px-3.5 py-2.5 rounded-2xl border border-slate-800 font-mono">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isNative ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
          <span className="text-slate-400">Plataforma:</span>
          <span className="text-white font-semibold">{isNative ? 'APK Android' : 'Web'}</span>
        </div>
        <div className="text-slate-400">
          Build <span className="text-slate-200 font-bold">{currentInstalledCode}</span>
          {serverVersionCode > 0 && (
            <span> / Servidor <span className="text-cyan-300 font-bold">{serverVersionCode}</span></span>
          )}
        </div>
      </div>

      {/* Mensaje de estado dinámico */}
      {status && (
        <div className={`p-3 rounded-2xl text-xs font-medium border leading-relaxed ${
          updateAvailable
            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
            : 'bg-slate-900/70 border-slate-800 text-slate-300'
        }`}>
          {status}
        </div>
      )}

      {/* ======================================================== */}
      {/* EL BOTÓN PRINCIPAL ÚNICO (EL BUENO)                       */}
      {/* ======================================================== */}
      <div className="pt-1">
        {updateAvailable ? (
          <button
            type="button"
            onClick={ejecutarActualizacion}
            disabled={isInstalling}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.99] text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${isInstalling ? 'animate-bounce' : ''}`} />
            <span>
              {isInstalling ? 'Instalando actualización...' : `Instalar Actualización v${serverVersionName || 'Nueva'}`}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => verificarActualizaciones(true)}
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.99] text-white font-bold rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Buscando actualizaciones...' : 'Buscar Actualizaciones'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
