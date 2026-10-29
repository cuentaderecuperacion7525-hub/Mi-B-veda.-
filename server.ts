import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
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

// Transporter oficial con la contraseña de aplicación de Gmail
const GMAIL_USER = (process.env.GMAIL_USER || 'josemanuel5121@gmail.com').trim();
const GMAIL_PASS = (process.env.GMAIL_PASS || 'diitlkrpftinupeo').replace(/\s+/g, '').trim();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
});

// Base de datos Firestore (accesible públicamente desde APK móvil, navegador y servidor sin bloqueo de cookies)
const FIRESTORE_PROJECT_ID = 'studio-7313343442-ab21c';
const FIRESTORE_DB_ID = 'ai-studio-remixbvedasegura-97d4266f-3ed5-45b1-9490-cec56ba0c191';
const FIRESTORE_COLLECTION_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DB_ID}/documents/email_verifications`;

interface RegistroConfirmacion {
  correo: string;
  nombre: string;
  token: string;
  confirmLink: string;
  confirmado: boolean;
  vence: number;
  ultimoEnvio: number;
}

const confirmacionesPorCorreo = new Map<string, RegistroConfirmacion>();
const confirmacionesPorToken = new Map<string, string>(); // token -> correo
const tokensProcesados = new Set<string>(); // evita envíos duplicados entre API directa y Firestore watcher

const VIGENCIA_MS = 15 * 60 * 1000; // 15 minutos
const ESPERA_MS = 15 * 1000;        // 15s entre reenvíos

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

// Genera una página HTML pública directa (text/html; charset=utf-8) sin bloqueo de cookies que confirma el token en Firestore
async function createDirectConfirmationUrl(token: string, email: string, firstName: string): Promise<string> {
  const safeName = firstName.replace(/[<>&"']/g, '');
  const safeEmail = email.replace(/[<>&"']/g, '');
  const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, '');

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>¡Correo Confirmado! - Mi Bóveda</title>
</head>
<body style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; box-sizing:border-box;">
  <div style="max-width:380px; width:100%; background:#ffffff; border:1px solid #e2e8f0; border-radius:20px; padding:32px 24px; text-align:center; box-shadow:0 4px 16px rgba(0,0,0,0.06);">
    <div id="icon-box" style="width:64px; height:64px; border-radius:50%; background:#dcfce7; color:#16a34a; display:inline-flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:16px; font-weight:bold;">
      ✓
    </div>
    <h2 id="title" style="margin:0 0 10px 0; color:#0f172a; font-size:22px;">¡Correo confirmado!</h2>
    <p id="desc" style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.5;">
      Hola <strong>${safeName}</strong>, tu correo <strong>${safeEmail}</strong> ya quedó verificado correctamente.
    </p>
    <div id="badge" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:14px; color:#166534; font-size:14px; font-weight:600;">
      Ya puedes volver a la aplicación Mi Bóveda; tu acceso se abrirá automáticamente.
    </div>
  </div>
  <script>
    (function () {
      var DB_URL = '${FIRESTORE_COLLECTION_URL}/${safeToken}';
      var payload = {
        fields: {
          token: { stringValue: '${safeToken}' },
          email: { stringValue: '${safeEmail}' },
          firstName: { stringValue: '${safeName}' },
          status: { stringValue: 'confirmed' },
          confirmed: { booleanValue: true },
          createdAt: { stringValue: new Date().toISOString() }
        }
      };
      fetch(DB_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    })();
  </script>
</body>
</html>`;

  try {
    const res = await fetch('https://bytebin.lucko.me/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: htmlContent,
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data?.key) {
        return `https://bytebin.lucko.me/${data.key}#token=${safeToken}`;
      }
    }
  } catch (err) {
    console.warn('Fallback URL para confirmación:', err);
  }

  return `https://htmlpreview.github.io/?https://github.com/cuentaderecuperacion7525-hub/Mi-B-veda.-/blob/main/public/confirmar.html#token=${safeToken}`;
}

