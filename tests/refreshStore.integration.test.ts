import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '../api/_lib/db.js';
import { REFRESH_GRACE_MS, RefreshError, issueSession, rotateSession } from '../api/_lib/refresh.js';
import { dbRefreshStore } from '../api/_lib/refreshStore.js';
import { SECRET_A, later, useSecrets } from './helpers.js';

// Runs the same rotation rules against the real database, to check the SQL —
// above all that the conditional update lets exactly one concurrent request
// win. Skipped when no database is configured. Everything it creates hangs
// off one throwaway user, which is deleted (cascading) afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, refreshTokens } = schema;

describe.skipIf(!hasDb)('refresh tokens in Postgres', () => {
  let userId: string;
  const session = () => ({ userId, client: 'ios', aud: 'app' }) as const;
  const familyRows = (familyId: string) =>
    getDb().select().from(refreshTokens).where(eq(refreshTokens.familyId, familyId));

  beforeAll(async () => {
    useSecrets(SECRET_A);
    const [user] = await getDb().insert(users).values({ displayName: 'vitest throwaway' }).returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    if (!userId) return;
    await getDb().delete(users).where(eq(users.id, userId));
    expect(await getDb().select().from(refreshTokens).where(eq(refreshTokens.userId, userId))).toHaveLength(0);
  });

  it('issues and rotates', async () => {
    const first = await issueSession(dbRefreshStore, session());
    const second = await rotateSession(dbRefreshStore, first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.sessionId).toBe(first.sessionId);
    expect(await familyRows(first.sessionId)).toHaveLength(2);
  });

  it('lets exactly one of two simultaneous rotations win', async () => {
    const first = await issueSession(dbRefreshStore, session());
    const [a, b] = await Promise.all([
      rotateSession(dbRefreshStore, first.refreshToken),
      rotateSession(dbRefreshStore, first.refreshToken),
    ]);
    expect(a.refreshToken).toBe(b.refreshToken);
    expect(await familyRows(first.sessionId)).toHaveLength(2);
  });

  it('revokes the family on reuse after the grace window', async () => {
    const now = new Date();
    const first = await issueSession(dbRefreshStore, session(), now);
    const second = await rotateSession(dbRefreshStore, first.refreshToken, now);
    const afterGrace = later(now, REFRESH_GRACE_MS + 1);

    await expect(rotateSession(dbRefreshStore, first.refreshToken, afterGrace)).rejects.toMatchObject({ reason: 'reused' });
    await expect(rotateSession(dbRefreshStore, second.refreshToken, afterGrace)).rejects.toBeInstanceOf(RefreshError);
    const rows = await familyRows(first.sessionId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt && !r.successorEnc)).toBe(true);
  });
});
