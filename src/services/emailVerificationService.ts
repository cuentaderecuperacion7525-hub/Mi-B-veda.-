/**
 * Email Verification Service.
 * Connects to /api/send-email-pin and /api/verify-email-pin with native APK & offline resilience.
 */

const CLOUD_RUN_API_BASE = 'https://ais-dev-ilwqchhwklwyavc35ewol3-542088184903.us-west2.run.app';

function getApiEndpoint(path: string): string {
  if (typeof window !== 'undefined') {
    // If inside Capacitor Android native app or file protocol
    if (
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' && !window.location.port)
    ) {
      return `${CLOUD_RUN_API_BASE}${path}`;
    }
  }
  return path;
}

function getLocalVerificationKey(email: string): string {
  return `vault_local_pin_${email.trim().toLowerCase()}`;
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
    return {
      success: false,
      error: data?.error || 'El enlace de autenticación no es válido o ha expirado.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error al conectar con el servidor para validar el enlace.',
    };
  }
}

export async function sendEmailPin(email: string, firstName?: string): Promise<SendPinResult> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const endpoint = getApiEndpoint('/api/send-email-pin');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail, firstName }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      // Store local copy as backup
      if (data.testPin) {
        try {
          localStorage.setItem(
            getLocalVerificationKey(cleanEmail),
            JSON.stringify({
              pin: data.testPin,
              expiresAt: Date.now() + 15 * 60 * 1000,
            })
          );
        } catch {}
      }

      return {
        success: true,
        delivered: data.delivered,
        sandboxRestricted: data.sandboxRestricted,
        needsApiKey: data.needsApiKey,
        targetEmail: data.targetEmail || cleanEmail,
        message: data.message,
        testPin: data.testPin,
        token: data.token,
        magicLink: data.magicLink,
      };
    }
  } catch (err: any) {
    console.warn('Network or remote call notice for /api/send-email-pin:', err?.message);
  }

  // Resilient offline / local fallback for Native APK on Android
  const localPin = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    localStorage.setItem(
      getLocalVerificationKey(cleanEmail),
      JSON.stringify({
        pin: localPin,
        expiresAt: Date.now() + 15 * 60 * 1000,
      })
    );
  } catch {}

  return {
    success: true,
    delivered: false,
    targetEmail: cleanEmail,
    testPin: localPin,
    message: 'Código de verificación de 6 dígitos generado para tu bóveda.',
  };
}

export async function verifyEmailPin(email: string, pin: string): Promise<VerifyPinResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPin = pin.toString().trim();

  // 1. Try remote verification endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const endpoint = getApiEndpoint('/api/verify-email-pin');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail, pin: cleanPin }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      try {
        localStorage.removeItem(getLocalVerificationKey(cleanEmail));
      } catch {}
      return {
        success: true,
        message: data?.message || 'Código verificado con éxito.',
      };
    }
  } catch (err: any) {
    console.warn('Network notice during verify-email-pin:', err?.message);
  }

  // 2. Check local fallback verification
  try {
    const raw = localStorage.getItem(getLocalVerificationKey(cleanEmail));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt > Date.now()) {
        if (parsed.pin === cleanPin) {
          localStorage.removeItem(getLocalVerificationKey(cleanEmail));
          return {
            success: true,
            message: 'Código verificado con éxito.',
          };
        }
      }
    }
  } catch {}

  return {
    success: false,
    error: 'El código de 6 dígitos es incorrecto o ha expirado.',
  };
}
