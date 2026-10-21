import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { userProfileService, UserProfile } from './userProfileService';

/**
 * Sign In / Register with Google using official GoogleAuthProvider and signInWithPopup.
 * Google accounts guarantee verified email, name, and profile picture in a single step.
 */
export async function signInWithGoogle(): Promise<{
  success: boolean;
  profile?: UserProfile;
  error?: string;
}> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
    });

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const fullName = user.displayName || 'Usuario de la Bóveda';
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Usuario';
    const lastName = nameParts.slice(1).join(' ') || '';
    const email = user.email || '';
    const photoURL = user.photoURL || undefined;

    // 1. Save profile locally
    const profile = userProfileService.saveUserProfile({
      firstName,
      lastName,
      email,
      emailVerified: user.emailVerified,
      photoURL,
      authProvider: 'google.com',
    });

    // 2. Persist in Firestore
    await syncUserProfile(user.uid, {
      firstName,
      lastName,
      email,
      emailVerified: user.emailVerified,
      photoURL,
      authProvider: 'google.com',
    });

    return {
      success: true,
      profile,
    };
  } catch (err: any) {
    console.error('Google Sign-In Error:', err);
    let errorMsg = 'Error al iniciar sesión con Google.';
    if (err.code === 'auth/popup-closed-by-user') {
      errorMsg = 'Ventana de inicio cerrada. Vuelve a intentarlo.';
    } else if (err.code === 'auth/cancelled-popup-request') {
      errorMsg = 'Operación cancelada.';
    } else if (err.code === 'auth/popup-blocked') {
      errorMsg = 'El navegador bloqueó la ventana emergente. Por favor, permítela.';
    } else if (err.code === 'auth/network-request-failed') {
      errorMsg = 'Error de conexión. Verifica tu conexión a internet.';
    } else if (err.message) {
      errorMsg = err.message;
    }
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Sign out from Firebase Auth
 */
export async function signOutFromFirebase(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.error('Error signing out:', err);
  }
}

/**
 * Generates a stable deterministic authentication token for local fallback.
 */
function getDeterministicVaultKey(email: string): string {
  const clean = email.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return `Boveda_#${Math.abs(hash)}_SecKey!2026`;
}

export interface FirebaseRegisterResult {
  success: boolean;
  emailSent?: boolean;
  isAlreadyVerified?: boolean;
  message?: string;
  error?: string;
}

/**
 * Fallback: Registers the user with Email and sends a verification link via Firebase Auth.
 */
