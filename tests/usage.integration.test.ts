import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import usageApp from '../api/usage.js';
import { getDb, schema } from '../api/_lib/db.js';
import { RETENTION_DAYS, pruneUsage, usageSummary } from '../api/_lib/usage.js';

// Usage counts against the real database where one is configured. Every
// install id made here is removed afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { usageEvents } = schema;
const DAY = 24 * 3600_000;

const install = () => crypto.randomUUID();
const send = (body: object, ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`) =>
  request(usageApp).post('/api/usage').set('X-Forwarded-For', ip).send(body);

describe.skipIf(!hasDb)('usage counts', () => {
  const made: string[] = [];
  const newInstall = () => {
    const id = install();
    made.push(id);
    return id;
  };
  const rowsOf = (id: string) => getDb().select().from(usageEvents).where(eq(usageEvents.installId, id));

  afterAll(async () => {
    for (const id of made) await getDb().delete(usageEvents).where(eq(usageEvents.installId, id));
  });

  it('stores a guest batch, with nothing that names the account', async () => {
    const id = newInstall();
    const at = Date.now() - 60_000;
    const res = await send({ installId: id, platform: 'ios', appVersion: '1.0', events: [{ name: 'app_open', at, signedIn: false }, { name: 'chat_sent', at, signedIn: true }] });
    expect(res.status).toBe(200);
    const rows = await rowsOf(id);
    expect(rows.map((r) => [r.platform, r.appVersion, r.name, r.signedIn, r.occurredAt.getTime()]).sort()).toEqual(
      [
        ['ios', '1.0', 'app_open', false, at],
        ['ios', '1.0', 'chat_sent', true, at],
      ].sort()
    );
    const columns = await getDb().execute(sql`select column_name from information_schema.columns where table_name = 'usage_events'`);
    expect(columns.rows.map((c: any) => c.column_name)).not.toContain('user_id');
  });

  it('refuses a bad batch and stores none of it', async () => {
    const id = newInstall();
    const at = Date.now();
    expect((await send({ installId: id, platform: 'web', appVersion: '1', events: [{ name: 'app_open', at, signedIn: false, text: 'hi' }] })).status).toBe(400);
    expect((await send({ installId: id, platform: 'web', appVersion: '1', events: Array.from({ length: 51 }, () => ({ name: 'app_open', at, signedIn: false })) })).status).toBe(400);
    expect(await rowsOf(id)).toEqual([]);
  });

  it('is limited per caller', async () => {
    const saved = process.env.RATE_LIMIT_USAGE;
    const switched = process.env.RATE_LIMITS;
    process.env.RATE_LIMIT_USAGE = '1/100';
    // The suite turns limits off (vitest.config); on for this one.
    delete process.env.RATE_LIMITS;
    try {
      const ip = `10.250.${Math.floor(Math.random() * 250)}.9`;
      const body = { installId: newInstall(), platform: 'web', appVersion: '1', events: [{ name: 'app_open', at: Date.now(), signedIn: false }] };
      expect((await send(body, ip)).status).toBe(200);
      expect((await send(body, ip)).status).toBe(429);
    } finally {
      if (saved === undefined) delete process.env.RATE_LIMIT_USAGE;
      else process.env.RATE_LIMIT_USAGE = saved;
      if (switched !== undefined) process.env.RATE_LIMITS = switched;
    }
  });

  it('forgets events older than 13 months', async () => {
    const id = newInstall();
    const now = new Date();
    await getDb().insert(usageEvents).values([
      { installId: id, platform: 'web', appVersion: '1', name: 'app_open', signedIn: false, occurredAt: new Date(now.getTime() - (RETENTION_DAYS + 1) * DAY) },
      { installId: id, platform: 'web', appVersion: '1', name: 'app_open', signedIn: false, occurredAt: new Date(now.getTime() - (RETENTION_DAYS - 1) * DAY) },
    ]);
    await pruneUsage(now);
    expect((await rowsOf(id)).map((r) => r.occurredAt.getTime())).toEqual([now.getTime() - (RETENTION_DAYS - 1) * DAY]);
  });

  it('sums up installs and events per platform, signed in or not', async () => {
    const id = newInstall();
    const at = Date.now() - 2 * DAY;
    await getDb().insert(usageEvents).values([
      { installId: id, platform: 'android', appVersion: '1', name: 'practice_started', signedIn: true, occurredAt: new Date(at) },
      { installId: id, platform: 'android', appVersion: '1', name: 'practice_finished', signedIn: true, occurredAt: new Date(at) },
    ]);
    const summary = await usageSummary(new Date());
    const android = summary.installs.find((r) => r.platform === 'android' && r.signedIn);
    expect(android?.last7).toBeGreaterThanOrEqual(1);
    expect(android?.last30).toBeGreaterThanOrEqual(android!.last7);
    expect(summary.events.find((r) => r.name === 'practice_finished')?.last7).toBeGreaterThanOrEqual(1);
  });
});
