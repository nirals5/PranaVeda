import 'dotenv/config';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pushApp from '../api/push.js';
import { getDb, schema } from '../api/_lib/db.js';
import { parseCalendarUpload, parseSubscription, runTick, type PushSub, type SendResult } from '../api/_lib/push.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, useSecrets } from './helpers.js';

// Push nudges end to end against the real database where one is configured,
// with a stand-in for the push service. Every account made here is deleted
// afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, pushSubscriptions, pushNudgeState } = schema;
const H = 60 * 60 * 1000;
// Tuesday 10 November 2026, 2:00 PM in Los Angeles.
const NOW = Date.parse('2026-11-10T22:00:00Z');
const at = (hhmm: string) => Date.parse(`2026-11-10T${hhmm}:00-08:00`);

const sub = (n: number) => ({ endpoint: `https://push.example.com/send/vitest-${n}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: 'BPk3cUc-key', auth: 'auth_key' } });

describe('push input checks', () => {
  it('accepts a browser subscription and nothing else', () => {
    const s = sub(1);
    expect(parseSubscription(s)).toEqual({ endpoint: s.endpoint, p256dh: 'BPk3cUc-key', auth: 'auth_key' });
    expect(parseSubscription({ ...s, endpoint: 'http://push.example.com/x' })).toBeNull();
    expect(parseSubscription({ ...s, keys: { p256dh: 'has spaces', auth: 'a' } })).toBeNull();
    expect(parseSubscription({ endpoint: s.endpoint })).toBeNull();
  });

  it('accepts busy start and end times only', () => {
    expect(parseCalendarUpload({ trusted: true, google: false, busy: [[1, 2]], coveredUntil: 5 })).toEqual({ trusted: true, google: false, busy: [[1, 2]], coveredUntil: 5 });
    expect(parseCalendarUpload({ trusted: false, google: true, busy: [[1, 2]] })).toEqual({ trusted: false, google: true, busy: null, coveredUntil: null });
    expect(parseCalendarUpload({ trusted: true, google: false, busy: [[2, 1]], coveredUntil: 5 })).toBeNull();
    expect(parseCalendarUpload({ trusted: true, google: false, busy: [{ start: 1, end: 2, title: 'x' }], coveredUntil: 5 })).toBeNull();
    expect(parseCalendarUpload({ trusted: 'yes', google: false })).toBeNull();
  });
});

describe('the push check is called only by the scheduler', () => {
  it('refuses a call without the shared secret', async () => {
    const saved = process.env.PUSH_TICK_SECRET;
    process.env.PUSH_TICK_SECRET = 'tick-secret-for-tests';
    try {
      expect((await request(pushApp).post('/api/push/tick')).status).toBe(401);
      expect((await request(pushApp).post('/api/push/tick').set('Authorization', 'Bearer wrong')).status).toBe(401);
    } finally {
      if (saved === undefined) delete process.env.PUSH_TICK_SECRET;
      else process.env.PUSH_TICK_SECRET = saved;
    }
  });
});

describe.skipIf(!hasDb)('push nudges', () => {
  const created: string[] = [];

  const newUser = async (timezone = 'America/Los_Angeles') => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest push', timezone }).returning({ id: users.id });
    created.push(user.id);
    return { id: user.id, auth: `Bearer ${await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app')}` };
  };
  const put = (path: string, auth: string, body: object) => request(pushApp).put(path).set('Authorization', auth).send(body);
  const stateOf = async (id: string) => (await getDb().select().from(pushNudgeState).where(eq(pushNudgeState.userId, id)))[0];

  // Only this file's users: the check runs over everyone subscribed, and the
  // dev database may hold other subscriptions.
  const recorder = () => {
    const sent: { endpoint: string; payload: any }[] = [];
    const send = async (s: PushSub, payload: string): Promise<SendResult> => {
      if (!s.endpoint.includes('vitest-')) return 'failed';
      sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
      return s.endpoint.includes('vitest-9') ? 'gone' : 'ok';
    };
    return { sent, send };
  };
  const noLink = async () => [] as [number, number][];

  beforeAll(() => useSecrets(SECRET_A));
  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  it('nudges a subscribed user in open time, once per opening', async () => {
    const user = await newUser();
    const s = sub(1);
    expect((await put('/api/push/subscription', user.auth, { subscription: s })).body).toEqual({ ok: true });
    await put('/api/push/state', user.auth, { calendar: { trusted: true, google: false, busy: [[at('15:00'), at('16:00')]], coveredUntil: NOW + 30 * H } });
    // The upload is stamped with the real clock; the check runs at NOW.
    await getDb().update(pushNudgeState).set({ uploadedAt: new Date(NOW - H) }).where(eq(pushNudgeState.userId, user.id));

    const first = recorder();
    await runTick({ now: NOW, send: first.send, readLink: noLink });
    const mine = first.sent.filter((x) => x.endpoint === s.endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0].payload).toEqual({ title: 'Amrita', body: 'You have 60 open minutes, until 3:00 PM. A good moment to practice.', url: '/?nudge=1', tag: 'pranaveda-nudge' });
    expect((await stateOf(user.id)).lastSlotKey).toBe(String(at('15:00')));

    const again = recorder();
    await runTick({ now: NOW + 15 * 60 * 1000, send: again.send, readLink: noLink });
    expect(again.sent.filter((x) => x.endpoint === s.endpoint)).toHaveLength(0);
  });

  it('stays quiet while PranaVeda is on screen, and without a trusted calendar', async () => {
    const onScreen = await newUser();
    const a = sub(2);
    await put('/api/push/subscription', onScreen.auth, { subscription: a });
    await put('/api/push/state', onScreen.auth, { calendar: { trusted: true, google: false, busy: [], coveredUntil: NOW + 30 * H } });
    await getDb().update(pushNudgeState).set({ uploadedAt: new Date(NOW - H), seenAt: new Date(NOW - 5 * 60 * 1000) }).where(eq(pushNudgeState.userId, onScreen.id));

    const unread = await newUser();
    const b = sub(3);
    await put('/api/push/subscription', unread.auth, { subscription: b });
    await put('/api/push/state', unread.auth, { calendar: { trusted: false, google: true } });

    const r = recorder();
    await runTick({ now: NOW, send: r.send, readLink: noLink });
    expect(r.sent.filter((x) => [a.endpoint, b.endpoint].includes(x.endpoint))).toHaveLength(0);
  });

  it('forgets a browser the push service says is gone', async () => {
    const user = await newUser();
    const gone = sub(9);
    await put('/api/push/subscription', user.auth, { subscription: gone });
    await put('/api/push/state', user.auth, { calendar: { trusted: true, google: false, busy: [], coveredUntil: NOW + 30 * H } });
    await getDb().update(pushNudgeState).set({ uploadedAt: new Date(NOW - H) }).where(eq(pushNudgeState.userId, user.id));

    await runTick({ now: NOW, send: recorder().send, readLink: noLink });
    expect(await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, gone.endpoint))).toEqual([]);
    expect((await stateOf(user.id)).lastSlotKey).toBeNull();
  });

  it('turning off removes the browser; bad input, other sites and guests are refused', async () => {
    const user = await newUser();
    const s = sub(4);
    await put('/api/push/subscription', user.auth, { subscription: s });
    await request(pushApp).delete('/api/push/subscription').set('Authorization', user.auth).send({ endpoint: s.endpoint });
    expect(await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint))).toEqual([]);

    expect((await put('/api/push/subscription', user.auth, { subscription: { endpoint: 'nope' } })).status).toBe(400);
    expect((await put('/api/push/state', user.auth, { calendar: { trusted: true } })).status).toBe(400);
    expect((await put('/api/push/subscription', user.auth, { subscription: s }).set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await request(pushApp).put('/api/push/subscription').send({ subscription: s })).status).toBe(401);
  });
});
