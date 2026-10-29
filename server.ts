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

// Guarda los PIN en memoria: correo -> { pin, vence, intentos, ultimoEnvio, nombre }
interface RegistroPin {
  pin: string;
  vence: number;
  intentos: number;
  ultimoEnvio: number;
  nombre?: string;
}

const pines = new Map<string, RegistroPin>();

const VIGENCIA_MS = 10 * 60 * 1000;   // el PIN vence en 10 minutos
const ESPERA_MS = 60 * 1000;          // espera entre reenvíos
const MAX_INTENTOS = 5;

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

// Limpieza de PINs vencidos cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [correo, reg] of pines.entries()) {
    if (reg.vence < now) {
      pines.delete(correo);
    }
  }
}, 5 * 60 * 1000);

// 1) Manda el PIN al correo que ESCRIBIÓ EL USUARIO
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

  try {
    const info = await transporter.sendMail({
      from: `"Bóveda Familiar" <${GMAIL_USER}>`,
      to: correo, // <- el correo que escribió la persona, NO el de la cuenta de Google
      subject: 'Tu código de acceso a Bóveda Familiar',
      text: `Hola ${nombre}, tu código de acceso es ${pin}. Vence en 10 minutos. Si no lo pediste, ignora este mensaje.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
          <h2 style="margin: 0 0 12px 0; color: #111827;">Bóveda Familiar</h2>
          <p style="margin: 0 0 16px 0; color: #374151;">Hola ${nombre}, este es tu código de acceso:</p>
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px; text-align: center; margin: 16px 0;">
            <p style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #15803d; font-family: monospace;">${pin}</p>
          </div>
          <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px;">Vence en 10 minutos.</p>
          <p style="margin: 0; color: #6b7280; font-size: 12px;">Si no lo pediste, ignora este mensaje.</p>
        </div>`
    });

    // Gmail a veces acepta el envío pero rechaza al destinatario
    if (info.rejected && info.rejected.length > 0) {
      console.error('Rechazado:', info.rejected, info.response);
      return res.status(502).json({ ok: false, success: false, error: 'El correo fue rechazado' });
    }

    console.log('PIN enviado a', correo, '| accepted:', info.accepted, '| id:', info.messageId);
    pines.set(correo, { pin, vence: Date.now() + VIGENCIA_MS, intentos: 0, ultimoEnvio: Date.now(), nombre });

    return res.json({
      ok: true,
      success: true,
      delivered: true,
      targetEmail: correo,
      testPin: pin,
      message: 'Código enviado a tu correo exitosamente.',
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
