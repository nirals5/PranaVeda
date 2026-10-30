import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GoogleToken, requestGoogleToken, revokeGoogleToken } from './googleAuth';

// The user's outside calendar, reduced to busy intervals. Two sources:
//  - Google sign-in: a read-only free/busy token held in this tab only.
//  - Private iCal link: kept on-device, read through /api/calendar/ics.
// Either way only busy TIMES reach the app — never event details — and
// nothing is stored on the server.

export interface BusyInterval {
  start: number; // epoch ms
  end: number;
}

// What Amrita is told, pre-formatted in the user's own timezone.
export interface CalendarContext {
  now: string;
  busyToday: string[];
  busyTomorrow: string[];
}

const CONNECTIONS_KEY = 'pranaveda_calendar_connections';
const GOOGLE_TOKEN_KEY = 'pranaveda_google_token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
const REFRESH_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Connections {
  google?: boolean;
  icsUrl?: string;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function mergeIntervals(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: BusyInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

// Where `now` falls: inside a commitment (until = when it ends) or in open
// time (until = when the next commitment starts, null if none is in view).
export function freeWindow(busy: BusyInterval[], now: number): { busyNow: boolean; until: number | null } {
  const current = busy.find((b) => b.start <= now && now < b.end);
  if (current) return { busyNow: true, until: current.end };
  const next = busy.find((b) => b.start > now);
  return { busyNow: false, until: next ? next.start : null };
}

export interface OpenSlot {
  key: string; // one opening = one nudge, keyed by where the opening ends
  until: number | null; // when the next commitment starts; null = open all day
  minutes: number | null;
}

const MIN_FREE_MINUTES = 10;
const WAKING_HOURS = [7, 22] as const;
const REST_AFTER_PRACTICE_MS = 2 * 60 * 60 * 1000;

// The opening Amrita may nudge in right now, if any. Shared by the in-app bar
// and browser notifications so both obey the same rule: never during a
// commitment, in a gap too short to practice, outside waking hours, or right
// after a practice.
export function findOpenSlot(busy: BusyInterval[], now: number, lastPracticeAt: number | null): OpenSlot | null {
  const { busyNow, until } = freeWindow(busy, now);
  const hour = new Date(now).getHours();
  const midnight = new Date(now).setHours(24, 0, 0, 0);
  const openUntil = until !== null && until < midnight ? until : null;
  const minutes = openUntil ? Math.floor((openUntil - now) / 60000) : null;
  if (
    busyNow ||
    hour < WAKING_HOURS[0] ||
    hour >= WAKING_HOURS[1] ||
    (minutes !== null && minutes < MIN_FREE_MINUTES) ||
    (lastPracticeAt !== null && now - lastPracticeAt < REST_AFTER_PRACTICE_MS)
  ) {
    return null;
  }
  return { key: String(openUntil ?? midnight), until: openUntil, minutes };
}

export function describeOpenSlot(slot: OpenSlot): string {
  return slot.minutes !== null && slot.until
    ? `You have ${slot.minutes} open minutes, until ${formatTime(slot.until)}.`
    : 'Your calendar is open for the rest of today.';
}

export function describeCalendar(busy: BusyInterval[], now: number): CalendarContext {
  const today = startOfDay(now);
  const tomorrow = today + DAY_MS;
  const { busyNow, until } = freeWindow(busy, now);
  const range = (b: BusyInterval) => `${formatTime(b.start)}–${formatTime(b.end)}`;
  return {
    now: busyNow
      ? `In a commitment until ${formatTime(until!)}`
      : until && until < tomorrow
        ? `Free for about ${Math.round((until - now) / 60000)} minutes, until ${formatTime(until)}`
        : 'Free for the rest of today',
    busyToday: busy.filter((b) => b.end > now && b.start < tomorrow).map(range),
    busyTomorrow: busy.filter((b) => b.start >= tomorrow && b.start < tomorrow + DAY_MS).map(range),
  };
}

function loadJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function toIntervals(list: unknown): BusyInterval[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((b: any) => ({ start: Date.parse(b?.start), end: Date.parse(b?.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
}

class GoogleAuthExpired extends Error {}

async function fetchGoogleBusy(token: string, timeMin: number, timeMax: number): Promise<BusyInterval[]> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  if (response.status === 401 || response.status === 403) throw new GoogleAuthExpired();
  if (!response.ok) throw new Error('Google Calendar could not be read just now.');
  const data = await response.json();
  return toIntervals(data?.calendars?.primary?.busy);
}

async function fetchIcsBusy(url: string, timeMin: number, timeMax: number): Promise<BusyInterval[]> {
  const response = await fetch('/api/calendar/ics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'The calendar link could not be read just now.');
  return toIntervals(data?.busy);
}

export function useExternalCalendar() {
  const [connections, setConnections] = useState<Connections>(() => loadJson<Connections>(localStorage, CONNECTIONS_KEY, {}));
  const [googleBusy, setGoogleBusy] = useState<BusyInterval[]>([]);
  const [icsBusy, setIcsBusy] = useState<BusyInterval[]>([]);
  // Google's browser tokens last about an hour and cannot renew silently.
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false);
  const [errors, setErrors] = useState<{ google?: string; ics?: string }>({});
  const [pending, setPending] = useState<'google' | 'ics' | null>(null);
  const [synced, setSynced] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;

  useEffect(() => {
    try {
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
    } catch {}
  }, [connections]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Today and tomorrow, in the user's timezone.
  const windowBounds = () => {
    const from = startOfDay(Date.now());
    return [from, from + 2 * DAY_MS] as const;
  };

  const refresh = useCallback(async () => {
    const current = connectionsRef.current;
    const [from, to] = windowBounds();

    if (current.icsUrl) {
      try {
        setIcsBusy(await fetchIcsBusy(current.icsUrl, from, to));
        setErrors((e) => ({ ...e, ics: undefined }));
      } catch (err: any) {
        setErrors((e) => ({ ...e, ics: err?.message }));
      }
    }

    if (current.google) {
      const stored = loadJson<GoogleToken | null>(sessionStorage, GOOGLE_TOKEN_KEY, null);
      if (!stored || stored.expiresAt - Date.now() < 60 * 1000) {
        setGoogleBusy([]);
        setGoogleNeedsReconnect(true);
      } else {
        try {
          setGoogleBusy(await fetchGoogleBusy(stored.token, from, to));
          setGoogleNeedsReconnect(false);
          setErrors((e) => ({ ...e, google: undefined }));
        } catch (err: any) {
          if (err instanceof GoogleAuthExpired) {
            setGoogleBusy([]);
            setGoogleNeedsReconnect(true);
          } else {
            setErrors((e) => ({ ...e, google: err?.message }));
          }
        }
      }
    }
    setSynced(true);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const connectGoogle = useCallback(async () => {
    setPending('google');
    setErrors((e) => ({ ...e, google: undefined }));
    try {
      const token = await requestGoogleToken(GOOGLE_SCOPE);
      const [from, to] = windowBounds();
      setGoogleBusy(await fetchGoogleBusy(token.token, from, to));
      try {
        sessionStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(token));
      } catch {}
      setGoogleNeedsReconnect(false);
      setConnections((c) => ({ ...c, google: true }));
      setSynced(true);
    } catch (err: any) {
      setErrors((e) => ({
        ...e,
        google: err instanceof GoogleAuthExpired ? 'Google did not grant calendar access.' : err?.message,
      }));
    } finally {
      setPending(null);
    }
  }, []);

  const disconnectGoogle = useCallback(() => {
    const stored = loadJson<GoogleToken | null>(sessionStorage, GOOGLE_TOKEN_KEY, null);
    if (stored) revokeGoogleToken(stored.token);
    try {
      sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
    } catch {}
    setGoogleBusy([]);
    setGoogleNeedsReconnect(false);
    setErrors((e) => ({ ...e, google: undefined }));
    setConnections((c) => ({ ...c, google: undefined }));
  }, []);

  // Saves the link only once the server has read a calendar from it.
  const connectIcs = useCallback(async (url: string): Promise<boolean> => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    setPending('ics');
    setErrors((e) => ({ ...e, ics: undefined }));
    try {
      const [from, to] = windowBounds();
      setIcsBusy(await fetchIcsBusy(trimmed, from, to));
      setConnections((c) => ({ ...c, icsUrl: trimmed }));
      setSynced(true);
      return true;
    } catch (err: any) {
      setErrors((e) => ({ ...e, ics: err?.message }));
      return false;
    } finally {
      setPending(null);
    }
  }, []);

  const disconnectIcs = useCallback(() => {
    setIcsBusy([]);
    setErrors((e) => ({ ...e, ics: undefined }));
    setConnections((c) => ({ ...c, icsUrl: undefined }));
  }, []);

  // The account's link, when it is kept there (useConnectionsSync). Read
  // straight away; a link that no longer works shows its error as usual.
  const adoptIcsUrl = useCallback((url: string | undefined) => {
    if (connectionsRef.current.icsUrl === url) return;
    if (!url) setIcsBusy([]);
    setErrors((e) => ({ ...e, ics: undefined }));
    connectionsRef.current = { ...connectionsRef.current, icsUrl: url };
    setConnections(connectionsRef.current);
    if (url) refresh();
  }, [refresh]);

  // Fail closed: free time is only trusted when EVERY connected calendar has
  // been read. If one has lapsed or errored, Amrita stays quiet rather than
  // nudge into a commitment she cannot see.
  const googleStale = !!connections.google && (googleNeedsReconnect || !!errors.google);
  const icsStale = !!connections.icsUrl && !!errors.ics;
  const connected = synced && (!!connections.google || !!connections.icsUrl) && !googleStale && !icsStale;
  const busy = useMemo(() => mergeIntervals([...googleBusy, ...icsBusy]), [googleBusy, icsBusy]);

  return {
    googleConfigured: !!GOOGLE_CLIENT_ID,
    googleConnected: !!connections.google,
    googleNeedsReconnect,
    icsConnected: !!connections.icsUrl,
    icsUrl: connections.icsUrl,
    connected,
    busy,
    now,
    errors,
    pending,
    connectGoogle,
    disconnectGoogle,
    connectIcs,
    disconnectIcs,
    adoptIcsUrl,
  };
}

export type ExternalCalendar = ReturnType<typeof useExternalCalendar>;