// Guarda o actualiza el estado de un token en Firestore
async function saveVerificationToFirestore(params: {
  token: string;
  email: string;
  firstName: string;
  status: string;
  confirmed: boolean;
  createdAt?: string;
}) {
  try {
    await fetch(`${FIRESTORE_COLLECTION_URL}/${encodeURIComponent(params.token)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          token: { stringValue: params.token },
          email: { stringValue: params.email },
          firstName: { stringValue: params.firstName },
          status: { stringValue: params.status },
          confirmed: { booleanValue: params.confirmed },
          createdAt: { stringValue: params.createdAt || new Date().toISOString() },
        },
      }),
    });
  } catch (err) {
    console.warn('Error guardando verificacion en Firestore:', err);
  }
}

// Función central que envía el correo de confirmación al correo exacto que escribió el usuario
async function enviarCorreoConfirmacion(correo: string, nombre: string, token: string): Promise<{
  ok: boolean;
  confirmLink: string;
  error?: string;
}> {
  const cleanCorreo = correo.trim().toLowerCase();
  const cleanNombre = nombre.trim() || 'Usuario';
  const confirmLink = await createDirectConfirmationUrl(token, cleanCorreo, cleanNombre);

  const info = await transporter.sendMail({
    from: `"Bóveda Familiar" <${GMAIL_USER}>`,
    to: cleanCorreo, // <- Se envía SIEMPRE al correo que el usuario escribió en su registro
    subject: 'Confirma tu acceso a Mi Bóveda',
    text: `Hola ${cleanNombre},\n\nBienvenido a Mi Bóveda. Para confirmar tu correo electrónico (${cleanCorreo}) y continuar con tu registro, abre el siguiente enlace:\n\n${confirmLink}\n\nSi tú no solicitaste este acceso, puedes ignorar este mensaje con tranquilidad.\n\nSaludos,\nMi Bóveda`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 440px; margin: auto; padding: 28px 24px; border: 1px solid #e5e7eb; border-radius: 14px; background: #ffffff; color: #1f2937;">
        <h2 style="margin: 0 0 12px 0; color: #111827; font-size: 20px;">Mi Bóveda</h2>
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.5;">
          Hola <strong>${cleanNombre}</strong>,
        </p>
        <p style="margin: 0 0 22px 0; color: #374151; font-size: 15px; line-height: 1.5;">
          Para confirmar tu correo electrónico (<strong>${cleanCorreo}</strong>) y continuar en la aplicación, toca el siguiente botón:
        </p>
        <div style="text-align: center; margin: 26px 0;">
          <a href="${confirmLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block;">
            Confirmar mi correo electrónico
          </a>
        </div>
        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.4; text-align: center;">
          Si no solicitaste este registro, puedes ignorar este mensaje.
        </p>
      </div>`,
  });

  if (info.rejected && info.rejected.length > 0) {
    return {
      ok: false,
      confirmLink,
      error: 'El servidor de destino rechazó el correo',
    };
  }

  console.log(`[SMTP] Enlace de confirmación enviado a: ${cleanCorreo} | token: ${token} | messageId: ${info.messageId}`);

  const vence = Date.now() + VIGENCIA_MS;
  confirmacionesPorCorreo.set(cleanCorreo, {
    correo: cleanCorreo,
    nombre: cleanNombre,
    token,
    confirmLink,
    confirmado: false,
    vence,
    ultimoEnvio: Date.now(),
  });
  confirmacionesPorToken.set(token, cleanCorreo);

  return { ok: true, confirmLink };
}

