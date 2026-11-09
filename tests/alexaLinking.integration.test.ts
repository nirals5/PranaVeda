import 'dotenv/config';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import authApp from '../api/auth.js';
import { getDb, schema } from '../api/_lib/db.js';
import { alexaLinkFor, rememberAlexaUser, setAlexaNotifications } from '../api/_lib/alexaLinks.js';
import { issueSession } from '../api/_lib/refresh.js';
import { dbRefreshStore } from '../api/_lib/refreshStore.js';
import { runTick, type PushSub, type SendResult } from '../api/_lib/push.js';
import { signAccessToken, verifyAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, useSecrets } from './helpers.js';

// Alexa account linking end to end against the real database: Amazon's side
// of the OAuth exchange, unlinking from the website, and Alexa notifications
// from the 15-minute check. Every account made here is deleted afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, sessions, pushNudgeState } = schema;
const REDIRECT = 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA';
const CLIENT = 'alexa-skill-test';
const SECRET = 'a-long-shared-secret-for-alexa-0123456789';
const basic = (id = CLIENT, secret = SECRET) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
const H = 60 * 60 * 1000;

describe('the link request from the Alexa app', () => {
  beforeAll(() => {
    process.env.ALEXA_OAUTH_CLIENT_ID = CLIENT;
    process.env.ALEXA_OAUTH_CLIENT_SECRET = SECRET;
  });

  it('goes on to the website page that signs in and asks', async () => {
    const res = await request(authApp).get('/api/oauth/authorize').query({ response_type: 'code', client_id: CLIENT, redirect_uri: REDIRECT, state: 's1', scope: 'nudges' });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location, 'https://pranaveda.app');
    expect(to.pathname).toBe('/link/alexa');
    expect(to.searchParams.get('state')).toBe('s1');
    expect(to.searchParams.get('redirect_uri')).toBe(REDIRECT);
  });

  it("carries Amazon's long state to the page and back unchanged", async () => {
    const state = `Amas${'eyJ2YWxpZGF0aW9uQ29kZSI6Ik'.repeat(60)}+/==`;
    const res = await request(authApp).get('/api/oauth/authorize').query({ response_type: 'code', client_id: CLIENT, redirect_uri: REDIRECT, state, scope: 'nudges' });
    expect(new URL(res.headers.location, 'https://pranaveda.app').searchParams.get('state')).toBe(state);
  });

  it('is refused on the spot for a stranger’s address, and sent back to Amazon for other mistakes', async () => {
    const bad = await request(authApp).get('/api/oauth/authorize').query({ response_type: 'code', client_id: CLIENT, redirect_uri: 'https://evil.example/cb', state: 's1' });
    expect(bad.status).toBe(400);
    const back = await request(authApp).get('/api/oauth/authorize').query({ response_type: 'token', client_id: CLIENT, redirect_uri: REDIRECT, state: 's1' });
    expect(back.status).toBe(302);
    expect(back.headers.location).toBe(`${REDIRECT}?error=unsupported_response_type&state=s1`);
  });
});

