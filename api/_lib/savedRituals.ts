import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from './db.js';

// The rituals a signed-in user bookmarked. A device sends what it saved and
// what it removed; reading returns the account's current list, which is
// small enough to send whole. A removal leaves a marker row behind, so a
// late upload of the same ritual (a device that was offline, a retried
// request) cannot bring it back.

const { savedRituals } = schema;

export const MAX_RITUAL_BYTES = 64 * 1024;
export const MAX_SAVES = 25;
export const MAX_REMOVES = 100;
/** The newest this many are returned; bookmarks beyond it are kept but not sent. */
export const MAX_LISTED = 200;

const ritualSchema = z.looseObject({
  id: z.string().regex(/^[\w-]{1,64}$/),
  title: z.string().max(300),
  date: z.string().max(40),
  query: z.string().max(2000),
  category: z.string().max(40),
  // The ritual as it was shown. Kept as given; each client reads what it knows.
  result: z.looseObject({}),
});

export type SavedRitual = z.infer<typeof ritualSchema>;

const idSchema = z.string().regex(/^[\w-]{1,64}$/);

// Returns what may be stored, or which list (and position) may not.
export function parseChanges(
  body: unknown
): { saves: SavedRitual[]; removes: string[] } | { invalid: 'saves' | 'removes'; at: number } {
  const { saves = [], removes = [] } = (body ?? {}) as { saves?: unknown; removes?: unknown };
  if (!Array.isArray(saves) || saves.length > MAX_SAVES) return { invalid: 'saves', at: -1 };
  if (!Array.isArray(removes) || removes.length > MAX_REMOVES) return { invalid: 'removes', at: -1 };
  if (saves.length === 0 && removes.length === 0) return { invalid: 'saves', at: -1 };
  const parsedSaves: SavedRitual[] = [];
  for (let i = 0; i < saves.length; i++) {
    if (JSON.stringify(saves[i] ?? null).length > MAX_RITUAL_BYTES) return { invalid: 'saves', at: i };
    const parsed = ritualSchema.safeParse(saves[i]);
    if (!parsed.success) return { invalid: 'saves', at: i };
    parsedSaves.push(parsed.data);
  }
  for (let i = 0; i < removes.length; i++) {
    if (!idSchema.safeParse(removes[i]).success) return { invalid: 'removes', at: i };
  }
  return { saves: parsedSaves, removes: removes as string[] };
}

// Removals first, so a ritual saved and removed in the same request stays removed.
// Returns how many saves were new and how many removals took effect.
export async function applyChanges(userId: string, saves: SavedRitual[], removes: string[]): Promise<{ stored: number; removed: number }> {
  const db = getDb();
  let removed = 0;
  if (removes.length) {
    const marked = await db
      .insert(savedRituals)
      .values(removes.map((ritualId) => ({ userId, ritualId, data: null, removedAt: new Date() })))
      .onConflictDoUpdate({
        target: [savedRituals.userId, savedRituals.ritualId],
        set: { data: null, removedAt: sql`coalesce(${savedRituals.removedAt}, now())` },
      })
      .returning({ ritualId: savedRituals.ritualId });
    removed = marked.length;
  }
  let stored = 0;
  if (saves.length) {
    // An id already stored, or already removed, is left as it is.
    const inserted = await db
      .insert(savedRituals)
      .values(saves.map((r) => ({ userId, ritualId: r.id, data: r })))
      .onConflictDoNothing()
      .returning({ ritualId: savedRituals.ritualId });
    stored = inserted.length;
  }
  return { stored, removed };
}

/** The account's saved rituals, newest first. */
export async function listSaved(userId: string, limit = MAX_LISTED): Promise<SavedRitual[]> {
  const rows = await getDb()
    .select({ data: savedRituals.data })
    .from(savedRituals)
    .where(and(eq(savedRituals.userId, userId), isNull(savedRituals.removedAt)))
    .orderBy(desc(savedRituals.savedAt), desc(savedRituals.ritualId))
    .limit(limit);
  return rows.map((r) => r.data as SavedRitual);
}
