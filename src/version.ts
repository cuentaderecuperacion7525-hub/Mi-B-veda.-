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

export const APP_VERSION = '1.2.40';
export const CURRENT_APP_VERSION = APP_VERSION;
export const CURRENT_BUILD_NUMBER = 1040;
export const CURRENT_RELEASE_DATE = '16 oct 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Encabezados fijos en carpetas y subcarpetas: el título y los controles siempre visibles.',
  'Zoom táctil con pellizco de dos dedos y desplazamiento libre de la imagen.',
  'Navegación simplificada: retorno fluido a carpetas con la flecha o gesto del sistema.',
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