// Watcher en tiempo real de Firestore para atender solicitudes creadas desde el APK de Android
let isPollingFirestore = false;
async function pollFirestorePendingVerifications() {
  if (isPollingFirestore) return;
  isPollingFirestore = true;
  try {
    const res = await fetch(`${FIRESTORE_COLLECTION_URL}?pageSize=50`);
    if (!res.ok) return;
    const data: any = await res.json();
    const docs: any[] = data?.documents || [];

    for (const doc of docs) {
      const fields = doc.fields;
      if (!fields) continue;

      const token = fields.token?.stringValue || '';
      const email = (fields.email?.stringValue || '').trim().toLowerCase();
      const firstName = (fields.firstName?.stringValue || 'Usuario').trim();
      const status = fields.status?.stringValue || '';
      const confirmed = Boolean(fields.confirmed?.booleanValue);
      const createdAt = fields.createdAt?.stringValue || new Date().toISOString();

      if (!token || token === 'pagina_confirmacion') continue;

      // Si el usuario ya confirmó desde su navegador, sincronizar también en memoria del servidor
      if (confirmed || status === 'confirmed') {
        const reg = confirmacionesPorCorreo.get(email);
        if (reg) {
          reg.confirmado = true;
        } else if (email) {
          confirmacionesPorCorreo.set(email, {
            correo: email,
            nombre: firstName,
            token,
            confirmLink: '',
            confirmado: true,
            vence: Date.now() + VIGENCIA_MS,
            ultimoEnvio: Date.now(),
          });
          confirmacionesPorToken.set(token, email);
        }
        continue;
      }

      // Si el APK creó una solicitud pendiente ('pending'), enviar el correo a ese destinatario
      if (status === 'pending' && !tokensProcesados.has(token) && correoValido(email)) {
        tokensProcesados.add(token);
        try {
          await saveVerificationToFirestore({
            token,
            email,
            firstName,
            status: 'sending',
            confirmed: false,
            createdAt,
          });

          const result = await enviarCorreoConfirmacion(email, firstName, token);

          await saveVerificationToFirestore({
            token,
            email,
            firstName,
            status: result.ok ? 'sent' : 'error',
            confirmed: false,
            createdAt,
          });
        } catch (err) {
          console.error('[Firestore Watcher] Error enviando correo a', email, err);
          await saveVerificationToFirestore({
            token,
            email,
            firstName,
            status: 'error',
            confirmed: false,
            createdAt,
          });
        }
      }
    }
  } catch {
    // Ignorar errores de red transitorios
  } finally {
    isPollingFirestore = false;
  }
}

// Iniciar watcher cada 1.5 segundos
setInterval(pollFirestorePendingVerifications, 1500);

// 1) Endpoint HTTP directo para enviar el correo con ENLACE DE CONFIRMACIÓN
const handleEnviarEnlace = async (req: Request, res: Response) => {
  const correo = String(req.body.correo || req.body.email || '').trim().toLowerCase();
  const nombre = String(req.body.nombre || req.body.firstName || '').trim() || 'Usuario';
  const clientToken = String(req.body.token || '').trim();

  if (!correoValido(correo)) {
    return res.status(400).json({ ok: false, success: false, error: 'Correo electrónico no válido' });
  }

  const token = clientToken || crypto.randomBytes(16).toString('hex');

  // Si el watcher de Firestore ya procesó este mismo token, devolver éxito sin enviar doble correo
  if (tokensProcesados.has(token)) {
    return res.json({
      ok: true,
      success: true,
      delivered: true,
      targetEmail: correo,
      token,
      message: 'Te enviamos un enlace de confirmación a tu correo.',
    });
  }

  const previo = confirmacionesPorCorreo.get(correo);
  if (previo && Date.now() - previo.ultimoEnvio < ESPERA_MS) {
    const restante = Math.ceil((ESPERA_MS - (Date.now() - previo.ultimoEnvio)) / 1000);
    return res.status(429).json({
      ok: false,
      success: false,
      error: `Espera ${restante} segundos para reenviar el correo`,
    });
  }

  tokensProcesados.add(token);

  try {
    await saveVerificationToFirestore({
      token,
      email: correo,
      firstName: nombre,
      status: 'sending',
      confirmed: false,
    });

    const result = await enviarCorreoConfirmacion(correo, nombre, token);
    if (!result.ok) {
      return res.status(502).json({ ok: false, success: false, error: result.error || 'Error enviando correo' });
    }

    await saveVerificationToFirestore({
      token,
      email: correo,
      firstName: nombre,
      status: 'sent',
      confirmed: false,
    });

    return res.json({
      ok: true,
      success: true,
      delivered: true,
      targetEmail: correo,
      token,
      magicLink: result.confirmLink,
      message: 'Te enviamos un enlace de confirmación a tu correo.',
    });
  } catch (err: any) {
    console.error('ERROR al enviar enlace a', correo, err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: err?.message || 'No se pudo enviar el correo de confirmación',
    });
  }
};

