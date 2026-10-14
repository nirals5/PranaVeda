import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../api/auth.js';
import { getDb, schema } from '../api/_lib/db.js';
import { useGoogleKeys } from '../api/_lib/google.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, later, useSecrets } from './helpers.js';

// The sign-in endpoints end to end, against the real database, with a local
// key pair standing in for Google. Skipped when no database is configured.
// Every account it creates uses a subject starting with RUN, and is deleted
// (cascading to identities, sessions and tokens) afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, identities, sessions, refreshTokens } = schema;
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const RUN = `vitest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe.skipIf(!hasDb)('sign-in API', () => {
  let googleKey: CryptoKey;

  const nonce = async () => (await request(app).get('/api/auth/nonce')).body.nonce as string;

  const googleToken = async (n: string, who = 'a', extra: Record<string, unknown> = {}) =>
    new SignJWT({ sub: `${RUN}-${who}`, email: `${who}@example.com`, email_verified: true, name: `Test ${who}`, nonce: n, ...extra })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(googleKey);

  // What a browser does: keep the cookies the server sets, send them back.
  const cookiesOf = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]);
  const named = (cookies: string[], name: string) => cookies.filter((c) => c.startsWith(`${name}=`));

  const signInWeb = async (who = 'a') => {
    const n = await nonce();
    const res = await request(app)
      .post('/api/auth/google')
      .set('User-Agent', CHROME_MAC)
      .send({ credential: await googleToken(n, who), nonce: n });
    return { res, cookies: cookiesOf(res) };
  };

  beforeAll(async () => {
    useSecrets(SECRET_A);
    process.env.GOOGLE_CLIENT_ID_WEB = CLIENT_ID;
    const pair = await generateKeyPair('RS256');
    googleKey = pair.privateKey;
    useGoogleKeys(createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' }] }));
  });

  afterAll(async () => {
    useGoogleKeys(undefined);
    const mine = await getDb().select({ userId: identities.userId }).from(identities).where(inArray(identities.subject, ['a', 'b', 'native', 'race'].map((w) => `${RUN}-${w}`)));
    const ids = mine.map((m) => m.userId);
    if (!ids.length) return;
    await getDb().delete(users).where(inArray(users.id, ids));
    expect(await getDb().select().from(sessions).where(inArray(sessions.userId, ids))).toHaveLength(0);
    expect(await getDb().select().from(refreshTokens).where(inArray(refreshTokens.userId, ids))).toHaveLength(0);
  });

  it('signs a web user in with httpOnly cookies and no tokens in the response', async () => {
    const { res } = await signInWeb();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: expect.any(String), email: 'a@example.com', displayName: 'Test a', timezone: null } });

    const raw = ([] as string[]).concat(res.headers['set-cookie']);
    expect(raw).toHaveLength(2);
    for (const c of raw) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('SameSite=Lax');
    }
    expect(raw.find((c) => c.startsWith('pv_rt='))).toContain('Path=/api/auth');
    expect(raw.find((c) => c.startsWith('pv_at='))).toContain('Path=/;');
  });

  it('uses Secure, prefixed cookies when the request arrived over https', async () => {
    const n = await nonce();
    const res = await request(app)
      .post('/api/auth/google')
      .set('X-Forwarded-Proto', 'https')
      .send({ credential: await googleToken(n), nonce: n });
    const raw = ([] as string[]).concat(res.headers['set-cookie']);
    expect(raw.map((c) => c.split('=')[0]).sort()).toEqual(['__Host-pv_at', '__Secure-pv_rt']);
    for (const c of raw) expect(c).toContain('Secure');
  });

  it('returns the same account on a second sign-in, and records each session with its device', async () => {
    const first = await signInWeb();
    const second = await signInWeb();
    expect(second.res.body.user.id).toBe(first.res.body.user.id);

    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, first.res.body.user.id));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]).toMatchObject({ client: 'web', deviceClass: 'desktop', os: 'macOS', browser: 'Chrome' });
  });

  it('creates one account when two first sign-ins arrive together', async () => {
    const [a, b] = await Promise.all([signInWeb('race'), signInWeb('race')]);
    expect(a.res.status).toBe(200);
    expect(b.res.status).toBe(200);
    expect(a.res.body.user.id).toBe(b.res.body.user.id);
    expect(await getDb().select().from(identities).where(eq(identities.subject, `${RUN}-race`))).toHaveLength(1);
  });

  it('keeps different people in different accounts', async () => {
    const a = await signInWeb('a');
    const b = await signInWeb('b');
    expect(b.res.body.user.id).not.toBe(a.res.body.user.id);
  });

  it('serves /api/me to the signed-in user only', async () => {
    const { res, cookies } = await signInWeb();
    const me = await request(app).get('/api/me').set('Cookie', named(cookies, 'pv_at'));
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual(res.body.user);

    expect((await request(app).get('/api/me')).body).toEqual({ error: 'not_signed_in' });
    expect((await request(app).get('/api/me').set('Cookie', 'pv_at=garbage')).body).toEqual({ error: 'invalid_token' });
  });

  it('answers an expired access token with 401 token_expired, not as a guest', async () => {
    const { res } = await signInWeb();
    const stale = await signAccessToken({ userId: res.body.user.id, sessionId: 'x', scope: [] }, 'app', later(new Date(), -3600_000));
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(401);
    expect(me.body).toEqual({ error: 'token_expired' });
  });

  it('refreshes a web session from the cookie, and a retry gets the same successor', async () => {
    const { cookies } = await signInWeb();
    const rt = named(cookies, 'pv_rt');
    const first = await request(app).post('/api/auth/refresh').set('Cookie', rt).send({});
    const retry = await request(app).post('/api/auth/refresh').set('Cookie', rt).send({});
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(named(cookiesOf(retry), 'pv_rt')).toEqual(named(cookiesOf(first), 'pv_rt'));
    expect(named(cookiesOf(first), 'pv_rt')).not.toEqual(rt);

    const me = await request(app).get('/api/me').set('Cookie', named(cookiesOf(first), 'pv_at'));
    expect(me.status).toBe(200);
  });

  it('signs out: the session is gone and its refresh token no longer works', async () => {
    const { res, cookies } = await signInWeb();
    const rt = named(cookies, 'pv_rt');
    const before = await getDb().select().from(sessions).where(eq(sessions.userId, res.body.user.id));

    const out = await request(app).post('/api/auth/logout').set('Cookie', rt).send({});
    expect(out.status).toBe(204);
    expect(([] as string[]).concat(out.headers['set-cookie']).every((c) => c.includes('Max-Age=0'))).toBe(true);

    const after = await getDb().select().from(sessions).where(eq(sessions.userId, res.body.user.id));
    expect(after).toHaveLength(before.length - 1);
    const again = await request(app).post('/api/auth/refresh').set('Cookie', rt).send({});
    expect(again.status).toBe(401);
    expect(again.body).toEqual({ error: 'session_expired' });
  });

  it('gives a native app its tokens in the body and sets no cookies', async () => {
    const n = await nonce();
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: await googleToken(n, 'native'), nonce: n, client: 'ios', device: { deviceClass: 'phone', osVersion: '18.5', deviceModel: 'iPhone17,1', appVersion: '1.0.0' } });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresIn: 900 });

    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.body.user.email).toBe('native@example.com');
    const [row] = await getDb().select().from(sessions).where(eq(sessions.userId, res.body.user.id));
    expect(row).toMatchObject({ client: 'ios', deviceClass: 'phone', os: 'iOS', osVersion: '18', deviceModel: 'iPhone17,1', appVersion: '1.0.0' });

    const refreshed = await request(app).post('/api/auth/refresh').send({ client: 'ios', refreshToken: res.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(res.body.refreshToken);
  });

  it('saves a valid timezone and rejects an invalid one', async () => {
    const { cookies } = await signInWeb();
    const at = named(cookies, 'pv_at');
    const ok = await request(app).patch('/api/me').set('Cookie', at).send({ timezone: 'America/Los_Angeles' });
    expect(ok.body.user.timezone).toBe('America/Los_Angeles');
    const bad = await request(app).patch('/api/me').set('Cookie', at).send({ timezone: 'Mars/Olympus' });
    expect(bad.status).toBe(400);
  });

  it('rejects bad sign-in attempts', async () => {
    const n = await nonce();
    const good = await googleToken(n);
    const post = (body: object) => request(app).post('/api/auth/google').send(body);

    expect((await post({ nonce: n })).body).toEqual({ error: 'credential_required' });
    expect((await post({ credential: good, nonce: 'made-up' })).body).toEqual({ error: 'nonce_expired' });
    // A token minted for a different sign-in attempt.
    expect((await post({ credential: good, nonce: await nonce() })).body).toEqual({ error: 'invalid_identity_token' });
    expect((await post({ credential: 'garbage', nonce: n })).status).toBe(401);
  });

  it('refuses cookie-affecting requests from another site', async () => {
    const { cookies } = await signInWeb();
    const n = await nonce();
    const evil = 'https://evil.example';
    expect((await request(app).post('/api/auth/google').set('Origin', evil).send({ credential: await googleToken(n), nonce: n })).status).toBe(403);
    expect((await request(app).post('/api/auth/refresh').set('Origin', evil).set('Cookie', named(cookies, 'pv_rt')).send({})).status).toBe(403);
    expect((await request(app).post('/api/auth/logout').set('Origin', evil).set('Cookie', named(cookies, 'pv_rt')).send({})).status).toBe(403);
    // The same request from the site itself is fine.
    const own = await request(app).post('/api/auth/refresh').set('Host', 'app.test').set('Origin', 'https://app.test').set('Cookie', named(cookies, 'pv_rt')).send({});
    expect(own.status).toBe(200);
  });

  it('answers unknown auth paths with a JSON 404', async () => {
    const res = await request(app).get('/api/auth/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
