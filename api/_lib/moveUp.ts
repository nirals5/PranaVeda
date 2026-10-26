import { and, eq, gte } from 'drizzle-orm';
import { getDb, schema } from './db.js';

// Suggesting a move up in experience (after G2). When someone signed in has
// practised steadily, Amrita may offer once — at most every OFFER_GAP_DAYS —
// to move them up a level. She changes it only if they say yes. Counted from
// completed practices (the practice log), not from what Amrita offered.

export interface MoveUp {
  from: 'beginner' | 'regular';
  to: 'regular' | 'experienced';
  practices: number;
  days: number; // different days practised
  activeWeeks: number; // different weeks with practice
  window: number; // weeks looked back
}

const RULES = {
  beginner: { to: 'regular', windowWeeks: 6, practices: 10, distinctWeeks: 3 },
  regular: { to: 'experienced', windowWeeks: 8, practices: 24, distinctWeeks: 6 },
} as const;

export const OFFER_GAP_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
// Whole days between two YYYY-MM-DD dates (b - a).
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

// `dates` are the local dates of completed practices (one per practice);
// `today` and `offeredOn` are YYYY-MM-DD in the user's own timezone.
export function moveUpFor(experience: unknown, dates: string[], today: string, offeredOn?: string): MoveUp | null {
  if (experience !== 'beginner' && experience !== 'regular') return null;
  if (offeredOn && daysBetween(offeredOn, today) < OFFER_GAP_DAYS) return null;
  const rule = RULES[experience];
  const recent = dates.filter((d) => {
    const ago = daysBetween(d, today);
    return ago >= 0 && ago < rule.windowWeeks * 7;
  });
  const weeks = new Set(recent.map((d) => Math.floor(daysBetween(d, today) / 7)));
  if (recent.length < rule.practices || weeks.size < rule.distinctWeeks) return null;
  return { from: experience, to: rule.to, practices: recent.length, days: new Set(recent).size, activeWeeks: weeks.size, window: rule.windowWeeks };
}

// The local dates of the user's completed practices in the longest window any rule uses.
export async function recentPracticeDates(userId: string, today: string): Promise<string[]> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - RULES.regular.windowWeeks * 7 * DAY_MS).toISOString().slice(0, 10);
  const { practiceLogEntries } = schema;
  const rows = await getDb()
    .select({ localDate: practiceLogEntries.localDate })
    .from(practiceLogEntries)
    .where(and(eq(practiceLogEntries.userId, userId), gte(practiceLogEntries.localDate, since)));
  return rows.map((r) => r.localDate);
}

// What Amrita is told when a move up may be offered.
export function moveUpPrompt(m: MoveUp): string {
  const what =
    m.to === 'experienced'
      ? 'whether they feel ready to call themselves "experienced", which opens the practices marked for experienced practitioners (strong balances and backbends) — be honest that these ask more of the body'
      : 'whether they would now call themselves a "regular" practitioner. Moving to "regular" opens nothing new: only "experienced" opens the practices marked for experienced practitioners, so do not promise them';
  const weeks = m.activeWeeks === 1 ? 'one week' : `${m.activeWeeks} different weeks`;
  return `\n# Moving up\n\nIn the last ${m.window} weeks they have completed ${m.practices} practices, on ${m.days} different days in ${weeks}, and their experience is "${m.from}". In this conversation, at a natural moment (early is fine — a warm opening works well), acknowledge their steadiness and ask, once, ${what}. Skip it only if they are having a hard time, or mention feeling unwell or injured. Change their experience only if they say yes. As soon as you have asked, call update_wellness_profile with markExperienceOffered: true (whatever they answer), so it is not asked again for a while.\n`;
}
