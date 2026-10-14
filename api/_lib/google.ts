import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

// Verifies a Google ID token: the proof, signed by Google, of who just signed
// in. The token is only trusted if Google signed it, it was issued for one of
// OUR client ids, and it carries the nonce this server issued for the attempt.

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface VerifiedIdentity {
  subject: string; // the provider's stable id for this person
  email?: string;
  emailVerified: boolean;
  // Apple "Hide My Email" addresses are unique per app and never match
  // another provider's email.
  emailIsRelay?: boolean;
  name?: string;
}

export class IdentityTokenError extends Error {}

let keys: JWTVerifyGetKey | undefined;

// Tests substitute locally generated keys for Google's.
export function useGoogleKeys(replacement: JWTVerifyGetKey | undefined) {
  keys = replacement;
}

// The web client id doubles as the one the browser is built with, so a single
// VITE_GOOGLE_CLIENT_ID is enough for web; native apps add their own.
export function googleClientIds(): string[] {
  return [
    process.env.GOOGLE_CLIENT_ID_WEB,
    process.env.VITE_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_ID_IOS,
    process.env.GOOGLE_CLIENT_ID_ANDROID,
  ].filter((id): id is string => !!id);
}

export async function verifyGoogleIdToken(idToken: string, nonce: string, now: Date = new Date()): Promise<VerifiedIdentity> {
  const audience = googleClientIds();
  if (!audience.length) throw new IdentityTokenError('no Google client id is configured');
  keys ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience, algorithms: ['RS256'], currentDate: now }));
  } catch (err: any) {
    throw new IdentityTokenError(err?.code || err?.message || 'verification failed');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new IdentityTokenError('missing subject');
  if (payload.nonce !== nonce) throw new IdentityTokenError('nonce mismatch');

  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}
