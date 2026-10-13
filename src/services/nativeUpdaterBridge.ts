import { Capacitor, registerPlugin } from '@capacitor/core';
import { CURRENT_BUILD_NUMBER, CURRENT_APP_VERSION } from '../version';

export interface UpdaterPluginInterface {
  getAppVersionCode(): Promise<{ versionCode: number }>;
  downloadAndInstall(options: { url: string }): Promise<void>;
}

// Registro del plugin nativo Capacitor con nombre 'UpdaterPlugin'
export const UpdaterPlugin = registerPlugin<UpdaterPluginInterface>('UpdaterPlugin');

/**
 * Obtiene de forma segura el código de versión del APK o el build actual si corre en web
 */
export async function getSafeAppVersionCode(): Promise<number> {
  if (!Capacitor.isNativePlatform()) {
    return CURRENT_BUILD_NUMBER;
  }

  try {
    const res = await UpdaterPlugin.getAppVersionCode();
    if (res && typeof res.versionCode === 'number') {
      return res.versionCode;
    }
    return CURRENT_BUILD_NUMBER;
  } catch (err) {
    console.warn('[NativeUpdater] UpdaterPlugin no disponible en este entorno nativo, usando buildNumber:', err);
    return CURRENT_BUILD_NUMBER;
  }
}

/**
 * Descarga e instala la APK usando el instalador nativo si está disponible,
 * o redirige al enlace de descarga si está en el navegador
 */
export async function downloadAndInstallApk(apkUrl: string): Promise<{ success: boolean; message?: string }> {
  if (!apkUrl) {
    throw new Error('No se especificó la URL de descarga del APK');
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await UpdaterPlugin.downloadAndInstall({ url: apkUrl });
      return { success: true, message: 'Descarga iniciada en el sistema nativo' };
    } catch (nativeErr: any) {
      console.warn('[NativeUpdater] Error en UpdaterPlugin nativo, recurriendo a apertura de URL:', nativeErr);
      // Fallback nativo: intentar abrir el enlace directamente con el navegador del teléfono
      window.open(apkUrl, '_system');
      return { success: true, message: 'Abriendo enlace de descarga en el navegador' };
    }
  } else {
    // Entorno Web: abrir en nueva pestaña o iniciar descarga
    const a = document.createElement('a');
    a.href = apkUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { success: true, message: 'Descarga iniciada en el navegador' };
  }
}
