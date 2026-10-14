import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import type { DeviceInfo } from './device.js';
import type { VerifiedIdentity } from './google.js';
import type { Client } from './refresh.js';

const { users, identities, sessions } = schema;

export interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string | null;
}

const toPublic = (row: typeof users.$inferSelect): PublicUser => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  timezone: row.timezone,
});

export async function getUser(userId: string): Promise<PublicUser | null> {
  const [row] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  return row && !row.deletedAt ? toPublic(row) : null;
}

async function userForIdentity(provider: 'apple' | 'google', subject: string): Promise<PublicUser | null> {
  const [row] = await getDb()
    .select({ user: users })
    .from(identities)
    .innerJoin(users, eq(users.id, identities.userId))
    .where(and(eq(identities.provider, provider), eq(identities.subject, subject)))
    .limit(1);
  return row && !row.user.deletedAt ? toPublic(row.user) : null;
}

// Returns the account behind a sign-in, creating it the first time. The user
// and identity rows are written in one transaction; if a second sign-in for
// the same identity lands at the same moment, the unique index rejects one of
// them and that request picks up the account the other created.
export async function findOrCreateUser(provider: 'apple' | 'google', identity: VerifiedIdentity): Promise<PublicUser> {
  const existing = await userForIdentity(provider, identity.subject);
  if (existing) return existing;

  const db = getDb();
  const id = randomUUID();
  const email = identity.emailVerified ? (identity.email ?? null) : null;
  try {
    await db.batch([
      db.insert(users).values({ id, email, displayName: identity.name ?? null }),
      db.insert(identities).values({ userId: id, provider, subject: identity.subject, email: identity.email ?? null }),
    ]);
  } catch (err) {
    const raced = await userForIdentity(provider, identity.subject);
    if (raced) return raced;
    throw err;
  }
  return { id, email, displayName: identity.name ?? null, timezone: null };
}

export async function updateUser(userId: string, changes: { timezone?: string; displayName?: string }): Promise<PublicUser | null> {
  const [row] = await getDb().update(users).set(changes).where(eq(users.id, userId)).returning();
  return row ? toPublic(row) : null;
}

export async function recordSession(familyId: string, userId: string, client: Client, device: DeviceInfo): Promise<void> {
  await getDb().insert(sessions).values({ familyId, userId, client, ...device });
}

export async function touchSession(familyId: string, at: Date = new Date()): Promise<void> {
  await getDb().update(sessions).set({ lastSeenAt: at }).where(eq(sessions.familyId, familyId));
}

export async function endSession(familyId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.familyId, familyId));
}
