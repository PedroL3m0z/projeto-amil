import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith('scrypt$')) {
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 3) {
    return false;
  }
  const [, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64!, 'base64');
    const expected = Buffer.from(hashB64!, 'base64');
    const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
    if (hash.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
