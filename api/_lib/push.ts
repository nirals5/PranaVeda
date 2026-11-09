import webpush from 'web-push';
import { eq, inArray, max, and } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { ConnectionsUnavailable, loadConnections } from './connections.js';
import { CalendarLinkError, fetchCalendarText, icsBusyIntervals } from './calendar.js';
import { type Busy, type NudgeState, mayNudge, planNudge } from './pushRules.js';
import { sendAlexaNudge } from './alexaEvents.js';

// Push nudges: storing who turned them on, what the check needs between
// visits, and the check itself (run every 15 minutes, see api/push.ts).

const { pushSubscriptions, pushNudgeState, users, practiceLogEntries, alexaLinks } = schema;

const MAX_ENDPOINT = 1024;
const MAX_KEY = 256;
const MAX_BUSY = 200;
const LINK_LOOKAHEAD_MS = 36 * 60 * 60 * 1000;
// A nudge that arrives late is worse than none.
const TTL_SECONDS = 15 * 60;

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapid(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || 'https://pranaveda.app' };
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const base64url = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);

// A browser's PushSubscription, as its toJSON() gives it.
export function parseSubscription(raw: unknown): PushSub | null {
  const { endpoint, keys } = (raw ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT) return null;
  try {
    if (new URL(endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (!base64url(keys?.p256dh, MAX_KEY) || !base64url(keys?.auth, MAX_KEY)) return null;
  return { endpoint, p256dh: keys!.p256dh as string, auth: keys!.auth as string };
}

export interface CalendarUpload {
  trusted: boolean;
  google: boolean;
  busy: Busy | null;
  coveredUntil: number | null;
}

// What the website sends about its calendars: busy start and end times only.
// An untrusted upload (no calendar, or one that could not be read) carries none.
export function parseCalendarUpload(raw: unknown): CalendarUpload | null {
  const { trusted, google, busy, coveredUntil } = (raw ?? {}) as Record<string, unknown>;
  if (typeof trusted !== 'boolean' || typeof google !== 'boolean') return null;
  if (!trusted) return { trusted, google, busy: null, coveredUntil: null };
  if (!Array.isArray(busy) || busy.length > MAX_BUSY || typeof coveredUntil !== 'number' || !Number.isFinite(coveredUntil)) return null;
  const intervals: Busy = [];
  for (const b of busy) {
    if (!Array.isArray(b) || b.length !== 2) return null;
    const [s, e] = b;
    if (typeof s !== 'number' || typeof e !== 'number' || !Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    intervals.push([s, e]);
  }
  return { trusted, google, busy: intervals, coveredUntil };
}

export async function saveSubscription(userId: string, sub: PushSub): Promise<void> {
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId, ...sub })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await getDb().delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function recordState(userId: string, update: { seen?: boolean; calendar?: CalendarUpload }, now = new Date()): Promise<void> {
  const set: Partial<typeof pushNudgeState.$inferInsert> = {};
  if (update.seen) set.seenAt = now;
  if (update.calendar) {
    const c = update.calendar;
    Object.assign(set, {
      trusted: c.trusted,
      google: c.google,
      busy: c.busy,
      coveredUntil: c.coveredUntil === null ? null : new Date(c.coveredUntil),
      uploadedAt: now,
    });
  }
  if (!Object.keys(set).length) return;
  await getDb()
    .insert(pushNudgeState)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: pushNudgeState.userId, set });
}

export type SendResult = 'ok' | 'gone' | 'failed';
export type Sender = (sub: PushSub, payload: string) => Promise<SendResult>;
export type LinkReader = (link: string, from: number, to: number) => Promise<Busy>;
export type AlexaSender = (alexaUserId: string, slotKey: string, now: number) => Promise<SendResult>;

export const webPushSender: Sender = async (sub, payload) => {
  const keys = vapid();
  if (!keys) return 'failed';
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      TTL: TTL_SECONDS,
      vapidDetails: keys,
    });
    return 'ok';
  } catch (err: any) {
    // The browser unsubscribed, or the user cleared the site's data.
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'gone';
    console.error('[push] send failed:', err?.statusCode || err?.message || err);
    return 'failed';
  }
};

export const readCalendarLink: LinkReader = async (link, from, to) => {
  const text = await fetchCalendarText(link);
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new CalendarLinkError('not a calendar');
  return icsBusyIntervals(text, new Date(from), new Date(to)).map((b) => [Date.parse(b.start), Date.parse(b.end)] as [number, number]);
};

const ms = (d: Date | null) => (d ? d.getTime() : null);

export function nudgeStateOf(row: typeof pushNudgeState.$inferSelect): NudgeState {
  return {
    busy: row.busy ?? null,
    trusted: row.trusted,
    google: row.google,
    uploadedAt: ms(row.uploadedAt),
    coveredUntil: ms(row.coveredUntil),
    seenAt: ms(row.seenAt),
    lastSlotKey: row.lastSlotKey,
    lastNotifiedAt: ms(row.lastNotifiedAt),
  };
}

