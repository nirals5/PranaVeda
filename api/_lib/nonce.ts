import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { deriveKey } from './tokens.js';

// A sign-in nonce ties an identity token to one sign-in attempt started here:
// the browser asks for a nonce, hands it to the provider, and the provider
// bakes it into the token it issues. Signed and self-expiring, so nothing has
// to be stored between the two requests.

export const NONCE_TTL_MS = 10 * 60 * 1000;

const sign = (body: string) => createHmac('sha256', deriveKey('nonce')).update(body).digest('base64url');

export function issueNonce(now: Date = new Date()): string {
  const body = `${randomBytes(16).toString('base64url')}.${now.getTime() + NONCE_TTL_MS}`;
  return `${body}.${sign(body)}`;
}

export function isValidNonce(nonce: unknown, now: Date = new Date()): nonce is string {
  if (typeof nonce !== 'string') return false;
  const parts = nonce.split('.');
  if (parts.length !== 3) return false;
  const [random, expires, signature] = parts;
  const expected = Buffer.from(sign(`${random}.${expires}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(expires) > now.getTime();
}