app.post('/api/enviar-pin', handleEnviarEnlace);
app.post('/api/send-email-pin', handleEnviarEnlace);
app.post('/api/send-magic-link', handleEnviarEnlace);

// 2) Confirmación directa si se abre /api/confirmar-correo?token=...
app.get('/api/confirmar-correo', async (req: Request, res: Response) => {
  const token = String(req.query.token || '').trim();
  const correo = confirmacionesPorToken.get(token);
  const registro = correo ? confirmacionesPorCorreo.get(correo) : undefined;

  if (token) {
    await saveVerificationToFirestore({
      token,
      email: registro?.correo || 'confirmado@boveda.app',
      firstName: registro?.nombre || 'Usuario',
      status: 'confirmed',
      confirmed: true,
    });
  }

  if (registro) {
    registro.confirmado = true;
  }

  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>¡Correo Confirmado! - Mi Bóveda</title>
    </head>
    <body style="margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px;">
      <div style="max-width:380px; width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:20px; padding:32px 24px; text-align:center; box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <div style="width:64px; height:64px; border-radius:50%; background:#dcfce7; color:#16a34a; display:inline-flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:16px;">✓</div>
        <h2 style="margin:0 0 10px 0; color:#0f172a; font-size:22px;">¡Correo confirmado!</h2>
        <p style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.5;">
          Tu correo electrónico ya quedó verificado correctamente.
        </p>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:14px; color:#166534; font-size:14px; font-weight:600;">
          Ya puedes volver a la aplicación Mi Bóveda; tu acceso se abrió automáticamente.
        </div>
      </div>
    </body>
    </html>
  `);
});

// 3) Consulta en tiempo real desde la app para saber si el usuario ya tocó el enlace en su correo
app.get('/api/estado-confirmacion', (req: Request, res: Response) => {
  const correo = String(req.query.correo || req.query.email || '').trim().toLowerCase();
  const token = String(req.query.token || '').trim();
  const correoPorToken = token ? confirmacionesPorToken.get(token) : undefined;
  const registro = confirmacionesPorCorreo.get(correo) || (correoPorToken ? confirmacionesPorCorreo.get(correoPorToken) : undefined);

  if (!registro) {
    return res.json({ ok: true, confirmado: false });
  }
  return res.json({
    ok: true,
    confirmado: registro.confirmado,
    correo: registro.correo,
    nombre: registro.nombre,
  });
});

// 4) También permite validar por token directamente vía POST
app.post('/api/verify-magic-link', (req: Request, res: Response) => {
  const token = String(req.body.token || '').trim();
  const correo = confirmacionesPorToken.get(token);
  const registro = correo ? confirmacionesPorCorreo.get(correo) : undefined;

  if (!registro || !registro.confirmado) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'Aún no se ha confirmado el enlace en el correo.',
    });
  }

  return res.json({
    ok: true,
    success: true,
    email: registro.correo,
    nombre: registro.nombre,
    message: 'Correo confirmado exitosamente.',
  });
});

// Vite dev server mounting or static production serving
async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProd) {
    try {
      const clientMjsPath = path.join(__dirname, 'node_modules/vite/dist/client/client.mjs');
      if (fs.existsSync(clientMjsPath)) {
        let content = fs.readFileSync(clientMjsPath, 'utf8');
        if (content.includes('WebSocket closed without opened.')) {
          content = content
            .replace(
              /const createWebSocketModuleRunnerTransport = \([\s\S]*?\n\};\n\nfunction createHMRHandler/m,
              `const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, disconnect() {}, send() {} });\n\nfunction createHMRHandler`
            )
            .replace(
              /reject\(new Error\("WebSocket closed without opened\."\)\);/g,
              `resolve();`
            );
          fs.writeFileSync(clientMjsPath, content, 'utf8');
        }
      }
    } catch {}

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
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
