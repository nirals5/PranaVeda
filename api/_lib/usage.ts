import { lt, sql } from 'drizzle-orm';
import { getDb, schema } from './db.js';

// Usage counts (KAN-32): how PranaVeda is used, counted per install. Counts,
// never content, and never the account: nothing here can be tied to a person.
// Sent only while "Share anonymous usage counts" is on.

const { usageEvents } = schema;

export const USAGE_EVENTS = ['app_open', 'chat_sent', 'practice_started', 'practice_finished', 'nudge_opened'] as const;
export type UsageEventName = (typeof USAGE_EVENTS)[number];
export const PLATFORMS = ['web', 'ios', 'android'] as const;
export const MAX_BATCH = 50;
// Thirteen months, so a year can be compared with the one before.
export const RETENTION_DAYS = 396;

const DAY_MS = 24 * 60 * 60 * 1000;
// Queued on a device that was offline for a while, but not older than this.
const OLDEST_MS = 7 * DAY_MS;
// A device clock a little ahead.
const AHEAD_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^[0-9A-Za-z.()+ -]{1,32}$/;

export interface UsageEvent {
  name: UsageEventName;
  at: Date;
  signedIn: boolean;
}

export interface UsageBatch {
  installId: string;
  platform: (typeof PLATFORMS)[number];
  appVersion: string;
  events: UsageEvent[];
}

const onlyKeys = (value: object, keys: string[]) => Object.keys(value).every((k) => keys.includes(k));

// Exactly these fields and nothing else, so no text, id or place can ride along.
export function parseUsageBatch(raw: unknown, now = Date.now()): UsageBatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!onlyKeys(raw, ['installId', 'platform', 'appVersion', 'events'])) return null;
  const { installId, platform, appVersion, events } = raw as Record<string, unknown>;
  if (typeof installId !== 'string' || !UUID.test(installId.toLowerCase())) return null;
  if (!PLATFORMS.includes(platform as UsageBatch['platform'])) return null;
  if (typeof appVersion !== 'string' || !VERSION.test(appVersion) || /[<>]/.test(appVersion)) return null;
  if (!Array.isArray(events) || events.length < 1 || events.length > MAX_BATCH) return null;
  const parsed: UsageEvent[] = [];
  for (const e of events) {
    if (!e || typeof e !== 'object' || Array.isArray(e) || !onlyKeys(e, ['name', 'at', 'signedIn'])) return null;
    const { name, at, signedIn } = e as Record<string, unknown>;
    if (!USAGE_EVENTS.includes(name as UsageEventName)) return null;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < now - OLDEST_MS || at > now + AHEAD_MS) return null;
    if (typeof signedIn !== 'boolean') return null;
    parsed.push({ name: name as UsageEventName, at: new Date(at), signedIn });
  }
  return { installId: installId.toLowerCase(), platform: platform as UsageBatch['platform'], appVersion, events: parsed };
}

export async function saveUsage(batch: UsageBatch): Promise<void> {
  await getDb()
    .insert(usageEvents)
    .values(batch.events.map((e) => ({ installId: batch.installId, platform: batch.platform, appVersion: batch.appVersion, name: e.name, signedIn: e.signedIn, occurredAt: e.at })));
}

export async function pruneUsage(now = new Date()): Promise<void> {
  await getDb().delete(usageEvents).where(lt(usageEvents.occurredAt, new Date(now.getTime() - RETENTION_DAYS * DAY_MS)));
}

export interface UsageSummary {
  installs: { platform: string; signedIn: boolean; last7: number; last30: number }[];
  events: { name: string; last7: number; last30: number }[];
}

// For `npm run usage:summary`: installs seen, by platform and signed in or
// not, and how often each event happened, over the last 7 and 30 days.
export async function usageSummary(now = new Date()): Promise<UsageSummary> {
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const month = new Date(now.getTime() - 30 * DAY_MS);
  const db = getDb();
  const installs = await db
    .select({
      platform: usageEvents.platform,
      signedIn: usageEvents.signedIn,
      last7: sql<number>`count(distinct ${usageEvents.installId}) filter (where ${usageEvents.occurredAt} >= ${week})`.mapWith(Number),
      last30: sql<number>`count(distinct ${usageEvents.installId})`.mapWith(Number),
    })
    .from(usageEvents)
    .where(sql`${usageEvents.occurredAt} >= ${month}`)
    .groupBy(usageEvents.platform, usageEvents.signedIn)
    .orderBy(usageEvents.platform, usageEvents.signedIn);
  const events = await db
    .select({
      name: usageEvents.name,
      last7: sql<number>`count(*) filter (where ${usageEvents.occurredAt} >= ${week})`.mapWith(Number),
      last30: sql<number>`count(*)`.mapWith(Number),
    })
    .from(usageEvents)
    .where(sql`${usageEvents.occurredAt} >= ${month}`)
    .groupBy(usageEvents.name)
    .orderBy(usageEvents.name);
  return { installs, events };
}
