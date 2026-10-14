import type { Request, Response } from 'express';
import { accessCookieName, first, isHttps, readCookie } from './auth.js';
import { REFRESH_TTL_MS } from './refresh.js';
import type { SessionTokens } from './refresh.js';

// Cookies and the same-origin check for web sessions.
//
// The browser never sees a token in JavaScript: both live in httpOnly cookies.
// The refresh cookie is scoped to /api/auth, so it is only ever sent to the
// endpoints that rotate or revoke it.

const REFRESH_PATH = '/api/auth';
export const refreshCookieName = (req: Request) => (isHttps(req) ? '__Secure-pv_rt' : 'pv_rt');

function cookie(name: string, value: string, path: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function setSessionCookies(req: Request, res: Response, tokens: SessionTokens): void {
  const secure = isHttps(req);
  res.setHeader('Set-Cookie', [
    cookie(accessCookieName(req), tokens.accessToken, '/', tokens.expiresIn, secure),
    cookie(refreshCookieName(req), tokens.refreshToken, REFRESH_PATH, Math.floor(REFRESH_TTL_MS / 1000), secure),
  ]);
}

export function clearSessionCookies(req: Request, res: Response): void {
  const secure = isHttps(req);
  res.setHeader('Set-Cookie', [
    cookie(accessCookieName(req), '', '/', 0, secure),
    cookie(refreshCookieName(req), '', REFRESH_PATH, 0, secure),
  ]);
}

export const refreshCookie = (req: Request) => readCookie(first(req.headers.cookie), refreshCookieName(req));

// Cross-site request forgery guard for cookie-backed requests. Browsers attach
// Origin to every cross-site POST, so a request whose Origin is another site is
// refused. Requests with no Origin (native apps, server-to-server) carry no
// ambient cookies worth forging and pass.
export function isSameOrigin(req: Request): boolean {
  const origin = first(req.headers.origin);
  if (!origin) return true;
  const host = first(req.headers['x-forwarded-host']) ?? first(req.headers.host);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
