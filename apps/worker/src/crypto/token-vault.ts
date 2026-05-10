/**
 * Encrypt and decrypt teacher OAuth refresh tokens for at-rest storage in D1.
 *
 * Uses AES-GCM with a 256-bit key supplied as a base64 secret. Each encryption
 * generates a fresh 96-bit IV and stores it alongside the ciphertext.
 *
 * Storage format: base64(IV || ciphertext || authTag)
 *   - 12 bytes IV
 *   - N bytes ciphertext
 *   - 16 bytes auth tag (appended by SubtleCrypto)
 *
 * Rotation: replace TOKEN_VAULT_KEY in Wrangler secrets and re-encrypt rows
 * during a maintenance window.
 */

const IV_BYTES = 12;

let cachedKey: { raw: string; key: CryptoKey } | null = null;

async function importKey(rawBase64: string): Promise<CryptoKey> {
  if (cachedKey?.raw === rawBase64) return cachedKey.key;
  const keyBytes = base64ToBytes(rawBase64);
  if (keyBytes.length !== 32) {
    throw new Error(`TOKEN_VAULT_KEY must be 32 bytes (got ${keyBytes.length}). Use \`openssl rand -base64 32\`.`);
  }
  const key = await crypto.subtle.importKey(
    'raw',
    asArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedKey = { raw: rawBase64, key };
  return key;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Detach from the (possibly SharedArrayBuffer) backing store and return a
  // fresh ArrayBuffer slice to satisfy SubtleCrypto's BufferSource arg.
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export async function encryptRefreshToken(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(data),
  );
  const cipher = new Uint8Array(cipherBuffer);
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return bytesToBase64(out);
}

export async function decryptRefreshToken(encoded: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const all = base64ToBytes(encoded);
  if (all.length <= IV_BYTES + 16) {
    throw new Error('Encrypted token payload is too short.');
  }
  const iv = all.subarray(0, IV_BYTES);
  const cipher = all.subarray(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(cipher),
  );
  return new TextDecoder().decode(plain);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export const __testing = { base64ToBytes, bytesToBase64 };
