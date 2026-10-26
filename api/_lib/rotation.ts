import { and, eq, gte } from 'drizzle-orm';
import { getDb, schema } from './db.js';

// G6, rotation. A main practice someone signed in completed in the last three
// days (today and the two days before, in their own days) is not offered
// again; a short list of anchors may repeat. Read from the account's practice
// log, so it covers practices done on any device. Guests are not covered: their
// log stays on the device.

export const ROTATION_DAYS = 3;

// Child's Pose, Corpse Pose, Easy Pose, Mountain Pose, Three-Part Breath.
export const ANCHORS: ReadonlySet<string> = new Set(['childs_pose', 'corpse_pose', 'easy_pose', 'tadasana', 'dirgha']);

const DAY_MS = 24 * 60 * 60 * 1000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The catalog ids a logged practice included. A ritual names its poses by id
// and its breath by name; a breathwork entry is titled with the breath's name.
export function practiceIdsIn(kind: string, data: any, breathIdByName: ReadonlyMap<string, string>): string[] {
  const breathId = (name: unknown) => (typeof name === 'string' ? breathIdByName.get(name.trim().toLowerCase()) : undefined);
  if (kind === 'breathwork') {
    const id = breathId(data?.title);
    return id ? [id] : [];
  }
  const poses: unknown[] = Array.isArray(data?.result?.yogaPractice?.poses) ? data.result.yogaPractice.poses : [];
  const ids = poses.map((p: any) => p?.poseId).filter((id): id is string => typeof id === 'string');
  const breath = breathId(data?.result?.breathwork?.name);
  return breath ? [...ids, breath] : ids;
}

// The main practices (not anchors) in log entries on or after the window's
// first day, each with the latest local date it was done.
export function recentMainFrom(
  entries: { localDate: string; kind: string; data: unknown }[],
  breathIdByName: ReadonlyMap<string, string>,
  today: string
): Map<string, string> {
  const since = shift(today, -(ROTATION_DAYS - 1));
  const recent = new Map<string, string>();
  for (const e of entries) {
    if (e.localDate < since || e.localDate > today) continue;
    for (const id of practiceIdsIn(e.kind, e.data, breathIdByName)) {
      if (ANCHORS.has(id)) continue;
      if (!recent.has(id) || recent.get(id)! < e.localDate) recent.set(id, e.localDate);
    }
  }
  return recent;
}

export async function recentMainPractices(
  userId: string,
  today: string,
  breathIdByName: ReadonlyMap<string, string>
): Promise<Map<string, string>> {
  const t = schema.practiceLogEntries;
  const rows = await getDb()
    .select({ localDate: t.localDate, kind: t.kind, data: t.data })
    .from(t)
    .where(and(eq(t.userId, userId), gte(t.localDate, shift(today, -(ROTATION_DAYS - 1)))));
  return recentMainFrom(rows, breathIdByName, today);
}