export async function nudgeStateFor(userId: string): Promise<NudgeState | null> {
  const [row] = await getDb().select().from(pushNudgeState).where(eq(pushNudgeState.userId, userId)).limit(1);
  return row ? nudgeStateOf(row) : null;
}

// The account's calendar link read now: undefined when none is kept there,
// null when it could not be read.
export async function linkBusyFor(userId: string, now: number, readLink: LinkReader): Promise<Busy | null | undefined> {
  let link: string | undefined;
  try {
    link = (await loadConnections(userId))?.connections.calendarLink;
  } catch (err) {
    if (err instanceof ConnectionsUnavailable) return undefined;
    throw err;
  }
  if (!link) return undefined;
  try {
    return await readLink(link, now, now + LINK_LOOKAHEAD_MS);
  } catch {
    return null;
  }
}

export interface TickResult {
  users: number;
  sent: number;
  removed: number;
}

// One pass over everyone with push or Alexa notifications turned on. One
// opening is one nudge, whichever way it reaches the person.
export async function runTick({
  now = Date.now(),
  send = webPushSender,
  readLink = readCalendarLink,
  sendAlexa = sendAlexaNudge,
}: { now?: number; send?: Sender; readLink?: LinkReader; sendAlexa?: AlexaSender } = {}): Promise<TickResult> {
  const db = getDb();
  const result: TickResult = { users: 0, sent: 0, removed: 0 };
  const [subs, speakers] = await Promise.all([
    db.select().from(pushSubscriptions),
    db.select({ userId: alexaLinks.userId, alexaUserId: alexaLinks.alexaUserId }).from(alexaLinks).where(eq(alexaLinks.notifications, true)),
  ]);
  if (!subs.length && !speakers.length) return result;

  const byUser = new Map<string, PushSub[]>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }]);
  const alexaOf = new Map(speakers.map((s) => [s.userId, s.alexaUserId]));
  for (const id of alexaOf.keys()) if (!byUser.has(id)) byUser.set(id, []);
  const ids = [...byUser.keys()];

  const [states, people, practices] = await Promise.all([
    db.select().from(pushNudgeState).where(inArray(pushNudgeState.userId, ids)),
    db.select({ id: users.id, timezone: users.timezone, deletedAt: users.deletedAt }).from(users).where(inArray(users.id, ids)),
    db
      .select({ userId: practiceLogEntries.userId, at: max(practiceLogEntries.completedAt) })
      .from(practiceLogEntries)
      .where(inArray(practiceLogEntries.userId, ids))
      .groupBy(practiceLogEntries.userId),
  ]);
  const stateOf = new Map(states.map((s) => [s.userId, s]));
  const personOf = new Map(people.map((p) => [p.id, p]));
  const lastPracticeOf = new Map(practices.map((p) => [p.userId, p.at ? new Date(p.at).getTime() : null]));

  for (const [userId, userSubs] of byUser) {
    result.users++;
    const row = stateOf.get(userId);
    const person = personOf.get(userId);
    if (!row || !person || person.deletedAt) continue;
    const state = nudgeStateOf(row);
    if (!mayNudge(state, now)) continue;

    const plan = planNudge({
      now,
      timeZone: person.timezone,
      lastPracticeAt: lastPracticeOf.get(userId) ?? null,
      state,
      linkBusy: await linkBusyFor(userId, now, readLink),
    });
    if (!plan) continue;

    const payload = JSON.stringify({ title: 'Amrita', body: plan.body, url: '/?nudge=1', tag: 'pranaveda-nudge' });
    let delivered = false;
    const web: SendResult[] = [];
    for (const sub of userSubs) {
      const outcome = await send(sub, payload);
      web.push(outcome);
      if (outcome === 'ok') delivered = true;
      if (outcome === 'gone') {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        result.removed++;
      }
    }
    const alexaUserId = alexaOf.get(userId);
    let alexa: SendResult | 'off' = 'off';
    if (alexaUserId) {
      const outcome = (alexa = await sendAlexa(alexaUserId, plan.key, now));
      if (outcome === 'ok') delivered = true;
      // Turned off in the Alexa app.
      if (outcome === 'gone') await db.update(alexaLinks).set({ notifications: false }).where(eq(alexaLinks.userId, userId));
    }
    // Per channel, so a nudge that reached no one is visible (no ids).
    console.info(`[push] nudge: web ${web.join(',') || 'none'}; alexa ${alexa}`);
    if (delivered) {
      result.sent++;
      await db.update(pushNudgeState).set({ lastSlotKey: plan.key, lastNotifiedAt: new Date(now) }).where(eq(pushNudgeState.userId, userId));
    }
  }
  return result;
}