describe.skipIf(!hasDb)('Alexa account linking', () => {
  const created: string[] = [];
  let user: { id: string; auth: string };

  const newUser = async () => {
    const [row] = await getDb().insert(users).values({ displayName: 'Vitest Alexa', timezone: 'America/Los_Angeles' }).returning({ id: users.id });
    created.push(row.id);
    return { id: row.id, auth: `Bearer ${await signAccessToken({ userId: row.id, sessionId: 'test', scope: [] }, 'app')}` };
  };
  const consent = (auth: string, decision: 'allow' | 'deny' = 'allow') =>
    request(authApp).post('/api/oauth/authorize').set('Authorization', auth).send({ response_type: 'code', client_id: CLIENT, redirect_uri: REDIRECT, state: 'st', scope: 'nudges', decision });
  const codeFrom = (redirect: string) => new URL(redirect).searchParams.get('code')!;
  const token = (form: Record<string, string>, auth = basic()) => request(authApp).post('/api/oauth/token').set('Authorization', auth).type('form').send(form);
  const link = async (who: { auth: string }) => {
    const code = codeFrom((await consent(who.auth)).body.redirect);
    return (await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT })).body;
  };

  beforeAll(async () => {
    useSecrets(SECRET_A);
    process.env.ALEXA_OAUTH_CLIENT_ID = CLIENT;
    process.env.ALEXA_OAUTH_CLIENT_SECRET = SECRET;
    user = await newUser();
  });
  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  it('gives Amazon a one-time code once the person allows it, or says they declined', async () => {
    const allowed = await consent(user.auth);
    expect(allowed.status).toBe(200);
    const to = new URL(allowed.body.redirect);
    expect(`${to.origin}${to.pathname}`).toBe(REDIRECT);
    expect(to.searchParams.get('state')).toBe('st');
    expect(to.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    expect((await consent(user.auth, 'deny')).body.redirect).toBe(`${REDIRECT}?error=access_denied&state=st`);
    expect((await request(authApp).post('/api/oauth/authorize').send({ client_id: CLIENT, redirect_uri: REDIRECT, decision: 'allow' })).status).toBe(401);
    expect((await consent(user.auth).set('Origin', 'https://evil.example')).status).toBe(403);
  });

  it('trades the code once for a speaker session that only Alexa can use', async () => {
    const code = codeFrom((await consent(user.auth)).body.redirect);
    const res = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'nudges' });
    expect((await verifyAccessToken(res.body.access_token, 'alexa')).userId).toBe(user.id);
    await expect(verifyAccessToken(res.body.access_token, 'app')).rejects.toThrow();
    const [session] = await getDb().select().from(sessions).where(eq(sessions.familyId, (await verifyAccessToken(res.body.access_token, 'alexa')).sessionId));
    expect(session).toMatchObject({ client: 'alexa', deviceClass: 'speaker' });

    expect((await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT })).body).toEqual({ error: 'invalid_grant' });
  });

  it('refuses the wrong skill secret, a changed address and unknown grants', async () => {
    const code = codeFrom((await consent(user.auth)).body.redirect);
    const wrong = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }, basic(CLIENT, 'nope'));
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: 'invalid_client' });
    expect((await token({ grant_type: 'authorization_code', code, redirect_uri: 'https://layla.amazon.com/api/skill/link/M2AAAAAAAAAAAA' })).body).toEqual({ error: 'invalid_grant' });
    expect((await token({ grant_type: 'password', username: 'x', password: 'y' })).body).toEqual({ error: 'unsupported_grant_type' });
  });

  it('keeps Alexa and the apps apart when refreshing', async () => {
    const linked = await link(user);
    const refreshed = await token({ grant_type: 'refresh_token', refresh_token: linked.refresh_token });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refresh_token).not.toBe(linked.refresh_token);

    // An Alexa refresh token is no use to the apps, and an app's to Alexa.
    expect((await request(authApp).post('/api/auth/refresh').send({ client: 'ios', refreshToken: refreshed.body.refresh_token })).status).toBe(401);
    const app = await issueSession(dbRefreshStore, { userId: user.id, client: 'ios', aud: 'app' });
    expect((await token({ grant_type: 'refresh_token', refresh_token: app.refreshToken })).body).toEqual({ error: 'invalid_grant' });
    // …and was left untouched, so the app's own next refresh still works.
    expect((await request(authApp).post('/api/auth/refresh').send({ client: 'ios', refreshToken: app.refreshToken })).status).toBe(200);
  });

  it('can be ended from the website, after which Alexa’s tokens stop working', async () => {
    const linked = await link(user);
    const status = await request(authApp).get('/api/me/alexa').set('Authorization', user.auth);
    expect(status.body).toEqual({ linked: true, notifications: false });

    expect((await request(authApp).delete('/api/me/alexa').set('Authorization', user.auth)).status).toBe(204);
    expect((await request(authApp).get('/api/me/alexa').set('Authorization', user.auth)).body).toEqual({ linked: false, notifications: false });
    expect((await token({ grant_type: 'refresh_token', refresh_token: linked.refresh_token })).body).toEqual({ error: 'invalid_grant' });
  });

  it('nudges through Alexa from the 15-minute check, once per opening across web and Alexa', async () => {
    const person = await newUser();
    await rememberAlexaUser(person.id, `amzn1.ask.account.vitest-${person.id}`);
    await setAlexaNotifications(`amzn1.ask.account.vitest-${person.id}`, true);
    expect(await alexaLinkFor(person.id)).toMatchObject({ notifications: true });

    // Tuesday 10 November 2026, 2:00 PM in Los Angeles, free until 3.
    const NOW = Date.parse('2026-11-10T22:00:00Z');
    await getDb().insert(pushNudgeState).values({
      userId: person.id,
      trusted: true,
      google: false,
      busy: [[Date.parse('2026-11-10T15:00:00-08:00'), Date.parse('2026-11-10T16:00:00-08:00')]],
      uploadedAt: new Date(NOW - H),
      coveredUntil: new Date(NOW + 30 * H),
    });

    const toAlexa: string[] = [];
    const sendAlexa = async (alexaUserId: string): Promise<SendResult> => (alexaUserId.includes(person.id) ? (toAlexa.push(alexaUserId), 'ok') : 'failed');
    const send = async (_s: PushSub): Promise<SendResult> => 'failed';
    const noLink = async () => [] as [number, number][];

    await runTick({ now: NOW, send, readLink: noLink, sendAlexa });
    expect(toAlexa).toHaveLength(1);
    await runTick({ now: NOW + 15 * 60 * 1000, send, readLink: noLink, sendAlexa });
    expect(toAlexa).toHaveLength(1);

    // Turned off in the Alexa app: Amazon says so, and Alexa is left out.
    await setAlexaNotifications(`amzn1.ask.account.vitest-${person.id}`, false);
    await getDb().update(pushNudgeState).set({ lastSlotKey: null, lastNotifiedAt: null }).where(eq(pushNudgeState.userId, person.id));
    await runTick({ now: NOW, send, readLink: noLink, sendAlexa });
    expect(toAlexa).toHaveLength(1);
  });
});
