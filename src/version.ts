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

export const APP_VERSION = '1.2.45';
export const CURRENT_APP_VERSION = APP_VERSION;
export const CURRENT_BUILD_NUMBER = 1045;
export const CURRENT_RELEASE_DATE = '28 oct 2026';

export const CURRENT_CHANGELOG: string[] = [
  'Nueva pantalla de registro con Nombre, Correo y Contraseña, y verificación de identidad con PIN de 6 dígitos enviado por correo.',
  'Compatibilidad universal para usuarios sin cuenta de Google (Outlook, Yahoo, Hotmail, etc.) manteniendo intacto el inicio de sesión oficial de Google.',
  'Integración con servicio de despacho de correos en tiempo real con Resend.',
  'Diseño visual limpio, adaptativo y fiel a la interfaz de usuario de Mi Bóveda.'
];

export const APP_VERSION_METADATA: VersionInfo = {
  version: CURRENT_APP_VERSION,
  buildNumber: CURRENT_BUILD_NUMBER,
  releaseDate: CURRENT_RELEASE_DATE,
  changelog: CURRENT_CHANGELOG,
  mandatory: false
};

export default APP_VERSION;

