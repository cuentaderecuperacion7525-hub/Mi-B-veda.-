import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';
import { userProfileService, UserProfile } from './userProfileService';
import { syncUserProfile } from './firebaseAuthService';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_WEB_CLIENT_ID =
  firebaseConfig.oAuthClientId ||
  '608078005590-n71gktl427qb5265uej3nonvafjsavuv.apps.googleusercontent.com';

let isSocialLoginInitialized = false;

/**
 * Initializes the native Google Social Login plugin with the Google Web Client ID.
 */
export async function initSocialLogin(): Promise<void> {
  if (isSocialLoginInitialized) return;
  try {
    await SocialLogin.initialize({
      google: {
        webClientId: GOOGLE_WEB_CLIENT_ID,
      },
    });
    isSocialLoginInitialized = true;
  } catch (err) {
    console.warn('SocialLogin.initialize notice:', err);
  }
}

export interface NativeGoogleAuthResult {
  success: boolean;
  profile?: UserProfile;
  error?: string;
  cancelled?: boolean;
}

/**
 * Initiates native Google Sign-In using Android's official Google Play Services
 * (Credential Manager / Google Identity bottom sheet picker).
 *
 * In native Android:
 * - Slides up the official Google account chooser containing the user's / family member's actual accounts.
 * - Passes zero web origin checks (no 'Error 400: origin_mismatch').
 * - Returns real verified email, user's name, and Google profile picture.
 */
export async function signInWithNativeGoogle(): Promise<NativeGoogleAuthResult> {
  try {
    await initSocialLogin();

    // Check if running in a native Capacitor environment (Android / iOS)
    if (Capacitor.isNativePlatform()) {
      const res: any = await SocialLogin.login({
        provider: 'google',
        options: {
          scopes: ['email', 'profile'],
        },
      });

      const profileData = res?.result?.profile || res?.result || res?.profile || {};
      const email = (profileData.email || res?.email || '').trim().toLowerCase();
      const name = profileData.name || profileData.givenName || res?.name || 'Usuario';
      const givenName = profileData.givenName || name.split(' ')[0] || 'Usuario';
      const familyName = profileData.familyName || name.split(' ').slice(1).join(' ') || '';
      const photoURL = profileData.imageUrl || profileData.picture || undefined;

      if (!email) {
        return {
          success: false,
          error: 'No se pudo obtener el correo de la cuenta de Google seleccionada.',
        };
      }

      // Guardar el perfil verificado en la bóveda
      const profile = userProfileService.saveUserProfile({
        firstName: givenName,
        lastName: familyName,
        email,
        emailVerified: true,
        photoURL,
        authProvider: 'google.com',
      });

      // Sincronizar en Firestore si hay conexión
      try {
        const uid = `google_${btoa(email).replace(/=/g, '')}`;
        await syncUserProfile(uid, {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          emailVerified: true,
          photoURL: profile.photoURL,
          authProvider: 'google.com',
        });
      } catch (syncErr) {
        console.warn('Firestore sync optional error:', syncErr);
      }

      return {
        success: true,
        profile,
      };
    } else {
      // In web browser preview (AI Studio or desktop browser)
      // Call SocialLogin.login for web or fall back gracefully
      try {
        const res: any = await SocialLogin.login({
          provider: 'google',
          options: {
            scopes: ['email', 'profile'],
          },
        });
        const profileData = res?.result?.profile || res?.result || res?.profile || {};
        const email = (profileData.email || '').trim().toLowerCase();
        if (email) {
          const profile = userProfileService.saveUserProfile({
            firstName: profileData.givenName || profileData.name || 'Usuario',
            email,
            emailVerified: true,
            photoURL: profileData.imageUrl,
            authProvider: 'google.com',
          });
          return { success: true, profile };
        }
      } catch (webErr: any) {
        // Fall back to prompting modal on pure web preview if external popups are blocked
        console.warn('Web SocialLogin fallback:', webErr);
      }

      return {
        success: false,
        error: 'native_fallback_needed',
      };
    }
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase();
    if (
      msg.includes('cancel') ||
      msg.includes('closed') ||
      msg.includes('dismiss') ||
      msg.includes('user_cancel')
    ) {
      return {
        success: false,
        cancelled: true,
      };
    }

    console.error('signInWithNativeGoogle error:', err);
    return {
      success: false,
      error: err?.message || 'Error al conectar con Google Play Services.',
    };
  }
}
