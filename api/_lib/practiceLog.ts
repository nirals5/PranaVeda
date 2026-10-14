import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from './db.js';

// The practice log of signed-in users. Entries are made on the device and
// only ever added, so storing is "insert unless already there", and reading
// is "everything after the last one this device has seen".

const { practiceLogEntries } = schema;

export const MAX_ENTRY_BYTES = 64 * 1024;
export const MAX_UPLOAD = 25;
export const PAGE_SIZE = 200;

// Sequence numbers are handed out when a save starts, but saves can finish
// out of order: entry 11 may be visible a moment before entry 10. A reader
// that took 11 and moved its cursor past it would never see 10. So only
// entries that arrived at least this long ago are handed out — by then every
// earlier save has long finished.
let settleMs = 5000;
export function useSettleWindow(ms: number) {
  settleMs = ms;
}

const finite = z.number().finite();

const entrySchema = z.looseObject({
  id: z.string().regex(/^[\w-]{1,64}$/),
  kind: z.enum(['ritual', 'breathwork']),
  title: z.string().max(300),
  completedAt: z.iso.datetime({ offset: true }),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(0).max(24 * 60),
  heart: z
    .looseObject({ startBpm: finite, endBpm: finite, avgBpm: finite, minBpm: finite, maxBpm: finite, rmssd: finite.optional() })
    .optional(),
  // The ritual as it was shown, so the day can reopen it. Kept as given.
  result: z.unknown().optional(),
});

export type PracticeEntry = z.infer<typeof entrySchema>;

// Returns the entries if every one may be stored, or the position of the
// first that may not.
export function parseEntries(value: unknown): { entries: PracticeEntry[] } | { invalidAt: number } {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_UPLOAD) return { invalidAt: -1 };
  const entries: PracticeEntry[] = [];
  for (let i = 0; i < value.length; i++) {
    if (JSON.stringify(value[i] ?? null).length > MAX_ENTRY_BYTES) return { invalidAt: i };
    const parsed = entrySchema.safeParse(value[i]);
    if (!parsed.success) return { invalidAt: i };
    entries.push(parsed.data);
  }
  return { entries };
}

// Returns how many were new.
export async function storeEntries(userId: string, entries: PracticeEntry[]): Promise<number> {
  const inserted = await getDb()
    .insert(practiceLogEntries)
    .values(
      entries.map((e) => ({
        userId,
        entryId: e.id,
        completedAt: new Date(e.completedAt),
        localDate: e.localDate,
        kind: e.kind,
        data: e,
      }))
    )
    .onConflictDoNothing()
    .returning({ seq: practiceLogEntries.seq });
  return inserted.length;
}

export async function entriesAfter(
  userId: string,
  afterSeq: number,
  limit = PAGE_SIZE
): Promise<{ entries: PracticeEntry[]; cursor: number; hasMore: boolean }> {
  const rows = await getDb()
    .select({ seq: practiceLogEntries.seq, data: practiceLogEntries.data })
    .from(practiceLogEntries)
    .where(
      and(
        eq(practiceLogEntries.userId, userId),
        gt(practiceLogEntries.seq, afterSeq),
        lt(practiceLogEntries.receivedAt, sql`now() - make_interval(secs => ${settleMs / 1000})`)
      )
    )
    .orderBy(asc(practiceLogEntries.seq))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    entries: page.map((r) => r.data as PracticeEntry),
    cursor: page.length ? page[page.length - 1].seq : afterSeq,
    hasMore: rows.length > limit,
  };
}
