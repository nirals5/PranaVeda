import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import type { StoredProfile } from './profileSchema.js';

// Reading and writing a signed-in user's wellness profile, with optimistic
// concurrency: a write names the version it was based on, and is refused if
// someone else has written since. Version 0 means "no profile yet".

const { users, wellnessProfiles } = schema;

export interface VersionedProfile {
  profile: StoredProfile;
  version: number;
}

export type SaveResult = { ok: true; version: number } | { ok: false; current: VersionedProfile };

// Null when the account does not exist (for example, deleted moments ago).
export async function loadAccountProfile(userId: string): Promise<VersionedProfile | null> {
  const [row] = await getDb()
    .select({ data: wellnessProfiles.data, version: wellnessProfiles.version })
    .from(users)
    .leftJoin(wellnessProfiles, eq(wellnessProfiles.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!row) return null;
  return { profile: (row.data as StoredProfile | null) ?? {}, version: row.version ?? 0 };
}

export async function saveProfile(userId: string, profile: StoredProfile, baseVersion: number): Promise<SaveResult> {
  const db = getDb();
  const written =
    baseVersion === 0
      ? await db
          .insert(wellnessProfiles)
          .values({ userId, data: profile, version: 1 })
          .onConflictDoNothing()
          .returning({ version: wellnessProfiles.version })
      : await db
          .update(wellnessProfiles)
          .set({ data: profile, version: sql`${wellnessProfiles.version} + 1`, updatedAt: new Date() })
          .where(and(eq(wellnessProfiles.userId, userId), eq(wellnessProfiles.version, baseVersion)))
          .returning({ version: wellnessProfiles.version });
  if (written.length === 1) return { ok: true, version: written[0].version };
  const current = await loadAccountProfile(userId);
  return { ok: false, current: current ?? { profile: {}, version: 0 } };
}

// Applies a list of changes on top of whatever is stored now, retrying if
// another write lands in between. Used by the chat, which may run for up to a
// minute: replaying its changes onto the latest profile means a profile
// updated meanwhile on another device is built upon, not overwritten.
export async function applyProfileChanges(
  userId: string,
  start: VersionedProfile,
  changes: ((profile: StoredProfile) => StoredProfile)[],
  attempts = 3
): Promise<VersionedProfile | null> {
  let base = start;
  for (let i = 0; i < attempts; i++) {
    const next = changes.reduce((p, change) => change(p), base.profile);
    const result = await saveProfile(userId, next, base.version);
    if ('current' in result) base = result.current;
    else return { profile: next, version: result.version };
  }
  return null;
}
