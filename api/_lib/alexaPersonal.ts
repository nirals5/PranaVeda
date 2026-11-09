import { and, count, eq, gte, max } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { type Personal, freeTimeLine, historyLine } from './alexa.js';
import { rememberAlexaUser, setAlexaNotifications, forgetAlexaUser } from './alexaLinks.js';
import { linkBusyFor, nudgeStateFor, readCalendarLink } from './push.js';
import { busyNow } from './pushRules.js';
import { getUser } from './users.js';

// What a linked skill says about the person, from the database. Loaded only
// for a request from a linked skill, so the rest of api/index.ts never loads
// the database client (api/index.ts).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Alexa answers within 8 seconds; a calendar link that is slow is skipped.
const LINK_WAIT_MS = 2500;

const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export async function personalFor(userId: string, alexaUserId: string | undefined, echoZone: string | undefined, now = Date.now()): Promise<Personal | null> {
  const user = await getUser(userId);
  if (!user) return null;
  if (alexaUserId) await rememberAlexaUser(userId, alexaUserId).catch((err) => console.error('[alexa] link not recorded:', err?.message || err));

  const zone = echoZone ?? user.timezone ?? undefined;
  const { practiceLogEntries } = schema;
  const mine = eq(practiceLogEntries.userId, userId);
  const [state, linkBusy, [last], [week]] = await Promise.all([
    nudgeStateFor(userId),
    within(linkBusyFor(userId, now, readCalendarLink), LINK_WAIT_MS, null),
    getDb().select({ at: max(practiceLogEntries.completedAt) }).from(practiceLogEntries).where(mine),
    getDb().select({ n: count() }).from(practiceLogEntries).where(and(mine, gte(practiceLogEntries.completedAt, new Date(now - WEEK_MS)))),
  ]);
  const lastAt = last?.at ? new Date(last.at).getTime() : null;

  if (!zone) return { name: user.displayName };
  const busy = state ? busyNow({ now, state, linkBusy }) : null;
  return {
    name: user.displayName,
    free: freeTimeLine(busy, now, zone),
    history: historyLine(lastAt, Number(week?.n ?? 0), now, zone),
  };
}

const MESSAGE_ALERT = 'AMAZON.MessageAlert.Activated';

// Amazon's skill events. Notifications follow what the person allowed in the
// Alexa app; disabling the skill forgets the Alexa account.
export async function recordSkillEvent(body: any, userIdFromToken: string | undefined): Promise<void> {
  const type = body?.request?.type;
  const alexaUserId = body?.context?.System?.user?.userId;
  if (typeof alexaUserId !== 'string' || !alexaUserId) return;
  if (type === 'AlexaSkillEvent.SkillDisabled') return forgetAlexaUser(alexaUserId);
  if (type === 'AlexaSkillEvent.ProactiveSubscriptionChanged') {
    const subs = body?.request?.body?.subscriptions;
    const on = Array.isArray(subs) && subs.some((s: any) => s?.eventName === MESSAGE_ALERT);
    if (userIdFromToken) return rememberAlexaUser(userIdFromToken, alexaUserId, on);
    return setAlexaNotifications(alexaUserId, on);
  }
  if (type === 'AlexaSkillEvent.SkillAccountLinked' && userIdFromToken) return rememberAlexaUser(userIdFromToken, alexaUserId);
}
