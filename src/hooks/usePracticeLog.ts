import { useCallback, useEffect, useMemo, useState } from 'react';
import { PracticeLogEntry } from '../types';

const LOG_KEY = 'pranaveda_practice_log';
const MAX_ENTRIES = 500;
// Ritual snapshots are a few KB each; only the most recent entries keep theirs
// so the log stays well inside localStorage's quota.
const MAX_SNAPSHOTS = 40;

// Calendar day in the user's own timezone. Never derive this from
// toISOString(): that is UTC, and files an evening practice under tomorrow.
export function localDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Consecutive days with at least one practice. A streak stays alive through
// today until the day ends, so it counts back from yesterday when today is
// still open.
export function currentStreak(entries: PracticeLogEntry[], today = new Date()): number {
  const days = new Set(entries.map((e) => e.localDate));
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function trimLog(entries: PracticeLogEntry[]): PracticeLogEntry[] {
  const kept = entries.slice(-MAX_ENTRIES);
  const snapshotFrom = kept.length - MAX_SNAPSHOTS;
  return kept.map((e, i) => (i < snapshotFrom && e.result ? { ...e, result: undefined } : e));
}

function loadLog(): PracticeLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type NewPracticeLogEntry = Pick<PracticeLogEntry, 'kind' | 'title' | 'durationMinutes' | 'result' | 'heart'>;

// Entries are kept oldest → newest.
export function usePracticeLog() {
  const [entries, setEntries] = useState<PracticeLogEntry[]>(loadLog);

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(entries));
    } catch {}
  }, [entries]);

  const logPractice = useCallback((entry: NewPracticeLogEntry) => {
    const now = new Date();
    setEntries((prev) =>
      trimLog([
        ...prev,
        {
          ...entry,
          id: `p_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
          completedAt: now.toISOString(),
          localDate: localDateKey(now),
        },
      ])
    );
  }, []);

  const streak = useMemo(() => currentStreak(entries), [entries]);

  return { entries, streak, logPractice };
}