export async function sendFirebaseVerification(
  email: string,
  firstName: string,
  lastName: string,
  birthDate?: string,
  age?: number
): Promise<FirebaseRegisterResult> {
  const cleanEmail = email.trim().toLowerCase();
  const password = getDeterministicVaultKey(cleanEmail);

  try {
    let userCredential;

    try {
      userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-in-use') {
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        throw createErr;
      }
    }

    const user = userCredential.user;
    await user.reload();

    if (user.emailVerified) {
      await syncUserProfile(user.uid, {
        firstName,
        lastName,
        birthDate,
        age,
        email: cleanEmail,
        emailVerified: true,
        authProvider: 'password',
      });

      return {
        success: true,
        emailSent: false,
        isAlreadyVerified: true,
        message: 'Tu correo ya está verificado oficialmente.',
      };
    }

    await sendEmailVerification(user, {
      url: window.location.origin,
      handleCodeInApp: false,
    });

    return {
      success: true,
      emailSent: true,
      message: `Correo oficial de verificación enviado a ${cleanEmail}`,
    };
  } catch (err: any) {
    console.error('Firebase Auth Verification error:', err);
    let errorMsg = 'Error al enviar el correo de verificación con Firebase.';
    if (err.code === 'auth/invalid-email') {
      errorMsg = 'El formato del correo electrónico no es válido.';
    } else if (err.code === 'auth/too-many-requests') {
      errorMsg = 'Demasiados intentos. Espera unos momentos antes de solicitar otro correo.';
    } else if (err.code === 'auth/operation-not-allowed') {
      errorMsg = 'El inicio por correo no está habilitado en Firebase. Te recomendamos usar el botón "Continuar con Google".';
    } else if (err.code === 'auth/network-request-failed') {
      errorMsg = 'Error de conexión. Verifica tu conexión a internet.';
    } else if (err.message) {
      errorMsg = err.message;
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Re-sends the verification email to the current authenticated Firebase user.
 */
export async function resendFirebaseVerificationEmail(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'No hay sesión de usuario activa para reenviar.' };
    }

    await sendEmailVerification(user, {
      url: window.location.origin,
      handleCodeInApp: false,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Resend verification error:', err);
    return {
      success: false,
      error: err.code === 'auth/too-many-requests'
        ? 'Espera unos minutos antes de solicitar otro correo.'
        : 'No se pudo reenviar el correo.',
    };
  }
}

/**
 * Checks whether the user has verified the link in their real email.
 */
export async function checkFirebaseEmailVerification(
  profileData: {
    firstName: string;
    lastName?: string;
    birthDate?: string;
    age?: number;
    email: string;
  }
): Promise<{ verified: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      const cleanEmail = profileData.email.trim().toLowerCase();
      const password = getDeterministicVaultKey(cleanEmail);
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await cred.user.reload();
      if (cred.user.emailVerified) {
        await syncUserProfile(cred.user.uid, {
          ...profileData,
          emailVerified: true,
          authProvider: 'password',
        });
        return { verified: true };
      }
      return { verified: false };
    }

    await user.reload();

    if (user.emailVerified) {
      await syncUserProfile(user.uid, {
        ...profileData,
        emailVerified: true,
        authProvider: 'password',
      });
      return { verified: true };
    }

    return { verified: false };
  } catch (err: any) {
    console.error('Check email verification error:', err);
    return { verified: false, error: err.message };
  }
}

/**
 * If the user pastes an action code or link directly from their email.
 */
export async function verifyWithActionCode(
  actionCode: string,
  profileData: {
    firstName: string;
    lastName?: string;
    birthDate?: string;
    age?: number;
    email: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await applyActionCode(auth, actionCode);
    const user = auth.currentUser;
    if (user) {
      await user.reload();
      await syncUserProfile(user.uid, {
        ...profileData,
        emailVerified: true,
        authProvider: 'password',
      });
    }
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: 'El código de acción no es válido o ha expirado.',
    };
  }
}

/**
 * Saves profile data to local storage and Firestore.
 */
async function syncUserProfile(
  uid: string,
  profile: {
    firstName: string;
    lastName?: string;
    birthDate?: string;
    age?: number;
    email: string;
    emailVerified: boolean;
    photoURL?: string;
    authProvider?: string;
  }
) {
  // 1. Save locally with standard service
  userProfileService.saveUserProfile({
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    age: profile.age,
    email: profile.email,
    emailVerified: profile.emailVerified,
    photoURL: profile.photoURL,
    authProvider: profile.authProvider,
  });

  // 2. Persist in Firestore
  try {
    const userRef = doc(db, 'users', uid);
    const now = new Date().toISOString();
    const docData: Record<string, any> = {
      id: uid,
      firstName: profile.firstName.trim(),
      email: profile.email.trim().toLowerCase(),
      emailVerified: profile.emailVerified,
      createdAt: now,
      updatedAt: now,
    };

    if (profile.lastName?.trim()) {
      docData.lastName = profile.lastName.trim();
    }
    if (profile.birthDate?.trim()) {
      docData.birthDate = profile.birthDate.trim();
    }
    if (profile.age !== undefined && profile.age >= 0) {
      docData.age = profile.age;
    }
    if (profile.photoURL) {
      docData.photoURL = profile.photoURL;
    }
    if (profile.authProvider) {
      docData.authProvider = profile.authProvider;
    }

    await setDoc(userRef, docData, { merge: true });
  } catch (err) {
    console.warn('Firestore user profile sync warning (offline or permissions):', err);
  }
}
