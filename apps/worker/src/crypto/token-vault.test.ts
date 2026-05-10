import { describe, it, expect } from 'vitest';
import { encryptRefreshToken, decryptRefreshToken, __testing } from './token-vault';

const KEY = __testing.bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));

describe('token-vault', () => {
  it('encrypts then decrypts to the original plaintext', async () => {
    const cipher = await encryptRefreshToken('1//abc.def', KEY);
    expect(cipher).not.toContain('1//abc.def');
    const back = await decryptRefreshToken(cipher, KEY);
    expect(back).toBe('1//abc.def');
  });

  it('rejects mismatched keys', async () => {
    const cipher = await encryptRefreshToken('secret', KEY);
    const otherKey = __testing.bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    await expect(decryptRefreshToken(cipher, otherKey)).rejects.toThrow();
  });

  it('produces a different ciphertext each call (fresh IV)', async () => {
    const a = await encryptRefreshToken('x', KEY);
    const b = await encryptRefreshToken('x', KEY);
    expect(a).not.toBe(b);
  });

  it('rejects keys that are not 32 bytes', async () => {
    const shortKey = __testing.bytesToBase64(new Uint8Array(16));
    await expect(encryptRefreshToken('x', shortKey)).rejects.toThrow(/32 bytes/);
  });

  it('rejects truncated payloads', async () => {
    await expect(decryptRefreshToken('short', KEY)).rejects.toThrow();
  });
});
