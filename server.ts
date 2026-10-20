import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({ origin: '*' }));
app.use(express.json());

// In-memory verification storage: email -> { pin, expiresAt, firstName }
const verificationCodes = new Map<
  string,
  { pin: string; expiresAt: number; firstName?: string }
>();

/**
 * Clean up expired PINs every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of verificationCodes.entries()) {
    if (entry.expiresAt < now) {
      verificationCodes.delete(email);
    }
  }
}, 5 * 60 * 1000);

/**
 * POST /api/send-email-pin
 * Generates and sends a real 4-digit verification code to the user's email via Resend.
 */
app.post('/api/send-email-pin', async (req: Request, res: Response) => {
  try {
    const { email, firstName } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Correo electrónico requerido' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Formato de correo no válido' });
    }

    // Generate secure 4-digit code (1000 - 9999)
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    verificationCodes.set(cleanEmail, {
      pin,
      expiresAt,
      firstName: typeof firstName === 'string' ? firstName.trim() : undefined,
    });

    const resendApiKey = process.env.RESEND_API_KEY;

    if (resendApiKey && resendApiKey.trim()) {
      const displayName = firstName ? firstName.trim() : 'Usuario';
      
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Código de Verificación - Bóveda Segura</title>
</head>
<body style="margin: 0; padding: 0; background-color: #060b14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #060b14; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #0a121d; border: 1px solid #1e293b; border-radius: 24px; padding: 36px 28px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <tr>
            <td align="center">
              <div style="width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #00e5ff, #2563eb); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="font-size: 28px; line-height: 56px;">🛡️</span>
              </div>
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Bóveda Segura</h1>
              <p style="margin: 0 0 24px 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #00e5ff;">Verificación de Identidad</p>
              
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #94a3b8; text-align: left;">
                Hola <strong style="color: #ffffff;">${displayName}</strong>,<br>
                Ingresa este código de 4 dígitos en la aplicación para verificar tu correo y activar tu espacio de cifrado privado:
              </p>

              <!-- PIN Box -->
              <div style="background-color: #0f172a; border: 2px dashed #00e5ff; border-radius: 16px; padding: 18px 24px; margin: 24px 0; text-align: center;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 12px; color: #00e5ff; display: inline-block; padding-left: 12px;">
                  ${pin}
                </span>
              </div>

              <p style="margin: 0 0 24px 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                ⏱️ Este código expira en <strong>10 minutos</strong>. Si no solicitaste este registro, puedes descartar este correo de forma segura.
              </p>

              <div style="border-top: 1px solid #1e293b; padding-top: 20px; font-size: 11px; color: #475569;">
                Bóveda Segura · Cifrado Militar AES-256-GCM · 100% Privado
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Bóveda Segura <onboarding@resend.dev>',
          to: [cleanEmail],
          subject: `${pin} es tu código de verificación de Bóveda Segura`,
          html: emailHtml,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error('Error from Resend API:', data);
        return res.status(502).json({
          success: false,
          error: data?.message || 'Error al despachar el correo con Resend.',
          needsApiKey: false,
        });
      }

      return res.json({
        success: true,
        delivered: true,
        message: 'Código enviado a tu correo exitosamente.',
      });
    } else {
      // RESEND_API_KEY is not configured yet in environment
      console.warn('RESEND_API_KEY is not set. Simulated code generated:', pin);
      return res.json({
        success: true,
        delivered: false,
        needsApiKey: true,
        message: 'Clave RESEND_API_KEY no detectada en variables de entorno. Para pruebas inmediatas, se ha generado el código:',
        testPin: pin,
      });
    }
  } catch (err: any) {
    console.error('Error in /api/send-email-pin:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Error interno del servidor al procesar el código.',
    });
  }
});

/**
 * POST /api/verify-email-pin
 * Verifies that the entered 4-digit PIN matches the stored active PIN.
 */
app.post('/api/verify-email-pin', (req: Request, res: Response) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ success: false, error: 'Correo y PIN requeridos.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPin = pin.toString().trim();

    const record = verificationCodes.get(cleanEmail);

    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'No se encontró ningún código pendiente para este correo. Solicita uno nuevo.',
      });
    }

    if (Date.now() > record.expiresAt) {
      verificationCodes.delete(cleanEmail);
      return res.status(400).json({
        success: false,
        error: 'El código ha expirado (límite de 10 minutos). Solicita uno nuevo.',
      });
    }

    if (record.pin !== cleanPin) {
      return res.status(400).json({
        success: false,
        error: 'El código de 4 dígitos no coincide. Verifica e intenta de nuevo.',
      });
    }

    // Success: consume the code so it cannot be re-used
    verificationCodes.delete(cleanEmail);
    return res.json({
      success: true,
      message: 'Código verificado correctamente.',
    });
  } catch (err: any) {
    console.error('Error in /api/verify-email-pin:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Error interno al verificar el código.',
    });
  }
});

// Vite dev server mounting or static production serving
async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
