import type { NextFunction, Request, Response } from 'express';
import { lt, sql } from 'drizzle-orm';
import { isIPv6 } from 'node:net';
import { authenticate, first } from './auth.js';
import { getDb, schema } from './db.js';

// Rate limiting for the routes that cost money per request (Claude, ElevenLabs)
// or fetch from the internet on the caller's behalf. Counted in Postgres, so
// every serverless instance sees the same numbers: a signed-in person by their
// account, a guest by their network address. Fixed windows of a minute and a
// UTC day. If the count cannot be read the request is let through — a database
// problem should not silence Amrita.

export type LimitedRoute = 'chat' | 'coaching' | 'insight' | 'voice' | 'calendar';

// Requests per caller per window. Generous for a real person (a busy day of
// conversation is well under the daily figure); a script hits them quickly.
export const LIMITS: Record<LimitedRoute, { minute: number; day: number }> = {
  chat: { minute: 10, day: 300 },
  coaching: { minute: 5, day: 50 },
  insight: { minute: 5, day: 50 },
  voice: { minute: 30, day: 600 }, // a spoken reply, or a breath cue (a few at a practice's start)
  calendar: { minute: 10, day: 300 },
};

// A limit that was reached: which window, and the seconds until it resets.
export interface LimitReached {
  window: 'minute' | 'day';
  retryAfter: number;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// Expired rows are cleared on about one request in fifty.
const CLEANUP_CHANCE = 0.02;

// Counts this request: null while it is within the limits, else the limit reached.
export async function checkLimit(caller: string, route: LimitedRoute, now: Date = new Date()): Promise<LimitReached | null> {
  const t = schema.rateLimitCounts;
  const minute = Math.floor(now.getTime() / MINUTE_MS);
  const day = Math.floor(now.getTime() / DAY_MS);
  const minuteEnds = (minute + 1) * MINUTE_MS;
  const dayEnds = (day + 1) * DAY_MS;
  try {
    const rows = await getDb()
      .insert(t)
      .values([
        { caller, bucket: `${route}:minute:${minute}`, count: 1, expiresAt: new Date(minuteEnds) },
        { caller, bucket: `${route}:day:${day}`, count: 1, expiresAt: new Date(dayEnds) },
      ])
      .onConflictDoUpdate({ target: [t.caller, t.bucket], set: { count: sql`${t.count} + 1` } })
      .returning({ bucket: t.bucket, count: t.count });
    if (Math.random() < CLEANUP_CHANCE) await getDb().delete(t).where(lt(t.expiresAt, now));

    const countFor = (window: string) => rows.find((r) => r.bucket.startsWith(`${route}:${window}:`))?.count ?? 0;
    const seconds = (ends: number) => Math.max(1, Math.ceil((ends - now.getTime()) / 1000));
    // The longer wait wins: past the daily limit, a new minute does not help.
    if (countFor('day') > LIMITS[route].day) return { window: 'day', retryAfter: seconds(dayEnds) };
    if (countFor('minute') > LIMITS[route].minute) return { window: 'minute', retryAfter: seconds(minuteEnds) };
    return null;
  } catch (err: any) {
    console.error('[rate limit] count failed, letting the request through:', err?.message || err);
    return null;
  }
}

// The guest's address. On Vercel these headers are set by Vercel itself, not
// by the caller. An IPv6 caller is counted by their /64 network, since one
// device can pick a new address within it at will.
export function clientAddress(req: Request): string {
  const forwarded = first(req.headers['x-forwarded-for'])?.split(',')[0];
  let ip = (first(req.headers['x-real-ip']) ?? forwarded ?? req.socket?.remoteAddress ?? 'unknown').trim();
  ip = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '').replace(/%.*$/, '');
  return isIPv6(ip) ? ipv6Network(ip) : ip;
}

function ipv6Network(ip: string): string {
  const [head, tail] = ip.toLowerCase().split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const groups = tail === undefined ? before : [...before, ...Array(8 - before.length - after.length).fill('0'), ...after];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export const callerFor = (req: Request, userId?: string) => (userId ? `user:${userId}` : `ip:${clientAddress(req)}`);

// Switched off with RATE_LIMITS=off (the test suite does, so tests that call
// a route many times are not counted).
const enabled = () => process.env.RATE_LIMITS !== 'off';

export async function limitRequest(req: Request, route: LimitedRoute, userId?: string): Promise<LimitReached | null> {
  return enabled() ? checkLimit(callerFor(req, userId), route) : null;
}

// For routes that answer with JSON or audio: 429 with Retry-After. The apps
// already fall back when these fail (the built-in voice, no insight card).
export function rateLimited(route: LimitedRoute) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await authenticate(req);
    const limit = await limitRequest(req, route, auth.kind === 'user' ? auth.userId : undefined);
    if (!limit) return next();
    res.setHeader('Retry-After', String(limit.retryAfter));
    res.status(429).json({ error: 'rate_limited', window: limit.window, retryAfter: limit.retryAfter });
  };
}

// What Amrita says in the chat when a limit is reached.
export function limitMessage(limit: LimitReached): string {
  if (limit.window === 'minute') {
    return "We're moving quickly — let's pause for a breath together. Please send your next message in a minute.";
  }
  const hours = Math.ceil(limit.retryAfter / 3600);
  const when = hours <= 1 ? 'in about an hour' : `in about ${hours} hours`;
  return `We've talked a great deal today, and I need to rest. Please come back ${when} and we'll carry on.`;
}
