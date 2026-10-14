import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import type { RefreshRow, RefreshStore } from './refresh.js';

// Postgres storage for refresh tokens. The rules live in refresh.ts; this file
// only reads and writes rows.

const { refreshTokens } = schema;

export const dbRefreshStore: RefreshStore = {
  async insert(row) {
    await getDb().insert(refreshTokens).values(row);
  },

  async findByHash(tokenHash) {
    const [row] = await getDb().select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    return (row as RefreshRow | undefined) ?? null;
  },

  // One statement, so two concurrent requests cannot both win: the database
  // decides, and only the winner gets a row back.
  async claimRotation(id, rotatedAt, successorEnc) {
    const claimed = await getDb()
      .update(refreshTokens)
      .set({ rotatedAt, successorEnc })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.rotatedAt), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return claimed.length === 1;
  },

  async remove(id) {
    await getDb().delete(refreshTokens).where(eq(refreshTokens.id, id));
  },

  async revokeFamily(familyId, at) {
    await getDb()
      .update(refreshTokens)
      .set({ revokedAt: at, successorEnc: null })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  },
};
