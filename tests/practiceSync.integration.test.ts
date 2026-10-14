import 'dotenv/config';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import syncApp from '../api/sync.js';
import authApp from '../api/auth.js';
import { getDb, schema } from '../api/_lib/db.js';
import { MAX_UPLOAD, entriesAfter, storeEntries, useSettleWindow } from '../api/_lib/practiceLog.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, useSecrets } from './helpers.js';

// Practice-log sync end to end against the real database. Skipped when no
// database is configured; every account created here is deleted afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, practiceLogEntries } = schema;

let n = 0;
const practice = (overrides: Record<string, unknown> = {}) => {
  n += 1;
  const completedAt = new Date(Date.UTC(2026, 9, 1, 7) + n * 60_000).toISOString();
  return {
    id: `p_${Date.now()}_${n}`,
    kind: 'breathwork',
    title: `Equal Breathing ${n}`,
    completedAt,
    localDate: completedAt.slice(0, 10),
    durationMinutes: 5,
    ...overrides,
  };
};

describe.skipIf(!hasDb)('practice-log sync', () => {
  const created: string[] = [];

  const newUser = async () => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest practice' }).returning({ id: users.id });
    created.push(user.id);
    return { id: user.id, auth: `Bearer ${await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app')}` };
  };
  const upload = (auth: string, entries: unknown) => request(syncApp).post('/api/sync/practice-log').set('Authorization', auth).send({ entries });
  const readAfter = (auth: string, after: number | string = 0) =>
    request(syncApp).get(`/api/sync/practice-log?after=${after}`).set('Authorization', auth);

  beforeAll(() => {
    useSecrets(SECRET_A);
    useSettleWindow(0); // most tests read straight after writing
  });

  afterAll(async () => {
    useSettleWindow(5000);
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  it('stores practices and hands them back, with heart readings and the ritual snapshot intact', async () => {
    const user = await newUser();
    const ritual = practice({
      kind: 'ritual',
      title: 'Evening wind-down',
      durationMinutes: 20,
      heart: { startBpm: 82, endBpm: 66, avgBpm: 71, minBpm: 64, maxBpm: 84, rmssd: 41 },
      result: { summary: 'Grounding', yogaPractice: { title: 'Evening wind-down', poses: [] } },
    });
    const breath = practice();
    expect((await upload(user.auth, [ritual, breath])).body).toEqual({ stored: 2 });

    const page = await readAfter(user.auth);
    expect(page.status).toBe(200);
    expect(page.body.entries).toEqual([ritual, breath]);
    expect(page.body.hasMore).toBe(false);
    expect(page.body.cursor).toBeGreaterThan(0);
  });

  it('stores a practice once however many times it is sent', async () => {
    const user = await newUser();
    const p = practice();
    expect((await upload(user.auth, [p])).body).toEqual({ stored: 1 });
    expect((await upload(user.auth, [p])).body).toEqual({ stored: 0 });
    expect((await upload(user.auth, [p, practice()])).body).toEqual({ stored: 1 });
    expect((await readAfter(user.auth)).body.entries).toHaveLength(2);
  });

  it('returns only what is new since the cursor, a page at a time', async () => {
    const user = await newUser();
    await upload(user.auth, [practice(), practice(), practice()]);
    const first = await entriesAfter(user.id, 0, 2);
    expect(first.entries).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = await entriesAfter(user.id, first.cursor, 2);
    expect(second.entries).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    const nothing = await readAfter(user.auth, second.cursor);
    expect(nothing.body).toEqual({ entries: [], cursor: second.cursor, hasMore: false });

    const later = practice();
    await upload(user.auth, [later]);
    expect((await readAfter(user.auth, second.cursor)).body.entries).toEqual([later]);
  });

  it('holds back a practice for a few seconds after it arrives, so a reader never skips one', async () => {
    const user = await newUser();
    useSettleWindow(5000);
    try {
      await storeEntries(user.id, [practice() as any]);
      expect((await readAfter(user.auth)).body).toEqual({ entries: [], cursor: 0, hasMore: false });
    } finally {
      useSettleWindow(0);
    }
    expect((await readAfter(user.auth)).body.entries).toHaveLength(1);
  });

  it('keeps each person’s practices to themselves', async () => {
    const a = await newUser();
    const b = await newUser();
    await upload(a.auth, [practice({ title: 'only for a' })]);
    expect((await readAfter(b.auth)).body.entries).toEqual([]);
    // Ids are made on devices, so two people may produce the same one.
    const shared = practice();
    expect((await upload(a.auth, [shared])).body.stored).toBe(1);
    expect((await upload(b.auth, [shared])).body.stored).toBe(1);
  });

  it('refuses malformed practices, oversized uploads, guests, other sites and a bad cursor', async () => {
    const user = await newUser();
    const refused = async (entries: unknown) => (await upload(user.auth, entries)).body.error;
    expect(await refused([practice({ kind: 'nap' })])).toBe('invalid_entries');
    expect(await refused([practice({ localDate: '14/10/2026' })])).toBe('invalid_entries');
    expect(await refused([practice({ completedAt: 'yesterday' })])).toBe('invalid_entries');
    expect(await refused([practice({ id: 'has spaces' })])).toBe('invalid_entries');
    expect(await refused([practice({ result: { blob: 'x'.repeat(70_000) } })])).toBe('invalid_entries');
    expect(await refused([])).toBe('invalid_entries');
    expect(await refused(Array.from({ length: MAX_UPLOAD + 1 }, () => practice()))).toBe('invalid_entries');
    const mixed = await upload(user.auth, [practice(), practice({ kind: 'nap' })]);
    expect(mixed.body).toMatchObject({ error: 'invalid_entries', invalidAt: 1 });

    expect((await request(syncApp).post('/api/sync/practice-log').send({ entries: [practice()] })).status).toBe(401);
    expect((await upload(user.auth, [practice()]).set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await readAfter(user.auth, 'abc')).body).toEqual({ error: 'invalid_cursor' });
    expect((await readAfter(user.auth)).body.entries).toEqual([]);
  });

  it('is removed when the account is deleted', async () => {
    const user = await newUser();
    await upload(user.auth, [practice(), practice()]);
    await request(authApp).delete('/api/me').set('Authorization', user.auth).send({ confirm: true });
    expect(await getDb().select().from(practiceLogEntries).where(eq(practiceLogEntries.userId, user.id))).toHaveLength(0);
  });
});
