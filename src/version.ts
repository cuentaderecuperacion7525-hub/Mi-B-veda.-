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

export const CURRENT_APP_VERSION = '1.2.0';
export const CURRENT_BUILD_NUMBER = 120;
export const CURRENT_RELEASE_DATE = '12 de Octubre, 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Encabezados de carpetas y subcarpetas fijos: al deslizar hacia arriba, el título y controles permanecen siempre visibles sin tapar tus fotos.',
  'Zoom táctil interactivo: haz zoom con pellizco de dos dedos y desplaza la imagen libremente por cualquier parte de la pantalla.',
  'Límite de desplazamiento perfeccionado: se eliminaron los márgenes negros excesivos al mover imágenes aumentadas.',
  'Navegación simplificada: eliminación de botones redundantes, ahora vuelves atrás de forma limpia con la flecha o deslizamiento.',
  'Detección inteligente de actualizaciones: aviso automático al entrar si hay mejoras disponibles y botón para actualizar en 1 toque.',
  'Verificador manual de versiones y novedades integrado en Configuración.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};
