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
