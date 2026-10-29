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

// Guarda los PIN y Tokens de Magic Link en memoria
interface RegistroPin {
  pin: string;
  token: string;
  magicLink: string;
  vence: number;
  intentos: number;
  ultimoEnvio: number;
  nombre?: string;
}

const pines = new Map<string, RegistroPin>();
const tokenMap = new Map<string, { correo: string; nombre?: string; vence: number }>();

const VIGENCIA_MS = 10 * 60 * 1000;   // el PIN y enlace vencen en 10 minutos
const ESPERA_MS = 60 * 1000;          // espera entre reenvíos
const MAX_INTENTOS = 5;

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

// Limpieza de PINs y enlaces vencidos cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [correo, reg] of pines.entries()) {
    if (reg.vence < now) {
      pines.delete(correo);
    }
  }
  for (const [token, reg] of tokenMap.entries()) {
    if (reg.vence < now) {
      tokenMap.delete(token);
    }
  }
}, 5 * 60 * 1000);

// 1) Manda el enlace de autenticación y PIN al correo que ESCRIBIÓ EL USUARIO
const handleEnviarPin = async (req: Request, res: Response) => {
  const correo = String(req.body.correo || req.body.email || '').trim().toLowerCase();
  const nombre = String(req.body.nombre || req.body.firstName || '').trim() || 'hola';

  if (!correoValido(correo)) {
    return res.status(400).json({ ok: false, success: false, error: 'Correo no válido' });
  }

  const previo = pines.get(correo);
  if (previo && Date.now() - previo.ultimoEnvio < ESPERA_MS) {
    const restante = Math.ceil((ESPERA_MS - (Date.now() - previo.ultimoEnvio)) / 1000);
    return res.status(429).json({
      ok: false,
      success: false,
      error: `Espera ${restante} segundos para reenviar`,
    });
  }

  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const token = crypto.randomBytes(24).toString('hex');

  // URL base dinámica del origen de la petición
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'ais-dev-ilwqchhwklwyavc35ewol3-542088184903.us-west2.run.app';
  const magicLink = `${proto}://${host}/?auth_token=${token}&email=${encodeURIComponent(correo)}`;

  try {
    const info = await transporter.sendMail({
      from: `"Bóveda Familiar" <${GMAIL_USER}>`,
      to: correo, // <- el correo que escribió la persona, NO el de la cuenta de Google
      subject: 'Tu enlace de acceso a Bóveda Familiar',
      text: `Hola ${nombre},\n\nPara autenticarte y acceder a tu Bóveda Familiar, haz clic en el siguiente enlace:\n${magicLink}\n\nO utiliza tu código de acceso: ${pin}\nVence en 10 minutos. Si no lo pediste, ignora este mensaje.\n\nBóveda Familiar`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 440px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 14px; background: #ffffff;">
          <h2 style="margin: 0 0 10px 0; color: #111827; font-size: 20px;">Bóveda Familiar</h2>
          <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px;">Hola ${nombre}, para autenticarte y entrar a tu bóveda, haz clic en el siguiente botón:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${magicLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
              Autenticar y Entrar a mi Bóveda
            </a>
          </div>
          <p style="margin: 16px 0 6px 0; color: #4b5563; font-size: 13px; text-align: center;">O si prefieres, escribe tu código de acceso:</p>
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px; text-align: center; margin: 6px 0 16px 0;">
            <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #15803d; font-family: monospace;">${pin}</span>
          </div>
          <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px; text-align: center;">Vence en 10 minutos. Si no lo pediste, ignora este mensaje.</p>
        </div>`
    });

    // Gmail a veces acepta el envío pero rechaza al destinatario
    if (info.rejected && info.rejected.length > 0) {
      console.error('Rechazado:', info.rejected, info.response);
      return res.status(502).json({ ok: false, success: false, error: 'El correo fue rechazado' });
    }

    console.log('Enlace y PIN enviados a', correo, '| accepted:', info.accepted, '| id:', info.messageId);
    const vence = Date.now() + VIGENCIA_MS;
    pines.set(correo, { pin, token, magicLink, vence, intentos: 0, ultimoEnvio: Date.now(), nombre });
    tokenMap.set(token, { correo, nombre, vence });

    return res.json({
      ok: true,
      success: true,
      delivered: true,
      targetEmail: correo,
      testPin: pin,
      token,
      magicLink,
      message: 'Enlace y código de acceso enviados exitosamente a tu correo.',
    });
  } catch (err: any) {
    console.error('ERROR al enviar a', correo, err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: err?.message || 'No se pudo enviar el correo',
    });
  }
};

app.post('/api/enviar-pin', handleEnviarPin);
app.post('/api/send-email-pin', handleEnviarPin);
app.post('/api/send-magic-link', handleEnviarPin);

// Valida el Token de enlace mágico recibido al hacer clic
app.post('/api/verify-magic-link', (req: Request, res: Response) => {
  const token = String(req.body.token || '').trim();
  if (!token) {
    return res.status(400).json({ ok: false, success: false, error: 'Token de autenticación requerido.' });
  }
  const registro = tokenMap.get(token);
  if (!registro) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'El enlace de autenticación no es válido o ya fue utilizado.',
    });
  }
  if (Date.now() > registro.vence) {
    tokenMap.delete(token);
    return res.status(400).json({ ok: false, success: false, error: 'El enlace de autenticación ha vencido.' });
  }

  tokenMap.delete(token);
  pines.delete(registro.correo);
  console.log(`[MAGIC LINK] Autenticación exitosa vía enlace para: ${registro.correo}`);
  return res.json({
    ok: true,
    success: true,
    email: registro.correo,
    nombre: registro.nombre,
    message: 'Autenticación con enlace exitosa.',
  });
});

// 2) Valida el PIN que escribió la persona
const handleVerificarPin = (req: Request, res: Response) => {
  const correo = String(req.body.correo || req.body.email || '').trim().toLowerCase();
  const pin = String(req.body.pin || '').trim();
  const registro = pines.get(correo);

  if (!registro) {
    return res.status(400).json({ ok: false, success: false, error: 'Pide un código primero' });
  }
  if (Date.now() > registro.vence) {
    pines.delete(correo);
    return res.status(400).json({ ok: false, success: false, error: 'El código venció' });
  }
  if (registro.intentos >= MAX_INTENTOS) {
    pines.delete(correo);
    return res.status(429).json({ ok: false, success: false, error: 'Demasiados intentos, pide otro código' });
  }

  registro.intentos++;
  if (pin !== registro.pin) {
    return res.status(400).json({ ok: false, success: false, error: 'Código incorrecto' });
  }

  pines.delete(correo); // el PIN solo sirve una vez
  return res.json({ ok: true, success: true, message: 'Código verificado correctamente.' });
};

app.post('/api/verificar-pin', handleVerificarPin);
app.post('/api/verify-email-pin', handleVerificarPin);

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
