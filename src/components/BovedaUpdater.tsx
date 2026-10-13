import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { UpdaterPlugin, getSafeAppVersionCode, downloadAndInstallApk } from '../services/nativeUpdaterBridge';
import { updateService } from '../services/updateService';
import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER } from '../version';

interface VersionResponseData {
  version_code?: number;
  buildNumber?: number;
  version_name?: string;
  version?: string;
  download_url?: string;
  changelog?: string[];
  releaseDate?: string;
}

export const BovedaUpdater: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [serverVersionName, setServerVersionName] = useState<string>('');
  const [serverVersionCode, setServerVersionCode] = useState<number>(0);
  const [currentInstalledCode, setCurrentInstalledCode] = useState<number>(CURRENT_BUILD_NUMBER);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('');
  const [isNative, setIsNative] = useState<boolean>(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Lógica de verificación (funciona tanto automático al montar como manual con botón)
  const verificarActualizaciones = useCallback(async (esManual: boolean = false) => {
    setLoading(true);
    if (esManual) setStatus('Comprobando el servidor de seguridad...');

    try {
      // 1. Obtener la versión instalada en el dispositivo (mediante Capacitor nativo o buildNumber actual)
      let versionActual = CURRENT_BUILD_NUMBER;
      try {
        versionActual = await getSafeAppVersionCode();
        setCurrentInstalledCode(versionActual);
      } catch {
        versionActual = CURRENT_BUILD_NUMBER;
      }

      // 2. Determinar la URL del archivo version.json
      const repo = updateService.getGitHubRepo() || 'cuentadecuperacion7525-hub/Mi-B-veda.-';
      const cacheBuster = `_t=${Date.now()}`;
      const urlGitHub = `https://raw.githubusercontent.com/${repo}/main/public/version.json?${cacheBuster}`;

      let datos: VersionResponseData | null = null;

      // Intentar primero desde GitHub público
      try {
        const respuesta = await fetch(urlGitHub, { cache: 'no-store' });
        if (respuesta.ok) {
          datos = await respuesta.json();
        }
      } catch (ghErr) {
        console.warn('[BovedaUpdater] No se pudo conectar a GitHub, probando origen local:', ghErr);
      }

      // Fallback a version.json local de la app
      if (!datos) {
        const respuestaLocal = await fetch(`/version.json?${cacheBuster}`, { cache: 'no-store' });
        if (respuestaLocal.ok) {
          datos = await respuestaLocal.json();
        }
      }

      if (!datos) {
        throw new Error('No se pudo obtener información de la versión desde el servidor.');
      }

      // Soportar tanto version_code/version_name como buildNumber/version
      const codigoRemoto = datos.version_code ?? datos.buildNumber ?? 0;
      const nombreRemoto = datos.version_name ?? datos.version ?? CURRENT_APP_VERSION;
      const urlDescarga = datos.download_url || `https://github.com/${repo}/actions`;

      setServerVersionCode(codigoRemoto);
      setServerVersionName(nombreRemoto);

      // Comprobar si hay una versión superior
      if (codigoRemoto > versionActual) {
        setUpdateAvailable(true);
        setDownloadUrl(urlDescarga);
        setStatus(`Nueva versión disponible: v${nombreRemoto} (Build ${codigoRemoto})`);
      } else {
        setUpdateAvailable(false);
        if (esManual) {
          setStatus(`La bóveda se encuentra en la versión más reciente (v${CURRENT_APP_VERSION}).`);
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

  // Comprobación automática al iniciar el componente
  useEffect(() => {
    verificarActualizaciones(false);
  }, [verificarActualizaciones]);

  // Ejecución de la descarga e instalación automática
  const ejecutarActualizacion = async () => {
    if (!downloadUrl) return;
    try {
      setStatus('Descargando e iniciando instalación...');
      await downloadAndInstallApk(downloadUrl);
    } catch (err: any) {
      setStatus(err.message || 'No se pudo completar la instalación.');
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto p-4 sm:p-5 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-100 shadow-2xl space-y-3.5">
      {/* Encabezado de la sección */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="font-semibold text-xs sm:text-sm tracking-wide uppercase text-zinc-300">
            Actualizador Nativo
          </h3>
        </div>
        <span className="text-[10px] sm:text-xs bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800 font-mono text-zinc-400">
          {isNative ? 'Capacitor Layer (APK)' : 'Web Runtime'}
        </span>
      </div>

      {/* Info de versión instalada vs remota */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/60 px-3 py-2 rounded-xl border border-zinc-800/60 font-mono">
        <span>Instalada: v{CURRENT_APP_VERSION} ({currentInstalledCode})</span>
        {serverVersionCode > 0 && (
          <span className="text-zinc-300">Servidor: v{serverVersionName || CURRENT_APP_VERSION} ({serverVersionCode})</span>
        )}
      </div>

      {/* Mensaje de estado dinámico */}
      {status && (
        <div className="p-3 text-xs bg-zinc-900/70 border border-zinc-800/90 rounded-xl text-zinc-300 font-medium leading-relaxed">
          {status}
        </div>
      )}

      {/* Botones de acción */}
      <div className="space-y-2 pt-1">
        {updateAvailable ? (
          <button
            type="button"
            onClick={ejecutarActualizacion}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 font-semibold rounded-xl text-xs uppercase tracking-wider text-white shadow-lg shadow-emerald-950/40 transition-all duration-200 cursor-pointer"
          >
            Instalar Actualización v{serverVersionName}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => verificarActualizaciones(true)}
            disabled={loading}
            className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-900 disabled:opacity-40 font-medium rounded-xl text-xs uppercase tracking-wider border border-zinc-800 transition-all duration-200 cursor-pointer text-zinc-200"
          >
            {loading ? 'Analizando...' : 'Buscar actualizaciones'}
          </button>
        )}
      </div>
    </div>
  );
};
