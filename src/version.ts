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

export const APP_VERSION = '1.2.46';
export const CURRENT_APP_VERSION = APP_VERSION;
export const CURRENT_BUILD_NUMBER = 1046;
export const CURRENT_RELEASE_DATE = '1 de noviembre de 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Perfil de usuario: Nuevo diseño oscuro en Editar Perfil con campos simplificados de nombre, apellidos y correo vinculado.',
  'Cambio de cuenta con Google: Reconocimiento y actualización automática de tu nombre y foto de perfil al cambiar de correo con Gmail.',
  'Recuperación de PIN segura: Validación inmediata para verificar que el correo ingresado pertenezca a la cuenta registrada.',
  'Registro de novedades dinámico: Ahora cada actualización muestra únicamente los cambios reales incluidos en la versión.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};

export default APP_VERSION;

