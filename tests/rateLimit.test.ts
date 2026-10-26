import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '../api/_lib/db.js';
import { LIMITS, checkLimit, clientAddress, limitMessage, limitsFor, rateLimited } from '../api/_lib/rateLimit.js';
import { registerChatRoute } from '../api/index.js';

// Rate limits on the routes that cost money (Claude, ElevenLabs) or fetch for
// the caller: counted per person, or per network address for guests.

const reqWith = (headers: Record<string, string>, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } }) as any;

describe('who is counted', () => {
  it('uses the address Vercel reports, then the forwarded one, then the socket', () => {
    expect(clientAddress(reqWith({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.7');
    expect(clientAddress(reqWith({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
    expect(clientAddress(reqWith({}, '::ffff:192.0.2.5'))).toBe('192.0.2.5');
  });

  it('counts an IPv6 caller by their /64 network', () => {
    expect(clientAddress(reqWith({ 'x-real-ip': '2001:db8:abcd:12:1111:2222:3333:4444' }))).toBe('2001:db8:abcd:12::/64');
    expect(clientAddress(reqWith({ 'x-real-ip': '2001:0db8::1' }))).toBe('2001:db8:0:0::/64');
  });
});

describe('configured limits', () => {
  it('reads "<per minute>/<per day>" from RATE_LIMIT_<ROUTE>, and keeps the built-in limit otherwise', () => {
    const saved = process.env.RATE_LIMIT_CHAT;
    try {
      delete process.env.RATE_LIMIT_CHAT;
      expect(limitsFor('chat')).toEqual(LIMITS.chat);
      process.env.RATE_LIMIT_CHAT = '20 / 500';
      expect(limitsFor('chat')).toEqual({ minute: 20, day: 500 });
      expect(limitsFor('voice')).toEqual(LIMITS.voice);
      for (const bad of ['20', '0/500', 'lots', '20/500/1']) {
        process.env.RATE_LIMIT_CHAT = bad;
        expect(limitsFor('chat')).toEqual(LIMITS.chat);
      }
    } finally {
      if (saved === undefined) delete process.env.RATE_LIMIT_CHAT;
      else process.env.RATE_LIMIT_CHAT = saved;
    }
  });
});

describe('what Amrita says', () => {
  it('asks for a pause, or for a rest until the day resets', () => {
    expect(limitMessage({ window: 'minute', retryAfter: 40 })).toContain('in a minute');
    expect(limitMessage({ window: 'day', retryAfter: 1800 })).toContain('in about an hour');
    expect(limitMessage({ window: 'day', retryAfter: 5 * 3600 + 60 })).toContain('in about 6 hours');
  });
});

// Against the configured database.
const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
describe.skipIf(!hasDb)('counting', () => {
  const run = randomUUID();
  const t = schema.rateLimitCounts;
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  // Documentation addresses (RFC 5737), unique to this run.
  const guestIp = (net: string) => `${net}.${Math.floor(Math.random() * 250) + 1}`;
  const guests: string[] = [];

  // Sets a caller's count for a window, now and in the next window too, so a
  // test that crosses a boundary still starts from it.
  const seed = async (caller: string, route: string, window: 'minute' | 'day', count: number) => {
    const size = window === 'minute' ? MINUTE : DAY;
    const n = Math.floor(Date.now() / size);
    await getDb()
      .insert(t)
      .values([n, n + 1].map((i) => ({ caller, bucket: `${route}:${window}:${i}`, count, expiresAt: new Date((i + 1) * size) })))
      .onConflictDoUpdate({ target: [t.caller, t.bucket], set: { count } });
  };

  let saved: string | undefined;
  beforeAll(() => {
    saved = process.env.RATE_LIMITS;
    process.env.RATE_LIMITS = 'on';
  });
  afterAll(async () => {
    process.env.RATE_LIMITS = saved;
    await getDb().delete(t).where(like(t.caller, `user:${run}%`));
    for (const ip of guests) await getDb().delete(t).where(eq(t.caller, `ip:${ip}`));
  });

  it('allows up to the minute limit, then says how long to wait', async () => {
    const caller = `user:${run}-minute`;
    const now = new Date(Math.floor(Date.now() / MINUTE) * MINUTE + 15_000); // 15 s into a minute
    for (let i = 0; i < LIMITS.chat.minute; i++) expect(await checkLimit(caller, 'chat', now)).toBeNull();
    expect(await checkLimit(caller, 'chat', now)).toEqual({ window: 'minute', retryAfter: 45 });
    expect(await checkLimit(caller, 'chat', new Date(now.getTime() + MINUTE))).toBeNull();
  });

  it('applies a configured limit', async () => {
    const caller = `user:${run}-configured`;
    process.env.RATE_LIMIT_INSIGHT = '2/50';
    try {
      const now = new Date(Math.floor(Date.now() / MINUTE) * MINUTE + 15_000);
      expect(await checkLimit(caller, 'insight', now)).toBeNull();
      expect(await checkLimit(caller, 'insight', now)).toBeNull();
      expect(await checkLimit(caller, 'insight', now)).toMatchObject({ window: 'minute' });
    } finally {
      delete process.env.RATE_LIMIT_INSIGHT;
    }
  });

  it('counts each route on its own, and the daily limit outlasts a new minute', async () => {
    const caller = `user:${run}-day`;
    await seed(caller, 'chat', 'day', LIMITS.chat.day);
    const blocked = await checkLimit(caller, 'chat');
    expect(blocked).toMatchObject({ window: 'day' });
    expect(blocked!.retryAfter).toBeLessThanOrEqual(DAY / 1000);
    expect(await checkLimit(caller, 'insight')).toBeNull();
  });

  it('chat: Amrita explains in her reply, and Claude is not called', async () => {
    const ip = guestIp('198.51.100');
    guests.push(ip);
    await seed(`ip:${ip}`, 'chat', 'minute', LIMITS.chat.minute);
    let called = false;
    const fake = { messages: { stream: () => ((called = true), {}) } } as any;
    const app = express();
    app.use(express.json());
    registerChatRoute(app, fake, 'test-key');
    const res = await request(app).post('/api/chat').set('X-Real-IP', ip).send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(200);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.text).toContain('"type":"error"');
    expect(res.text).toContain('pause for a breath');
    expect(res.text).toContain('"type":"done"');
    expect(called).toBe(false);
  });

  it('other routes answer 429 with Retry-After', async () => {
    const ip = guestIp('203.0.113');
    guests.push(ip);
    await seed(`ip:${ip}`, 'voice', 'minute', LIMITS.voice.minute);
    const app = express();
    app.post('/api/tts', rateLimited('voice'), (_req, res) => res.send('audio'));
    const res = await request(app).post('/api/tts').set('X-Real-IP', ip);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'rate_limited', window: 'minute' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
