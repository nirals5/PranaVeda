import { createHash } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import type { VerifiedIdentity } from './google.js';

// Sign in with Apple. Two jobs:
//
//   1. Verify the identity token: signed by Apple, issued for one of OUR ids
//      (the web Services ID, or the iOS bundle id), carrying our nonce.
//   2. Trade the one-time authorization code for an Apple refresh token. We
//      never use it to sign anyone in — Apple requires apps to revoke it when
//      the user deletes their account, so it is kept (encrypted) for that.

const ISSUER = 'https://appleid.apple.com';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';

export interface AppleIdentity extends VerifiedIdentity {
  clientId: string; // which of our ids the token was issued for
}

export class AppleTokenError extends Error {}

let keys: JWTVerifyGetKey | undefined;
let fetchImpl: typeof fetch = (input, init) => fetch(input, init);

// Tests substitute local keys for Apple's, and a fake for Apple's token endpoint.
export function useAppleKeys(replacement: JWTVerifyGetKey | undefined) {
  keys = replacement;
}
export function useAppleFetch(replacement: typeof fetch | undefined) {
  fetchImpl = replacement ?? ((input, init) => fetch(input, init));
}

export function appleClientIds(): string[] {
  return [process.env.APPLE_SERVICES_ID || process.env.VITE_APPLE_SERVICES_ID, process.env.APPLE_BUNDLE_ID].filter(
    (id): id is string => !!id
  );
}

const sha256hex = (value: string) => createHash('sha256').update(value).digest('hex');

export async function verifyAppleIdToken(idToken: string, nonce: string, now: Date = new Date()): Promise<AppleIdentity> {
  const audience = appleClientIds();
  if (!audience.length) throw new AppleTokenError('no Apple client id is configured');
  keys ??= createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, { issuer: ISSUER, audience, algorithms: ['RS256'], currentDate: now }));
  } catch (err: any) {
    throw new AppleTokenError(err?.code || err?.message || 'verification failed');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new AppleTokenError('missing subject');
  // The web flow puts our nonce in the token as given; the iOS flow
  // conventionally sends its SHA-256 instead. Either way it must be ours.
  if (payload.nonce !== nonce && payload.nonce !== sha256hex(nonce)) throw new AppleTokenError('nonce mismatch');

  const truthy = (v: unknown) => v === true || v === 'true';
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined,
    emailVerified: truthy(payload.email_verified),
    emailIsRelay: truthy(payload.is_private_email),
    clientId: Array.isArray(payload.aud) ? payload.aud[0] : (payload.aud as string),
  };
}

// Apple authenticates our server with a short-lived JWT signed by the key
// downloaded from the Apple Developer portal, rather than a fixed password.
export async function appleClientSecret(clientId: string, now: Date = new Date()): Promise<string> {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = process.env;
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) throw new AppleTokenError('Apple signing key is not configured');
  // Env editors often store the .p8 file's line breaks as literal "\n".
  const key = await importPKCS8(APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'ES256');
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APPLE_KEY_ID })
    .setIssuer(APPLE_TEAM_ID)
    .setSubject(clientId)
    .setAudience(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 5 * 60)
    .sign(key);
}

// Returns Apple's refresh token, or null if the exchange did not work. Sign-in
// does not depend on it, so a failure is logged rather than shown to the user.
export async function exchangeAppleCode(code: string, clientId: string): Promise<string | null> {
  try {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await appleClientSecret(clientId),
        code,
        grant_type: 'authorization_code',
      }),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.refresh_token !== 'string') {
      console.warn('[auth] Apple code exchange failed:', response.status, body?.error || '');
      return null;
    }
    return body.refresh_token;
  } catch (err: any) {
    console.warn('[auth] Apple code exchange failed:', err?.message || err);
    return null;
  }
}
