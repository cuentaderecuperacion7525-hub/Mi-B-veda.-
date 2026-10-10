/**
 * Cryptographic engine for Bóveda Segura using Web Crypto API.
 * Uses PBKDF2 (100,000 rounds, SHA-256) + AES-GCM (256-bit).
 */

export const TEST_VERIFICATION_STRING = 'VAULT_VERIFY_KEY_OK';

export function bufToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBuf(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Derives a 256-bit AES-GCM key from user PIN and cryptographic salt
 */
export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports raw key bytes for backup or recovery escrow wrapping
 */
export async function exportMasterKeyRaw(key: CryptoKey): Promise<ArrayBuffer> {
  return await window.crypto.subtle.exportKey('raw', key);
}

/**
 * Imports raw 256-bit AES-GCM master key
 */
export async function importMasterKeyRaw(rawBytes: ArrayBuffer): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives a key for wrapping the master key for email recovery escrow
 */
export async function deriveRecoveryWrapKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 50000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Creates random 16-byte salt
 */
export function generateSalt(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Creates random 12-byte IV for AES-GCM
 */
export function generateIV(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Encrypts an ArrayBuffer payload using AES-GCM
 */
export async function encryptBuffer(
  buffer: ArrayBuffer,
  key: CryptoKey
): Promise<{ iv: number[]; data: ArrayBuffer }> {
  const iv = generateIV();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    buffer
  );

  return {
    iv: Array.from(iv),
    data: encrypted,
  };
}

/**
 * Decrypts an ArrayBuffer using AES-GCM and stored IV
 */
export async function decryptBuffer(
  encryptedData: ArrayBuffer,
  ivArray: number[],
  key: CryptoKey
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(ivArray);
  return await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encryptedData
  );
}

/**
 * Creates verification token for verifying PIN validity during unlock
 */
export async function createVerificationPayload(key: CryptoKey): Promise<{ ivHex: string; cipherHex: string }> {
  const iv = generateIV();
  const testBytes = new TextEncoder().encode(TEST_VERIFICATION_STRING);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    testBytes
  );

  return {
    ivHex: bufToHex(iv),
    cipherHex: bufToHex(new Uint8Array(encrypted)),
  };
}

/**
 * Verifies if a given CryptoKey correctly decrypts the verification token
 */
export async function verifyKey(
  key: CryptoKey,
  ivHex: string,
  cipherHex: string
): Promise<boolean> {
  try {
    const iv = hexToBuf(ivHex);
    const cipher = hexToBuf(cipherHex);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipher as BufferSource
    );
    const str = new TextDecoder().decode(decrypted);
    return str === TEST_VERIFICATION_STRING;
  } catch {
    return false;
  }
}

/**
 * Checks if a given buffer starts with known magic bytes of unencrypted media (images, videos, audio, PDF)
 */
export function checkIsUnencryptedMedia(buffer: ArrayBuffer | Uint8Array | null | undefined): boolean {
  if (!buffer) return false;
  const byteLen = buffer instanceof Uint8Array ? buffer.byteLength : buffer.byteLength;
  if (byteLen < 4) return false;

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer, 0, Math.min(byteLen, 16));

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // GIF: 47 49 46 38 ('GIF8')
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  // WEBP / RIFF: 52 49 46 46 ('RIFF')
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
  // MP4 / MOV: 'ftyp' at offset 4
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
  // PDF: 25 50 44 46 ('%PDF')
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;
  // MP3: 'ID3' (49 44 33) or sync word FF FB / FF F3
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  if (bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) return true;
  // WebM / Matroska: 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true;

  return false;
}

