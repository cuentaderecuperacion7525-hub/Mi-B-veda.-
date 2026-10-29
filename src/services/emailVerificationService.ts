/**
 * Email Verification Service.
 * Connects via Firestore REST bridge + /api/send-email-pin so both Android APK and Web
 * send real confirmation link emails to the exact email address entered by the user.
 */

const CLOUD_RUN_API_BASE = 'https://ais-dev-ilwqchhwklwyavc35ewol3-542088184903.us-west2.run.app';
const FIRESTORE_PROJECT_ID = 'studio-7313343442-ab21c';
const FIRESTORE_DB_ID = 'ai-studio-remixbvedasegura-97d4266f-3ed5-45b1-9490-cec56ba0c191';
const FIRESTORE_COLLECTION_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DB_ID}/documents/email_verifications`;

function isNativeOrRemoteClient(): boolean {
  if (typeof window !== 'undefined') {
    if (
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' && !window.location.port)
    ) {
      return true;
    }
  }
  return false;
}

function getApiEndpoint(path: string): string {
  if (isNativeOrRemoteClient()) {
    return `${CLOUD_RUN_API_BASE}${path}`;
  }
  return path;
}

function getLocalTokenKey(email: string): string {
  return `vault_email_token_${email.trim().toLowerCase()}`;
}

function generateRandomHexToken(bytes = 16): string {
  try {
    const arr = new Uint8Array(bytes);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return (
      Math.random().toString(16).substring(2) +
      Math.random().toString(16).substring(2) +
      Date.now().toString(16)
    ).replace(/[^a-zA-Z0-9]/g, '');
  }
}

export interface SendPinResult {
  success: boolean;
  delivered?: boolean;
  sandboxRestricted?: boolean;
  needsApiKey?: boolean;
  targetEmail?: string;
  message?: string;
  testPin?: string;
  token?: string;
  magicLink?: string;
  error?: string;
}

export interface VerifyPinResult {
  success: boolean;
  email?: string;
  firstName?: string;
  message?: string;
  error?: string;
}

export async function verifyMagicLink(token: string): Promise<VerifyPinResult> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'Token de autenticación no proporcionado.' };
  }

  // 1. Verificar en Firestore primero (funciona en APK y Web sin bloqueo de cookies)
  try {
    const fsRes = await fetch(`${FIRESTORE_COLLECTION_URL}/${encodeURIComponent(cleanToken)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (fsRes.ok) {
      const doc = await fsRes.json();
      const confirmed = Boolean(doc?.fields?.confirmed?.booleanValue);
      const status = doc?.fields?.status?.stringValue || '';
      if (confirmed || status === 'confirmed') {
        return {
          success: true,
          email: doc?.fields?.email?.stringValue,
          firstName: doc?.fields?.firstName?.stringValue,
          message: 'Correo confirmado con éxito.',
        };
      }
    }
  } catch {}

  // 2. Respaldo en servidor local/web
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const endpoint = getApiEndpoint('/api/verify-magic-link');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: cleanToken }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return {
        success: true,
        email: data.email,
        firstName: data.nombre,
        message: data.message || 'Autenticación con enlace exitosa.',
      };
    }
  } catch {}

  return {
    success: false,
    error: 'Aún no hemos detectado la confirmación del enlace en tu correo.',
  };
}

export async function checkEmailConfirmationStatus(
  email: string,
  explicitToken?: string | null
): Promise<{
  confirmed: boolean;
  email?: string;
  firstName?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { confirmed: false };

  let token = (explicitToken || '').trim();
  if (!token) {
    try {
      token = localStorage.getItem(getLocalTokenKey(cleanEmail)) || '';
    } catch {}
  }

  // 1. Consultar estado directamente en Firestore (tiempo real para APK Android y Web)
  if (token) {
    try {
      const fsRes = await fetch(`${FIRESTORE_COLLECTION_URL}/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (fsRes.ok) {
        const doc = await fsRes.json();
        const confirmed = Boolean(doc?.fields?.confirmed?.booleanValue);
        const status = doc?.fields?.status?.stringValue || '';
        if (confirmed || status === 'confirmed') {
          return {
            confirmed: true,
            email: doc?.fields?.email?.stringValue || cleanEmail,
            firstName: doc?.fields?.firstName?.stringValue,
          };
        }
      }
    } catch {}
  }

  // 2. Consultar en el endpoint del servidor si estamos en el mismo origen web
  if (!isNativeOrRemoteClient()) {
    try {
      const endpoint = getApiEndpoint(
        `/api/estado-confirmacion?correo=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(token)}`
      );
      const res = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.confirmado) {
          return {
            confirmed: true,
            email: data.correo || cleanEmail,
            firstName: data.nombre,
          };
        }
      }
    } catch {}
  }

  return { confirmed: false };
}

export async function sendEmailPin(email: string, firstName?: string): Promise<SendPinResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (firstName || 'Usuario').trim() || 'Usuario';
  const token = generateRandomHexToken(16);
  const createdAt = new Date().toISOString();

  try {
    localStorage.setItem(getLocalTokenKey(cleanEmail), token);
  } catch {}

  let firestoreSaved = false;

  // 1. Guardar solicitud 'pending' en Firestore (funciona desde APK Android y Web sin bloqueo de cookies)
  // El servidor detecta este documento al instante y envía el correo real al destinatario (cleanEmail).
  try {
    const fsRes = await fetch(`${FIRESTORE_COLLECTION_URL}/${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          token: { stringValue: token },
          email: { stringValue: cleanEmail },
          firstName: { stringValue: cleanName },
          status: { stringValue: 'pending' },
          confirmed: { booleanValue: false },
          createdAt: { stringValue: createdAt },
        },
      }),
    });
    if (fsRes.ok) {
      firestoreSaved = true;
    }
  } catch (err: any) {
    console.warn('Aviso al registrar solicitud en Firestore:', err?.message);
  }

  // 2. Si estamos en navegador web (mismo origen), llamar también a /api/send-email-pin con el mismo token
  if (!isNativeOrRemoteClient()) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/send-email-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: cleanEmail, firstName: cleanName, token }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return {
          success: true,
          delivered: true,
          targetEmail: cleanEmail,
          token,
          magicLink: data.magicLink,
          message: data.message || `Enlace de confirmación enviado a ${cleanEmail}`,
        };
      }
    } catch {}
  }

  if (firestoreSaved) {
    return {
      success: true,
      delivered: true,
      targetEmail: cleanEmail,
      token,
      message: `Enlace de confirmación enviado a ${cleanEmail}`,
    };
  }

  return {
    success: false,
    delivered: false,
    targetEmail: cleanEmail,
    error: 'No se pudo conectar con el servidor de correo. Verifica tu conexión a internet.',
  };
}

export async function verifyEmailPin(email: string, _pin: string): Promise<VerifyPinResult> {
  const status = await checkEmailConfirmationStatus(email);
  if (status.confirmed) {
    return {
      success: true,
      email: status.email,
      firstName: status.firstName,
      message: 'Correo verificado con éxito.',
    };
  }
  return {
    success: false,
    error: 'Por favor confirma tu correo tocando el enlace que te enviamos.',
  };
}
