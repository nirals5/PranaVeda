// When a push nudge may be sent. The same rules as the website's in-app bar
// and tab notifications (src/hooks/useExternalCalendar.ts findOpenSlot,
// src/hooks/useNudgeNotifications.ts) and the apps (FreeTime.swift,
// FreeTime.kt), worked out in the user's own time zone because the server's
// clock is not theirs.

export type Busy = [number, number][]; // [start, end] epoch ms

export const MIN_FREE_MINUTES = 10;
export const WAKING_HOURS = [7, 22] as const;
export const REST_AFTER_PRACTICE_MS = 2 * 60 * 60 * 1000;
export const MIN_GAP_MS = 3 * 60 * 60 * 1000;
export const AWAY_BEFORE_NOTIFY_MS = 15 * 60 * 1000;
// Busy times uploaded by the website stop counting after a day: meetings
// added since would be missed.
export const UPLOAD_FRESH_MS = 24 * 60 * 60 * 1000;

export interface OpenSlot {
  key: string; // one opening = one nudge, keyed by where the opening ends
  until: number | null;
  minutes: number | null;
}

export interface NudgeState {
  busy: Busy | null;
  trusted: boolean;
  google: boolean;
  uploadedAt: number | null;
  coveredUntil: number | null;
  seenAt: number | null;
  lastSlotKey: string | null;
  lastNotifiedAt: number | null;
}

export interface NudgeInput {
  now: number;
  timeZone: string | null;
  lastPracticeAt: number | null;
  state: NudgeState;
  // The account's calendar link read just now: undefined when none is kept
  // there, null when it could not be read.
  linkBusy: Busy | null | undefined;
}

function clock(now: number, timeZone: string): { hour: number; msIntoDay: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const [hour, minute, second] = [get('hour'), get('minute'), get('second')];
    if (![hour, minute, second].every(Number.isFinite)) return null;
    return { hour, msIntoDay: ((hour * 60 + minute) * 60 + second) * 1000 + (now % 1000) };
  } catch {
    return null; // not a zone this server knows
  }
}

export function formatTime(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).replace(/ /g, ' ');
}

export function mergeBusy(busy: Busy): Busy {
  const merged: Busy = [];
  for (const [s, e] of [...busy].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export function openSlotAt(busy: Busy, now: number, lastPracticeAt: number | null, timeZone: string): OpenSlot | null {
  const local = clock(now, timeZone);
  if (!local) return null;
  const merged = mergeBusy(busy);
  if (merged.some(([s, e]) => s <= now && now < e)) return null;
  const next = merged.find(([s]) => s > now);
  const midnight = now - local.msIntoDay + 24 * 60 * 60 * 1000;
  const openUntil = next && next[0] < midnight ? next[0] : null;
  const minutes = openUntil ? Math.floor((openUntil - now) / 60000) : null;
  if (
    local.hour < WAKING_HOURS[0] ||
    local.hour >= WAKING_HOURS[1] ||
    (minutes !== null && minutes < MIN_FREE_MINUTES) ||
    (lastPracticeAt !== null && now - lastPracticeAt < REST_AFTER_PRACTICE_MS)
  ) {
    return null;
  }
  return { key: String(openUntil ?? midnight), until: openUntil, minutes };
}

// The busy times to trust right now, or null to stay quiet. Fail closed: a
// calendar that could not be read means no nudge.
function busyNow({ now, state, linkBusy }: NudgeInput): Busy | null {
  if (!state.trusted || linkBusy === null) return null;
  const uploadFresh =
    state.busy !== null &&
    state.uploadedAt !== null &&
    now - state.uploadedAt < UPLOAD_FRESH_MS &&
    state.coveredUntil !== null &&
    now < state.coveredUntil;
  if (uploadFresh) return [...state.busy!, ...(linkBusy ?? [])];
  // Without fresh uploads, the link read now is enough only when it is the
  // user's only calendar (a Google calendar can only be read by the website).
  if (linkBusy !== undefined && !state.google) return linkBusy;
  return null;
}

// The checks that need no calendar, so the push check can skip reading a
// link for someone who will not be nudged anyway.
export function mayNudge(state: NudgeState, now: number): boolean {
  if (!state.trusted) return false;
  // PranaVeda was on screen recently: the in-app bar is doing the job.
  if (state.seenAt !== null && now - state.seenAt < AWAY_BEFORE_NOTIFY_MS) return false;
  return state.lastNotifiedAt === null || now - state.lastNotifiedAt >= MIN_GAP_MS;
}

export function planNudge(input: NudgeInput): { key: string; body: string } | null {
  const { now, timeZone, lastPracticeAt, state } = input;
  if (!timeZone || !mayNudge(state, now)) return null;
  const busy = busyNow(input);
  if (!busy) return null;
  const slot = openSlotAt(busy, now, lastPracticeAt, timeZone);
  if (!slot) return null;
  if (state.lastSlotKey === slot.key) return null;
  const when =
    slot.minutes !== null && slot.until
      ? `You have ${slot.minutes} open minutes, until ${formatTime(slot.until, timeZone)}.`
      : 'Your calendar is open for the rest of today.';
  return { key: slot.key, body: `${when} A good moment to practice.` };
}
