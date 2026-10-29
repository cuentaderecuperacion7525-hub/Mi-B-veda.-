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

// Transporter oficial con tu nueva contraseña de aplicación
const GMAIL_USER = (process.env.GMAIL_USER || 'josemanuel5121@gmail.com').trim();
const GMAIL_PASS = (process.env.GMAIL_PASS || 'diitlkrpftinupeo').replace(/\s+/g, '').trim();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
});

// Guarda las solicitudes de confirmación por enlace en memoria
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

const VIGENCIA_MS = 15 * 60 * 1000;   // el enlace vence en 15 minutos
const ESPERA_MS = 30 * 1000;          // espera de 30s entre reenvíos

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

// Limpieza de registros vencidos cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [correo, reg] of confirmacionesPorCorreo.entries()) {
    if (reg.vence < now && !reg.confirmado) {
      confirmacionesPorCorreo.delete(correo);
      confirmacionesPorToken.delete(reg.token);
    }
  }
}, 5 * 60 * 1000);

// 1) Envía el correo con ENLACE DE CONFIRMACIÓN (sin números ni códigos OTP)
const handleEnviarEnlace = async (req: Request, res: Response) => {
  const correo = String(req.body.correo || req.body.email || '').trim().toLowerCase();
  const nombre = String(req.body.nombre || req.body.firstName || '').trim() || 'Usuario';

  if (!correoValido(correo)) {
    return res.status(400).json({ ok: false, success: false, error: 'Correo electrónico no válido' });
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

  const token = crypto.randomBytes(24).toString('hex');

  // URL pública del servidor para que funcione desde cualquier teléfono o correo
  const publicBaseUrl = 'https://ais-dev-ilwqchhwklwyavc35ewol3-542088184903.us-west2.run.app';
  const confirmLink = `${publicBaseUrl}/api/confirmar-correo?token=${token}`;

  try {
    const info = await transporter.sendMail({
      from: `"Bóveda Familiar" <${GMAIL_USER}>`,
      to: correo, // <- exactamente el correo que escribió la persona
      subject: 'Confirma tu acceso a Bóveda Familiar',
      text: `Hola ${nombre},\n\nBienvenido a Bóveda Familiar. Para confirmar tu correo y activar tu cuenta, abre el siguiente enlace:\n\n${confirmLink}\n\nSi tú no solicitaste este acceso, puedes ignorar este mensaje con tranquilidad.\n\nSaludos,\nBóveda Familiar`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 440px; margin: auto; padding: 28px 24px; border: 1px solid #e5e7eb; border-radius: 14px; background: #ffffff; color: #1f2937;">
          <h2 style="margin: 0 0 12px 0; color: #111827; font-size: 20px;">Bóveda Familiar</h2>
          <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.5;">
            Hola <strong>${nombre}</strong>,
          </p>
          <p style="margin: 0 0 22px 0; color: #374151; font-size: 15px; line-height: 1.5;">
            Para confirmar tu correo electrónico y continuar en la aplicación, toca el siguiente botón:
          </p>
          <div style="text-align: center; margin: 26px 0;">
            <a href="${confirmLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block;">
              Confirmar mi correo electrónico
            </a>
          </div>
          <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.4; text-align: center;">
            Si no solicitaste este registro, puedes ignorar este mensaje.
          </p>
        </div>`
    });

    if (info.rejected && info.rejected.length > 0) {
      console.error('Rechazado:', info.rejected, info.response);
      return res.status(502).json({ ok: false, success: false, error: 'El servidor de destino rechazó el correo' });
    }

    console.log('Enlace de confirmación enviado a', correo, '| id:', info.messageId);
    const vence = Date.now() + VIGENCIA_MS;
    if (previo?.token) {
      confirmacionesPorToken.delete(previo.token);
    }
    confirmacionesPorCorreo.set(correo, {
      correo,
      nombre,
      token,
      confirmLink,
      confirmado: false,
      vence,
      ultimoEnvio: Date.now(),
    });
    confirmacionesPorToken.set(token, correo);

    return res.json({
      ok: true,
      success: true,
      delivered: true,
      targetEmail: correo,
      token,
      magicLink: confirmLink,
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

// 2) Cuando el usuario toca el enlace dentro de su correo (GET /api/confirmar-correo?token=...)
app.get('/api/confirmar-correo', (req: Request, res: Response) => {
  const token = String(req.query.token || '').trim();
  const correo = confirmacionesPorToken.get(token);
  const registro = correo ? confirmacionesPorCorreo.get(correo) : undefined;

  if (!registro || Date.now() > registro.vence) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Enlace caducado - Bóveda Familiar</title>
      </head>
      <body style="margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px;">
        <div style="max-width:380px; width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:20px; padding:32px 24px; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <div style="font-size:42px; margin-bottom:12px;">⚠️</div>
          <h2 style="margin:0 0 8px 0; color:#0f172a; font-size:20px;">Enlace expirado o no válido</h2>
          <p style="margin:0; color:#475569; font-size:14px; line-height:1.5;">Por favor solicita un nuevo enlace de confirmación desde la aplicación.</p>
        </div>
      </body>
      </html>
    `);
  }

  registro.confirmado = true;
  console.log(`[CONFIRMACIÓN] Correo confirmado exitosamente por enlace: ${registro.correo}`);

  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>¡Correo Confirmado! - Bóveda Familiar</title>
    </head>
    <body style="margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px;">
      <div style="max-width:380px; width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:20px; padding:32px 24px; text-align:center; box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <div style="width:64px; height:64px; border-radius:50%; background:#dcfce7; color:#16a34a; display:inline-flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:16px;">✓</div>
        <h2 style="margin:0 0 10px 0; color:#0f172a; font-size:22px;">¡Correo confirmado!</h2>
        <p style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.5;">
          Hola <strong>${registro.nombre}</strong>, tu correo <strong>${registro.correo}</strong> ya quedó verificado.
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
  const registro = confirmacionesPorCorreo.get(correo);
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

  if (!registro) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'El enlace de autenticación no es válido o ya expiró.',
    });
  }

  registro.confirmado = true;
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
