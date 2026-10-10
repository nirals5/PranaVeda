import { useCallback, useEffect, useRef, useState } from 'react';
import { HealthDay, PracticeLogEntry } from '../types';
import { GOOGLE_CLIENT_ID, GoogleToken, requestGoogleToken, revokeGoogleToken } from './googleAuth';
import { localDateKey } from './usePracticeLog';

// Daily sleep, resting heart rate and HRV from the Google Health API — the
// successor to the Fitbit Web API, carrying Fitbit and Pixel Watch data.
// Read-only, fetched straight from the browser, and cached on-device so the
// trends stay visible after Google's hourly access lapses.

const CONNECTED_KEY = 'pranaveda_health_connected';
const TOKEN_KEY = 'pranaveda_google_health_token';
const DAYS_KEY = 'pranaveda_health_days';
const SCOPE = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
].join(' ');
const API = 'https://health.googleapis.com/v4/users/me/dataTypes';
const HISTORY_DAYS = 14;
const KEEP_DAYS = 90;

class HealthAuthExpired extends Error {}

function loadJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Google's civil Date message: { year, month, day }.
function civilKey(date: any): string | null {
  if (!date?.year || !date?.month || !date?.day) return null;
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

async function listDataPoints(token: string, dataType: string, filter: string): Promise<any[]> {
  const points: any[] = [];
  let pageToken = '';
  // Two weeks of daily values fits in a page or two; the cap is a backstop.
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ filter });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`${API}/${dataType}/dataPoints?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) throw new HealthAuthExpired();
    if (!response.ok) throw new Error(`Google Health ${dataType} ${response.status}`);
    const data = await response.json();
    points.push(...(data?.dataPoints ?? []));
    pageToken = data?.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return points;
}

async function fetchHealthDays(token: string): Promise<HealthDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - HISTORY_DAYS);
  const from = localDateKey(since);
  const days = new Map<string, HealthDay>();
  const day = (key: string) => {
    if (!days.has(key)) days.set(key, { date: key });
    return days.get(key)!;
  };

  // Each type is read independently: a user may have granted only some
  // scopes, or own a device that records only some of these.
  const [resting, variability, sleep] = await Promise.allSettled([
    listDataPoints(token, 'daily-resting-heart-rate', `dailyRestingHeartRate.date >= "${from}"`),
    listDataPoints(token, 'daily-heart-rate-variability', `dailyHeartRateVariability.date >= "${from}"`),
    listDataPoints(token, 'sleep', `sleep.interval.civil_end_time >= "${from}"`),
  ]);
  const results = [resting, variability, sleep];
  if (results.some((r) => r.status === 'rejected' && r.reason instanceof HealthAuthExpired)) throw new HealthAuthExpired();
  if (results.every((r) => r.status === 'rejected')) throw new Error('Google Health could not be read just now.');

  if (resting.status === 'fulfilled') {
    for (const point of resting.value) {
      const key = civilKey(point?.dailyRestingHeartRate?.date);
      const value = Number(point?.dailyRestingHeartRate?.beatsPerMinute);
      if (key && value > 0) day(key).restingHeartRate = Math.round(value);
    }
  }
  if (variability.status === 'fulfilled') {
    for (const point of variability.value) {
      const key = civilKey(point?.dailyHeartRateVariability?.date);
      const value = Number(point?.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds);
      if (key && value > 0) day(key).hrv = Math.round(value);
    }
  }
  if (sleep.status === 'fulfilled') {
    for (const point of sleep.value) {
      // A night belongs to the morning it ends on; naps are left out.
      const key = civilKey(point?.sleep?.interval?.civilEndTime?.date);
      const minutes = Number(point?.sleep?.summary?.minutesAsleep);
      if (!key || !(minutes > 0) || point?.sleep?.metadata?.nap) continue;
      day(key).sleepMinutes = Math.max(day(key).sleepMinutes ?? 0, Math.round(minutes));
    }
  }
  return [...days.values()];
}

function mergeDays(existing: HealthDay[], fresh: HealthDay[]): HealthDay[] {
  const byDate = new Map(existing.map((d) => [d.date, d]));
  for (const d of fresh) byDate.set(d.date, { ...byDate.get(d.date), ...d });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-KEEP_DAYS);
}

export function useWearableHealth() {
  const [connected, setConnected] = useState<boolean>(() => loadJson(localStorage, CONNECTED_KEY, false));
  const [days, setDays] = useState<HealthDay[]>(() => loadJson<HealthDay[]>(localStorage, DAYS_KEY, []));
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  useEffect(() => {
    try {
      localStorage.setItem(DAYS_KEY, JSON.stringify(days));
    } catch {}
  }, [days]);

  const sync = useCallback(async (token: string) => {
    const fresh = await fetchHealthDays(token);
    setDays((prev) => mergeDays(prev, fresh));
    setNeedsReconnect(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!connectedRef.current) return;
    const stored = loadJson<GoogleToken | null>(sessionStorage, TOKEN_KEY, null);
    if (!stored || stored.expiresAt - Date.now() < 60 * 1000) {
      setNeedsReconnect(true);
      return;
    }
    sync(stored.token).catch((err) => {
      if (err instanceof HealthAuthExpired) setNeedsReconnect(true);
      else setError(err?.message);
    });
  }, [sync]);

  const connect = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const token = await requestGoogleToken(SCOPE);
      await sync(token.token);
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        localStorage.setItem(CONNECTED_KEY, 'true');
      } catch {}
      setConnected(true);
    } catch (err: any) {
      setError(err instanceof HealthAuthExpired ? 'Google did not grant access to your health data.' : err?.message);
    } finally {
      setPending(false);
    }
  }, [sync]);

  // Disconnecting also clears the readings already saved on this device.
  const disconnect = useCallback(() => {
    const stored = loadJson<GoogleToken | null>(sessionStorage, TOKEN_KEY, null);
    if (stored) revokeGoogleToken(stored.token);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CONNECTED_KEY);
    } catch {}
    setConnected(false);
    setNeedsReconnect(false);
    setError(null);
    setDays([]);
  }, []);

  return { configured: !!GOOGLE_CLIENT_ID, connected, needsReconnect, pending, error, days, connect, disconnect };
}

export type WearableHealth = ReturnType<typeof useWearableHealth>;

// --- What Amrita is told ---

export interface HealthContext {
  live?: { bpm: number; hrv?: number };
  lastPractice?: { title: string; startBpm: number; endBpm: number; daysAgo: number };
  restingHeartRate?: { latest: number; usual: number };
  hrv?: { latest: number; usual: number };
  sleep?: { lastNightMinutes: number; usualMinutes: number };
}

// Latest value against the person's own recent norm: the comparison is what
// carries meaning, since healthy ranges differ widely between people.
function latestVsUsual(days: HealthDay[], pick: (d: HealthDay) => number | undefined, today: string) {
  const recent = days.filter((d) => pick(d) !== undefined && d.date <= today).slice(-HISTORY_DAYS);
  const latest = recent[recent.length - 1];
  // "Latest" has to be fresh (today or yesterday) to describe how they are now.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (!latest || recent.length < 4 || latest.date < localDateKey(yesterday)) return undefined;
  const earlier = recent.slice(0, -1).map((d) => pick(d)!);
  return { latest: pick(latest)!, usual: Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length) };
}

export function buildHealthContext(
  days: HealthDay[],
  practiceLog: PracticeLogEntry[],
  live: { bpm: number | null; hrv: number | null }
): HealthContext | null {
  const today = localDateKey(new Date());
  const context: HealthContext = {};
  if (live.bpm) context.live = { bpm: live.bpm, hrv: live.hrv ?? undefined };

  const lastWithHeart = [...practiceLog].reverse().find((e) => e.heart);
  if (lastWithHeart?.heart) {
    const daysAgo = Math.round((Date.now() - Date.parse(lastWithHeart.completedAt)) / (24 * 60 * 60 * 1000));
    if (daysAgo <= 7) {
      context.lastPractice = { title: lastWithHeart.title, startBpm: lastWithHeart.heart.startBpm, endBpm: lastWithHeart.heart.endBpm, daysAgo };
    }
  }

  context.restingHeartRate = latestVsUsual(days, (d) => d.restingHeartRate, today);
  context.hrv = latestVsUsual(days, (d) => d.hrv, today);
  const sleep = latestVsUsual(days, (d) => d.sleepMinutes, today);
  if (sleep) context.sleep = { lastNightMinutes: sleep.latest, usualMinutes: sleep.usual };

  return Object.values(context).some(Boolean) ? context : null;
}
