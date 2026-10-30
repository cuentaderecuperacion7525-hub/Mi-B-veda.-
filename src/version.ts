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
export const CURRENT_RELEASE_DATE = '30 oct 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Nuevo diseño minimalista de registro e inicio de sesión con campos de línea inferior e iconos lineales.',
  'Validación inteligente en tiempo real para Nombres y Apellidos reales y desplegable dinámico de requisitos de contraseña (máx. 12 caracteres, mayúscula y número).',
  'PIN de confirmación de 6 dígitos optimizado en una sola línea junto con enlace secundario compacto.',
  'Seguridad reforzada: caducidad estricta a los 5 minutos, uso único y cancelación automática de códigos anteriores.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};

export default APP_VERSION;

