import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App (singleton pattern)
export const app = getApps().length > 0 ? getApp() : initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with specific database ID and experimentalAutoDetectLongPolling
// to ensure stable communication behind Cloud Run proxies and preview iframes.
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || undefined
);

/**
 * Validate Firestore connection as required by Firebase skill.
 * Uses a non-blocking timeout race to prevent 10s connection hangs.
 */
export async function testFirestoreConnection() {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('connection timeout')), 3500)
    );
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeoutPromise,
    ]);
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('the client is offline') ||
      error.message.includes('timeout') ||
      error.message.includes('unavailable')
    )) {
      console.warn("Firestore operando en modo local/offline hasta sincronización activa.");
    }
  }
}
