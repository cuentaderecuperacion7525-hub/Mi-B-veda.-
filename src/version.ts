/**
 * Información de versión y registro de cambios (Changelog) de la aplicación.
 */

export interface VersionInfo {
  version: string;
  buildNumber: number;
  releaseDate: string;
  changelog: string[];
  mandatory?: boolean;
}

export const APP_VERSION = '1.2.41';
export const CURRENT_APP_VERSION = APP_VERSION;
export const CURRENT_BUILD_NUMBER = 1041;
export const CURRENT_RELEASE_DATE = '26 oct 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Borrado nativo universal de fotos y videos en Android (compatible con todos los teléfonos y versiones de Android).',
  'Restauración de copia de seguridad inmediata desde el primer intento tras restablecer de fábrica.',
  'Iconos de alta visibilidad en el menú flotante (+) en el tema claro (blanco).',
  'Detección inteligente de actualizaciones y descarga directa de paquetes APK.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};

export default APP_VERSION;

