import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { seal, unseal } from './tokens.js';
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

// A new sign-in method whose verified email already belongs to an account.
// Creating a second account would split someone's data in two, and merging
// silently would let whoever controls that email into the account — so the
// person is told which method to use instead.
export class AccountExistsError extends Error {
  constructor(public provider: 'apple' | 'google') {
    super(`account exists (sign in with ${provider})`);
  }
}

async function providerForEmail(email: string): Promise<'apple' | 'google' | null> {
  const [row] = await getDb()
    .select({ provider: identities.provider })
    .from(users)
    .innerJoin(identities, eq(identities.userId, users.id))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  return row?.provider ?? null;
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
  if (email && !identity.emailIsRelay) {
    const existingProvider = await providerForEmail(email);
    if (existingProvider) {
      // The "existing" account may be this very identity, created a moment
      // ago by a simultaneous request (a double click on the button).
      const raced = await userForIdentity(provider, identity.subject);
      if (raced) return raced;
      throw new AccountExistsError(existingProvider);
    }
  }
  try {
    await db.batch([
      db.insert(users).values({ id, email, displayName: identity.name ?? null }),
      db.insert(identities).values({
        userId: id,
        provider,
        subject: identity.subject,
        email: identity.email ?? null,
        emailIsRelay: !!identity.emailIsRelay,
      }),
    ]);
  } catch (err) {
    const raced = await userForIdentity(provider, identity.subject);
    if (raced) return raced;
    throw err;
  }
  return { id, email, displayName: identity.name ?? null, timezone: null };
}

// Apple's refresh token, with the client id it was issued to (revoking it
// needs both). Kept encrypted, and replaced on each sign-in so it is current.
export interface AppleGrant {
  refreshToken: string;
  clientId: string;
}

export async function saveAppleGrant(subject: string, grant: AppleGrant, key: Buffer): Promise<void> {
  await getDb()
    .update(identities)
    .set({ appleRefreshTokenEnc: seal(JSON.stringify(grant), key) })
    .where(and(eq(identities.provider, 'apple'), eq(identities.subject, subject)));
}

export async function appleGrantsFor(userId: string, key: Buffer | null): Promise<{ grants: AppleGrant[]; unreadable: number }> {
  const rows = await getDb()
    .select({ sealed: identities.appleRefreshTokenEnc })
    .from(identities)
    .where(and(eq(identities.userId, userId), eq(identities.provider, 'apple')));
  const grants: AppleGrant[] = [];
  let unreadable = 0;
  for (const { sealed } of rows) {
    if (!sealed) continue;
    const opened = key ? unseal(sealed, key) : null;
    try {
      const grant = opened ? JSON.parse(opened) : null;
      if (grant?.refreshToken && grant?.clientId) grants.push(grant);
      else unreadable++;
    } catch {
      unreadable++;
    }
  }
  return { grants, unreadable };
}

// Permanent. Deleting the user row removes, through the database's cascades,
// every sign-in method, session and refresh token that belongs to it.
export async function deleteUser(userId: string): Promise<boolean> {
  const deleted = await getDb().delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return deleted.length === 1;
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
