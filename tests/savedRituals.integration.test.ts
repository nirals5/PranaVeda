import 'dotenv/config';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import syncApp from '../api/sync.js';
import { getDb, schema } from '../api/_lib/db.js';
import { MAX_SAVES } from '../api/_lib/savedRituals.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, useSecrets } from './helpers.js';

// Saved-ritual sync end to end against the real database. Skipped when no
// database is configured; every account created here is deleted afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, savedRituals } = schema;

let n = 0;
const ritual = (overrides: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `save_${Date.now()}_${n}`,
    title: `Grounding ${n}`,
    date: 'Oct 17',
    query: 'I feel scattered',
    category: 'Yoga',
    result: { summary: 'Grounding', primaryEnergy: 'Scattered Wind', yogaPractice: { title: `Grounding ${n}`, poses: [] } },
    ...overrides,
  };
};

describe.skipIf(!hasDb)('saved-ritual sync', () => {
  const created: string[] = [];

  const newUser = async () => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest saved' }).returning({ id: users.id });
    created.push(user.id);
    return { id: user.id, auth: `Bearer ${await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app')}` };
  };
  const change = (auth: string, body: object) => request(syncApp).post('/api/sync/saved-rituals').set('Authorization', auth).send(body);
  const list = async (auth: string) => (await request(syncApp).get('/api/sync/saved-rituals').set('Authorization', auth)).body.rituals;

  beforeAll(() => useSecrets(SECRET_A));
  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  it('stores saved rituals and lists them newest first, intact', async () => {
    const user = await newUser();
    const first = ritual();
    expect((await change(user.auth, { saves: [first] })).body).toEqual({ stored: 1, removed: 0 });
    const second = ritual();
    await change(user.auth, { saves: [second] });
    expect(await list(user.auth)).toEqual([second, first]);
  });

  it('stores a ritual once however many times it is sent', async () => {
    const user = await newUser();
    const r = ritual();
    expect((await change(user.auth, { saves: [r] })).body.stored).toBe(1);
    expect((await change(user.auth, { saves: [r] })).body.stored).toBe(0);
    expect(await list(user.auth)).toHaveLength(1);
  });

  it('keeps a removed ritual removed, even when it is uploaded again later', async () => {
    const user = await newUser();
    const kept = ritual();
    const gone = ritual();
    await change(user.auth, { saves: [kept, gone] });
    expect((await change(user.auth, { removes: [gone.id] })).body).toEqual({ stored: 0, removed: 1 });
    expect((await list(user.auth)).map((r: { id: string }) => r.id)).toEqual([kept.id]);

    // A device that was offline sends it again: it stays removed.
    expect((await change(user.auth, { saves: [gone] })).body.stored).toBe(0);
    expect((await list(user.auth)).map((r: { id: string }) => r.id)).toEqual([kept.id]);

    // Removing something the server never had leaves a marker too.
    const neverSent = ritual();
    await change(user.auth, { removes: [neverSent.id] });
    await change(user.auth, { saves: [neverSent] });
    expect((await list(user.auth)).map((r: { id: string }) => r.id)).toEqual([kept.id]);

    // Removed rituals keep no copy of the ritual itself.
    const [row] = await getDb().select().from(savedRituals).where(eq(savedRituals.ritualId, gone.id));
    expect(row.data).toBeNull();
    expect(row.removedAt).not.toBeNull();
  });

  it("keeps each account's rituals to itself, and deletes them with the account", async () => {
    const a = await newUser();
    const b = await newUser();
    await change(a.auth, { saves: [ritual()] });
    expect(await list(b.auth)).toEqual([]);
    await getDb().delete(users).where(eq(users.id, a.id));
    expect(await getDb().select().from(savedRituals).where(eq(savedRituals.userId, a.id))).toEqual([]);
  });

  it('refuses malformed or oversized changes, and guests', async () => {
    const user = await newUser();
    expect((await change(user.auth, {})).status).toBe(400);
    expect((await change(user.auth, { saves: [{ ...ritual(), id: 'bad id!' }] })).body).toMatchObject({ error: 'invalid_saves', invalidAt: 0 });
    expect((await change(user.auth, { saves: [ritual({ result: 'not an object' })] })).status).toBe(400);
    expect((await change(user.auth, { saves: Array.from({ length: MAX_SAVES + 1 }, () => ritual()) })).status).toBe(400);
    expect((await change(user.auth, { removes: ['ok', 'not ok!'] })).body).toMatchObject({ error: 'invalid_removes', invalidAt: 1 });
    expect((await change(user.auth, { saves: [ritual({ result: { huge: 'x'.repeat(70_000) } })] })).status).toBe(400);
    expect((await request(syncApp).get('/api/sync/saved-rituals')).status).toBe(401);
    expect((await request(syncApp).post('/api/sync/saved-rituals').send({ saves: [ritual()] })).status).toBe(401);
  });
});
