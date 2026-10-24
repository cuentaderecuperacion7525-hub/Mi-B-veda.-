import { registerPlugin, Capacitor } from '@capacitor/core';
import { userProfileService, UserProfile } from './userProfileService';
import { syncUserProfile } from './firebaseAuthService';

export interface NativeGoogleAuthResponse {
  success: boolean;
  email?: string;
  displayName?: string;
  provider?: string;
  cancelled?: boolean;
  error?: string;
}

export interface VaultGoogleAuthPluginInterface {
  chooseGoogleAccount(): Promise<NativeGoogleAuthResponse>;
}

export const NativeGoogleAuth = registerPlugin<VaultGoogleAuthPluginInterface>('VaultGoogleAuth');

export interface NativeGoogleAuthResult {
  success: boolean;
  profile?: UserProfile;
  error?: string;
  cancelled?: boolean;
}

/**
 * Invoca directamente el selector nativo oficial de Google Play Services / Android en el teléfono.
 *
 * En Android:
 * - Desliza la tarjeta oficial de Google desde la parte inferior de la pantalla.
 * - Muestra las cuentas reales de Gmail guardadas en el dispositivo (la tuya, la de un familiar o la opción de añadir otra).
 * - Al pulsar la cuenta, entrega su nombre y correo real verificado.
 * - Sin redirecciones web, sin abrir Chrome y sin errores de origin_mismatch.
 */
export async function signInWithNativeGoogle(): Promise<NativeGoogleAuthResult> {
  try {
    // Si estamos en un dispositivo nativo Android
    if (Capacitor.isNativePlatform()) {
      (window as any).__isAuthenticatingGoogle = true;
      (window as any).__googleAuthStartTime = Date.now();

      let res: NativeGoogleAuthResponse;
      try {
        res = await NativeGoogleAuth.chooseGoogleAccount();
      } finally {
        setTimeout(() => {
          (window as any).__isAuthenticatingGoogle = false;
          (window as any).__googleAuthStartTime = 0;
        }, 3000);
      }

      if (res.cancelled) {
        return {
          success: false,
          cancelled: true,
        };
      }

      if (res.success && res.email) {
        const cleanEmail = res.email.trim().toLowerCase();
        const displayName = res.displayName || cleanEmail.split('@')[0] || 'Usuario';
        const existing = userProfileService.getUserProfile();

        // Guardar el perfil verificado preservando foto, apellidos y fecha de nacimiento si ya existían
        const profile = userProfileService.saveUserProfile({
          firstName: displayName,
          lastName: existing?.lastName || '',
          birthDate: existing?.birthDate,
          age: existing?.age,
          email: cleanEmail,
          emailVerified: true,
          photoURL: existing?.photoURL || '',
          authProvider: 'google.com',
        });

        // Sincronización secundaria en la nube si hay conexión
        try {
          const uid = `google_${btoa(cleanEmail).replace(/=/g, '')}`;
          await syncUserProfile(uid, {
            firstName: profile.firstName,
            email: profile.email,
            emailVerified: true,
            authProvider: 'google.com',
          });
        } catch {
          // Continúa sin bloquear
        }

        return {
          success: true,
          profile,
        };
      }

      return {
        success: false,
        error: res.error || 'No se pudo obtener la cuenta seleccionada',
      };
    }

    // Entorno Web (Previsualizador de AI Studio / Navegador de escritorio)
    return {
      success: false,
      error: 'web_environment',
    };
  } catch (err: any) {
    console.error('Error en selector nativo de Google:', err);
    return {
      success: false,
      error: err?.message || 'Error al conectar con Google Play Services',
    };
  }
}
