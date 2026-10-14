import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { SignJWT, decodeProtectedHeader, errors, jwtVerify } from 'jose';

// Access tokens (short-lived JWTs) and the primitives refresh tokens are built
// from. Nothing here touches the database, so api/index.ts can verify a token
// without loading the database client.

export const ISSUER = 'pranaveda';
export const ACCESS_TTL_SECONDS = 15 * 60;

// Who a token is for. First-party endpoints accept 'app' only, so a token
// issued to a speaker ('alexa') can never be presented to /api/chat.
export type Audience = 'app' | 'alexa';

export interface AccessClaims {
  userId: string;
  sessionId: string; // the refresh-token family this access token belongs to
  scope: string[];
}

export class AuthConfigError extends Error {}

export class AccessTokenError extends Error {
  constructor(public reason: 'expired' | 'invalid') {
    super(`access token ${reason}`);
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();

interface Secret {
  kid: string;
  raw: string;
  key: Uint8Array;
}

function toSecret(raw: string): Secret {
  if (raw.length < 32) throw new AuthConfigError('AUTH_JWT_SECRET must be at least 32 characters');
  // The key id is derived from the secret, so rotating is only a matter of
  // moving the old value to AUTH_JWT_SECRET_PREVIOUS.
  return { kid: sha256(raw).toString('hex').slice(0, 16), raw, key: new TextEncoder().encode(raw) };
}

function currentSecret(): Secret {
  const raw = process.env.AUTH_JWT_SECRET;
  if (!raw) throw new AuthConfigError('AUTH_JWT_SECRET is not set');
  return toSecret(raw);
}

// Current first, then the previous one, which stays valid for verification
// until every token it signed has expired.
function verificationSecrets(): Secret[] {
  return [process.env.AUTH_JWT_SECRET, process.env.AUTH_JWT_SECRET_PREVIOUS]
    .filter((raw): raw is string => !!raw)
    .map(toSecret);
}

export async function signAccessToken(
  claims: AccessClaims,
  aud: Audience,
  now: Date = new Date()
): Promise<string> {
  const secret = currentSecret();
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: claims.sessionId, scope: claims.scope.join(' ') })
    .setProtectedHeader({ alg: 'HS256', kid: secret.kid })
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setSubject(claims.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TTL_SECONDS)
    .sign(secret.key);
}

// Throws AccessTokenError for anything that is not a currently valid token
// for exactly this audience.
export async function verifyAccessToken(token: string, aud: Audience, now: Date = new Date()): Promise<AccessClaims> {
  let kid: string | undefined;
  try {
    kid = decodeProtectedHeader(token).kid;
  } catch {
    throw new AccessTokenError('invalid');
  }
  const secret = verificationSecrets().find((s) => s.kid === kid);
  if (!secret) throw new AccessTokenError('invalid');

  try {
    const { payload } = await jwtVerify(token, secret.key, {
      issuer: ISSUER,
      audience: aud,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new AccessTokenError('invalid');
    const scope = typeof payload.scope === 'string' && payload.scope ? payload.scope.split(' ') : [];
    return { userId: payload.sub, sessionId: payload.sid, scope };
  } catch (err) {
    if (err instanceof AccessTokenError) throw err;
    throw new AccessTokenError(err instanceof errors.JWTExpired ? 'expired' : 'invalid');
  }
}

// --- Refresh-token primitives ------------------------------------------------

// Opaque and high-entropy, so a plain SHA-256 is enough for storage: there is
// nothing to brute-force, and the database never holds a usable token.
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return sha256(token).toString('hex');
}

// Separate keys for separate jobs, all derived from the one configured secret.
export function deriveKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', currentSecret().raw, '', `pranaveda/${purpose}`, 32));
}

// A rotated token's successor is kept encrypted for the short retry window
// (see refresh.ts), so a retried request can be handed the same successor.
const sealingKey = () => deriveKey('refresh-successor');

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealingKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

// Returns null when the value cannot be opened (tampered, or sealed under a
// secret that has since been rotated out).
export function unseal(sealed: string): string | null {
  try {
    const buf = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', sealingKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
