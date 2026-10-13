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

interface VersionResponseData {
  version_code?: number;
  buildNumber?: number;
  version_name?: string;
  version?: string;
  download_url?: string;
  changelog?: string[];
  releaseDate?: string;
}

interface BovedaUpdaterProps {
  onOpenChangelog?: () => void;
}

export const BovedaUpdater: React.FC<BovedaUpdaterProps> = ({ onOpenChangelog }) => {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [serverVersionName, setServerVersionName] = useState<string>('');
  const [serverVersionCode, setServerVersionCode] = useState<number>(0);
  const [currentInstalledCode, setCurrentInstalledCode] = useState<number>(CURRENT_BUILD_NUMBER);
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
    if (esManual) setStatus('Comprobando actualizaciones en GitHub Releases...');

    try {
      // 1. Obtener la versión de compilación nativa instalada en el dispositivo
      let versionActual = CURRENT_BUILD_NUMBER;
      let nombreActual = CURRENT_APP_VERSION;
      try {
        const info = await getSafeAppVersionCode();
        versionActual = info.versionCode;
        nombreActual = info.versionName;
        setCurrentInstalledCode(versionActual);
      } catch {
        versionActual = CURRENT_BUILD_NUMBER;
      }

      const repo = updateService.getGitHubRepo() || 'cuentadecuperacion7525-hub/Mi-B-veda.-';
      const cacheBuster = `_t=${Date.now()}`;
      let codigoRemoto = 0;
      let nombreRemoto = CURRENT_APP_VERSION;
      let urlDescarga = `https://github.com/${repo}/releases/latest/download/Boveda-Calculadora.apk`;
      let seEncontro = false;

      // Intentar primero con la API de Releases de GitHub (detecta de inmediato compilaciones automáticas de GitHub Actions)
      try {
        const ghApiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
        const ghRes = await fetch(ghApiUrl, {
          headers: { 'Accept': 'application/vnd.github.v3+json' },
          cache: 'no-store'
        });

        if (ghRes.ok) {
          const release = await ghRes.json();
          if (release && release.tag_name) {
            const tag = release.tag_name.replace(/^v/, '');
            nombreRemoto = tag;

            // Extraer build number: si el tag es v1.0.X, el buildNumber en GitHub Actions es 100 + X
            const match = tag.match(/1\.0\.(\d+)/);
            if (match) {
              codigoRemoto = 100 + parseInt(match[1], 10);
            } else {
              codigoRemoto = 100;
            }

            // Buscar asset APK directo
            const apkAsset = release.assets?.find((a: any) =>
              a.name && a.name.toLowerCase().endsWith('.apk')
            );
            if (apkAsset && apkAsset.browser_download_url) {
              urlDescarga = apkAsset.browser_download_url;
            }

            seEncontro = true;
          }
        }
      } catch (apiErr) {
        console.warn('[BovedaUpdater] Fallo en API de Releases de GitHub, probando version.json raw:', apiErr);
      }

      // Si no se obtuvo de la API, consultar el archivo version.json en GitHub raw
      if (!seEncontro) {
        const urlGitHubPrincipal = `https://raw.githubusercontent.com/${repo}/principal/public/version.json?${cacheBuster}`;
        const urlGitHubMain = `https://raw.githubusercontent.com/${repo}/main/public/version.json?${cacheBuster}`;

        let datos: VersionResponseData | null = null;
        try {
          let respuesta = await fetch(urlGitHubPrincipal, { cache: 'no-store' });
          if (!respuesta.ok) {
            respuesta = await fetch(urlGitHubMain, { cache: 'no-store' });
          }
          if (respuesta.ok) {
            datos = await respuesta.json();
          }
        } catch (ghErr) {
          console.warn('[BovedaUpdater] No se pudo conectar a raw GitHub:', ghErr);
        }

        // Fallback a version.json local
        if (!datos) {
          try {
            const respuestaLocal = await fetch(`/version.json?${cacheBuster}`, { cache: 'no-store' });
            if (respuestaLocal.ok) {
              datos = await respuestaLocal.json();
            }
          } catch (locErr) {
            console.warn('[BovedaUpdater] No se pudo conectar a version.json local:', locErr);
          }
        }

        if (datos) {
          codigoRemoto = datos.version_code ?? datos.buildNumber ?? 0;
          nombreRemoto = datos.version_name ?? datos.version ?? CURRENT_APP_VERSION;
          urlDescarga = datos.download_url || `https://github.com/${repo}/releases/latest/download/Boveda-Calculadora.apk`;
          seEncontro = true;
        }
      }

      if (!seEncontro) {
        throw new Error('No se pudo contactar al servidor de actualizaciones. Revisa tu conexión a internet.');
      }

      setServerVersionCode(codigoRemoto);
      setServerVersionName(nombreRemoto);
      setHasCheckedOnce(true);

      // Comprobar si hay versión superior a la instalada
      if (codigoRemoto > versionActual) {
        setUpdateAvailable(true);
        setDownloadUrl(urlDescarga);
        setStatus(`¡Nueva versión v${nombreRemoto} (Build ${codigoRemoto}) lista para instalar en tu teléfono!`);
      } else {
        setUpdateAvailable(false);
        if (esManual) {
          setStatus(`Tu aplicación está al día en la versión más reciente (v${nombreActual}, Build ${versionActual}).`);
        }
      }
    } catch (error: any) {
      if (esManual) {
        setStatus(error?.message || 'Error de conexión. Inténtalo más tarde.');
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
                  v{CURRENT_APP_VERSION}
                </button>
              ) : (
                <span className="font-mono text-xs font-bold text-[#00e5ff] bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/25">
                  v{CURRENT_APP_VERSION}
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
