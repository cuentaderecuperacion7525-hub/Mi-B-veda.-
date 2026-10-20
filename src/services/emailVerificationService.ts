/**
 * Email Verification Service.
 * Connects to /api/send-email-pin and /api/verify-email-pin.
 */

export interface SendPinResult {
  success: boolean;
  delivered?: boolean;
  needsApiKey?: boolean;
  message?: string;
  testPin?: string;
  error?: string;
}

export interface VerifyPinResult {
  success: boolean;
  message?: string;
  error?: string;
}

export async function sendEmailPin(email: string, firstName?: string): Promise<SendPinResult> {
  try {
    const res = await fetch('/api/send-email-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, firstName }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: data?.error || 'No se pudo enviar el correo de verificación.',
      };
    }

    return {
      success: true,
      delivered: data?.delivered,
      needsApiKey: data?.needsApiKey,
      message: data?.message,
      testPin: data?.testPin,
    };
  } catch (err: any) {
    console.error('Network error calling /api/send-email-pin:', err);
    return {
      success: false,
      error: 'Error de conexión con el servicio de correo. Verifica tu conexión a internet.',
    };
  }
}

export async function verifyEmailPin(email: string, pin: string): Promise<VerifyPinResult> {
  try {
    const res = await fetch('/api/verify-email-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, pin }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        error: data?.error || 'Código incorrecto o expirado.',
      };
    }

    return {
      success: true,
      message: data?.message || 'Código verificado con éxito.',
    };
  } catch (err: any) {
    console.error('Network error calling /api/verify-email-pin:', err);
    return {
      success: false,
      error: 'Error de conexión al verificar el código.',
    };
  }
}
