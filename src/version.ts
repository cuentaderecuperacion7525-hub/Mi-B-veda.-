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
export const CURRENT_RELEASE_DATE = '30 de octubre de 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Acceso y registro: Nueva interfaz minimalista de registro e inicio de sesión con verificación de correo mediante código de 6 dígitos.',
  'Seguridad reforzada: Protección de códigos de un solo uso con vigencia de 5 minutos y validación de contraseña segura.',
  'Rendimiento general: Mejoras de velocidad, estabilidad y fluidez al abrir tus fotos, videos, documentos y notas.',
  'Protección de datos: Actualización directa del sistema conservando intactos todos los archivos guardados en tu bóveda.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};

export default APP_VERSION;

