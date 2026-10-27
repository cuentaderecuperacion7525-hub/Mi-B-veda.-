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

export const APP_VERSION = '1.2.44';
export const CURRENT_APP_VERSION = APP_VERSION;
export const CURRENT_BUILD_NUMBER = 1044;
export const CURRENT_RELEASE_DATE = '27 oct 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Nueva barra de acciones en el visor (Compartir, Copiar, Eliminar y Más) y menú de 3 puntitos adaptado a los temas Cian Neón y Tema Claro.',
  'Opciones funcionales de Girar imagen (con guardado cifrado), Mover a carpeta, Favoritos y Cambiar nombre directo desde el visor.',
  'Fondo translúcido y difuminado al abrir el menú (+) tanto en modo claro como en modo oscuro.',
  'Borrado nativo universal de fotos y videos en Android y restauración inmediata desde el primer intento.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};

export default APP_VERSION;

