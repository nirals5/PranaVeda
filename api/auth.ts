import express from 'express';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { authenticate } from './_lib/auth.js';
import { getDb } from './_lib/db.js';
import { deviceFromClient, deviceFromUserAgent } from './_lib/device.js';
import { IdentityTokenError, verifyGoogleIdToken } from './_lib/google.js';
import { clearSessionCookies, isSameOrigin, refreshCookie, setSessionCookies } from './_lib/http.js';
import { isValidNonce, issueNonce } from './_lib/nonce.js';
import { RefreshError, issueSession, revokeSession, rotateSession } from './_lib/refresh.js';
import type { SessionTokens } from './_lib/refresh.js';
import { dbRefreshStore } from './_lib/refreshStore.js';
import { endSession, findOrCreateUser, getUser, recordSession, touchSession, updateUser } from './_lib/users.js';
import type { PublicUser } from './_lib/users.js';

// Accounts and sign-in: /api/auth/*, /api/me. A separate function from
// api/index.ts so the live chat endpoints are untouched by anything here.
//
// Web sessions live in httpOnly cookies and the response carries no tokens;
// native apps ask for the tokens in the response body and store them in the
// platform keystore.

const app = express();
app.use(express.json({ limit: '32kb' }));

type Handler = (req: Request, res: Response) => Promise<unknown>;

// A missing secret or an unreachable database must read as "sign-in is
// unavailable", never as a crash or as a wrong answer about who someone is.
const route = (handler: Handler) => async (req: Request, res: Response) => {
  try {
    await handler(req, res);
  } catch (err: any) {
    console.error(`[auth] ${req.method} ${req.path} failed:`, err?.message || err);
    if (!res.headersSent) res.status(503).json({ error: 'auth_unavailable' });
  }
};

const isWeb = (req: Request) => req.body?.client !== 'ios' && req.body?.client !== 'android';

function sendSession(req: Request, res: Response, tokens: SessionTokens, user: PublicUser | null) {
  res.setHeader('Cache-Control', 'no-store');
  if (isWeb(req)) {
    setSessionCookies(req, res, tokens);
    return res.json({ user });
  }
  res.json({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn });
}

// Proves routing and database reachability; says nothing about the database.
app.get('/api/auth/health', async (_req, res) => {
  try {
    await getDb().execute(sql`select 1`);
    res.json({ ok: true, db: true });
  } catch (err: any) {
    console.error('[auth] health check failed:', err?.message || err);
    res.status(503).json({ ok: false, db: false });
  }
});

app.get(
  '/api/auth/nonce',
  route(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ nonce: issueNonce() });
  })
);

app.post(
  '/api/auth/google',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const { credential, nonce } = req.body ?? {};
    if (typeof credential !== 'string' || !credential) return res.status(400).json({ error: 'credential_required' });
    if (!isValidNonce(nonce)) return res.status(400).json({ error: 'nonce_expired' });

    let identity;
    try {
      identity = await verifyGoogleIdToken(credential, nonce);
    } catch (err) {
      if (!(err instanceof IdentityTokenError)) throw err;
      console.warn('[auth] Google token rejected:', err.message);
      return res.status(401).json({ error: 'invalid_identity_token' });
    }

    const client = isWeb(req) ? 'web' : (req.body.client as 'ios' | 'android');
    const user = await findOrCreateUser('google', identity);
    const tokens = await issueSession(dbRefreshStore, { userId: user.id, client, aud: 'app' });
    await recordSession(
      tokens.sessionId,
      user.id,
      client,
      client === 'web' ? deviceFromUserAgent(req) : deviceFromClient(req.body.device, client)
    );
    sendSession(req, res, tokens, user);
  })
);

app.post(
  '/api/auth/refresh',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const presented = isWeb(req) ? refreshCookie(req) : req.body?.refreshToken;
    if (typeof presented !== 'string' || !presented) return res.status(401).json({ error: 'not_signed_in' });

    let tokens;
    try {
      tokens = await rotateSession(dbRefreshStore, presented);
    } catch (err) {
      if (!(err instanceof RefreshError)) throw err;
      if (isWeb(req)) clearSessionCookies(req, res);
      return res.status(401).json({ error: 'session_expired' });
    }
    await touchSession(tokens.sessionId);
    sendSession(req, res, tokens, await getUser(tokens.userId));
  })
);

app.post(
  '/api/auth/logout',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const presented = isWeb(req) ? refreshCookie(req) : req.body?.refreshToken;
    if (typeof presented === 'string' && presented) {
      const sessionId = await revokeSession(dbRefreshStore, presented);
      if (sessionId) await endSession(sessionId);
    }
    if (isWeb(req)) clearSessionCookies(req, res);
    res.status(204).end();
  })
);

// Signed-in only. A guest gets 401 here by design — the web app never calls
// this unless it believes a session exists.
async function currentUser(req: Request, res: Response): Promise<PublicUser | null> {
  res.setHeader('Cache-Control', 'no-store');
  const auth = await authenticate(req);
  if (auth.kind === 'guest') {
    res.status(401).json({ error: 'not_signed_in' });
    return null;
  }
  if (auth.kind === 'invalid') {
    res.status(401).json({ error: auth.reason === 'expired' ? 'token_expired' : 'invalid_token' });
    return null;
  }
  const user = await getUser(auth.userId);
  if (!user) res.status(401).json({ error: 'not_signed_in' });
  return user;
}

const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

app.get(
  '/api/me',
  route(async (req, res) => {
    const user = await currentUser(req, res);
    if (user) res.json({ user });
  })
);

app.patch(
  '/api/me',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const user = await currentUser(req, res);
    if (!user) return;
    const { timezone } = req.body ?? {};
    if (!isTimeZone(timezone)) return res.status(400).json({ error: 'invalid_timezone' });
    res.json({ user: await updateUser(user.id, { timezone }) });
  })
);

// Scoped to this function's own prefix: in local dev this app is mounted
// inside the main one and must let every other path fall through.
app.use('/api/auth', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
