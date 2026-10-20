import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { userProfileService } from './userProfileService';

/**
 * Generates a stable deterministic authentication token for the local vault device.
 * This allows passwordless-like registration with Firebase Auth without burdening
 * the user with an extra password before they configure their Master Vault PIN.
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
 * Registers the user in Firebase Auth and immediately sends a real official
 * verification email from Google Firebase to the user's real email inbox.
 */
export async function sendFirebaseVerification(
  email: string,
  firstName: string,
  lastName: string,
  birthDate: string,
  age: number
): Promise<FirebaseRegisterResult> {
  const cleanEmail = email.trim().toLowerCase();
  const password = getDeterministicVaultKey(cleanEmail);

  try {
    let userCredential;

    try {
      // Attempt to create user with email and deterministic vault key
      userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-in-use') {
        // If already exists, sign in to reuse current account
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        throw createErr;
      }
    }

    const user = userCredential.user;

    // Check if already verified
    await user.reload();
    if (user.emailVerified) {
      // Save profile locally and in Firestore
      await syncUserProfile(user.uid, {
        firstName,
        lastName,
        birthDate,
        age,
        email: cleanEmail,
        emailVerified: true,
      });

      return {
        success: true,
        emailSent: false,
        isAlreadyVerified: true,
        message: 'Tu correo ya está verificado oficialmente.',
      };
    }

    // Send real verification email via Firebase / Google
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
 * Checks whether the user has clicked and verified the link in their real email.
 */
export async function checkFirebaseEmailVerification(
  profileData: {
    firstName: string;
    lastName: string;
    birthDate: string;
    age: number;
    email: string;
  }
): Promise<{ verified: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      // Try to re-authenticate with the deterministic key
      const cleanEmail = profileData.email.trim().toLowerCase();
      const password = getDeterministicVaultKey(cleanEmail);
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await cred.user.reload();
      if (cred.user.emailVerified) {
        await syncUserProfile(cred.user.uid, {
          ...profileData,
          emailVerified: true,
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
    lastName: string;
    birthDate: string;
    age: number;
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
    lastName: string;
    birthDate: string;
    age: number;
    email: string;
    emailVerified: boolean;
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
  });

  // 2. Persist in Firestore for backup/sync
  try {
    const userRef = doc(db, 'users', uid);
    const now = new Date().toISOString();
    await setDoc(
      userRef,
      {
        id: uid,
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        birthDate: profile.birthDate.trim(),
        age: profile.age,
        email: profile.email.trim().toLowerCase(),
        emailVerified: profile.emailVerified,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore user profile sync warning (offline or permissions):', err);
  }
}
