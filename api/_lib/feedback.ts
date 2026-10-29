import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { ANCHORS, practiceIdsIn } from './rotation.js';

// H11, learning from feedback. After a practice they may say how they feel
// now: more settled, about the same, or less settled. A main practice that
// left someone signed in less settled at least twice in the last 90 days (and
// more often than it left them more settled) weighs less in what Amrita
// chooses for them; one that settled them at least twice weighs more. A hint:
// it never refuses a card. Read from the account's practice log, like G6;
// guests are not covered.

export type Feeling = 'more' | 'same' | 'less';
export const FEELINGS: readonly Feeling[] = ['more', 'same', 'less'];

export const FEEDBACK_DAYS = 90;
export const FEEDBACK_TIMES = 2;
// A long list would crowd the prompt; the strongest signals come first.
const MAX_LISTED = 8;

export interface Feedback {
  less: string[]; // catalog ids, most often "less settled" first
  more: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const feelingOf = (data: any): Feeling | undefined =>
  FEELINGS.includes(data?.feeling) ? (data.feeling as Feeling) : undefined;

// A rating covers every main practice in that session: each pose and the
// breath of a ritual, or the one breath. Anchors are left out.
export function feedbackFrom(
  entries: { localDate: string; kind: string; data: unknown }[],
  breathIdByName: ReadonlyMap<string, string>,
  today: string
): Feedback {
  const since = shift(today, -(FEEDBACK_DAYS - 1));
  const tally = new Map<string, { more: number; less: number }>();
  for (const e of entries) {
    const feeling = feelingOf(e.data);
    if (!feeling || feeling === 'same' || e.localDate < since || e.localDate > today) continue;
    for (const id of new Set(practiceIdsIn(e.kind, e.data, breathIdByName))) {
      if (ANCHORS.has(id)) continue;
      const t = tally.get(id) ?? { more: 0, less: 0 };
      t[feeling] += 1;
      tally.set(id, t);
    }
  }
  const listed = (side: 'more' | 'less') => {
    const other = side === 'more' ? 'less' : 'more';
    return [...tally]
      .filter(([, t]) => t[side] >= FEEDBACK_TIMES && t[side] > t[other])
      .sort((a, b) => b[1][side] - b[1][other] - (a[1][side] - a[1][other]))
      .slice(0, MAX_LISTED)
      .map(([id]) => id);
  };
  return { less: listed('less'), more: listed('more') };
}

export async function practiceFeedback(
  userId: string,
  today: string,
  breathIdByName: ReadonlyMap<string, string>
): Promise<Feedback> {
  const t = schema.practiceLogEntries;
  const rows = await getDb()
    .select({ localDate: t.localDate, kind: t.kind, data: t.data })
    .from(t)
    .where(
      and(eq(t.userId, userId), gte(t.localDate, shift(today, -(FEEDBACK_DAYS - 1))), sql`${t.data} ->> 'feeling' in ('more', 'less')`)
    );
  return feedbackFrom(rows, breathIdByName, today);
}
