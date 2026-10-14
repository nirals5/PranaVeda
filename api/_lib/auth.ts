import { AccessTokenError, verifyAccessToken } from './tokens.js';
import type { Audience } from './tokens.js';

// Who is making this request. There are three answers, not two:
//
//   guest   — no credentials at all. The app works signed out, so this is a
//             normal request and must behave exactly as it always has.
//   user    — a valid access token.
//   invalid — credentials were sent but are expired or wrong. The caller must
//             answer 401 so the client refreshes and retries. Treating this as
//             "guest" would silently drop a signed-in user's writes.

export type AuthResult =
  | { kind: 'guest' }
  | { kind: 'user'; userId: string; sessionId: string; scope: string[] }
  | { kind: 'invalid'; reason: 'expired' | 'invalid' };

// Web sessions carry the access token in an httpOnly cookie; native apps send
// it as a Bearer header.
export const ACCESS_COOKIE = '__Host-pv_at';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// Returns the presented token, '' when a Bearer header or session cookie is
// present but empty, or undefined when the request carries no credentials.
function presentedToken(req: RequestLike): string | undefined {
  const bearer = /^Bearer(?:\s+(.*))?$/i.exec(first(req.headers.authorization)?.trim() ?? '');
  if (bearer) return bearer[1]?.trim() ?? '';
  return readCookie(first(req.headers.cookie), ACCESS_COOKIE);
}

export async function authenticate(
  req: RequestLike,
  aud: Audience = 'app',
  now: Date = new Date()
): Promise<AuthResult> {
  const token = presentedToken(req);
  if (token === undefined) return { kind: 'guest' };
  if (!token) return { kind: 'invalid', reason: 'invalid' };
  try {
    const claims = await verifyAccessToken(token, aud, now);
    return { kind: 'user', ...claims };
  } catch (err) {
    // Includes a server with no signing secret configured: a token it cannot
    // verify is not accepted, and guests are unaffected.
    return { kind: 'invalid', reason: err instanceof AccessTokenError ? err.reason : 'invalid' };
  }
}
