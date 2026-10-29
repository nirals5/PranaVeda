import { useCallback, useEffect, useRef } from 'react';
import { PracticeLogEntry } from '../types';
import { Auth } from './useAuth';
import { fetchPracticesAfter, uploadPractices } from '../lib/auth';

// Practice history follows a signed-in person across devices, like the
// wellness profile (see useProfileSync), and is handed back the same way.
//
// Kept on the device while signed in:
//   OWNER_KEY  — whose account this device's log is synced with.
//   OWN_KEY    — ids of the practices this device had before sign-in; they
//                stay when the person signs out.
//   SYNCED_KEY — ids the account is known to have. Anything else is waiting
//                to upload, so a practice finished offline is sent later.
//   CURSOR_KEY — how far through the account's log this device has read.
//   FEELINGS_KEY — id → the feeling the account has for it, so a practice
//                rated after it was sent goes again with its rating (H11).
const OWNER_KEY = 'pranaveda_practice_owner';
const OWN_KEY = 'pranaveda_practice_own_ids';
const SYNCED_KEY = 'pranaveda_practice_synced_ids';
const CURSOR_KEY = 'pranaveda_practice_cursor';
const FEELINGS_KEY = 'pranaveda_practice_sent_feelings';

const BATCH = 25; // the server's per-request limit

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// What the account is missing: new practices, and ratings it has not had.
export function pendingUploads(entries: PracticeLogEntry[], synced: ReadonlySet<string>, sentFeelings: Readonly<Record<string, string>>) {
  return entries.filter((e) => !synced.has(e.id) || (e.feeling !== undefined && sentFeelings[e.id] !== e.feeling));
}

export function usePracticeSync(
  auth: Auth,
  entries: PracticeLogEntry[],
  merge: (incoming: PracticeLogEntry[]) => void,
  retainOnly: (keep: (entry: PracticeLogEntry) => boolean) => void
) {
  const latest = useRef(entries);
  latest.current = entries;
  const running = useRef(false);
  const again = useRef(false);

  // Upload whatever the account does not have yet, then read whatever is new
  // there. One run at a time; a request made during a run starts another.
  const sync = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const synced = new Set(read<string[]>(SYNCED_KEY, []));
        const sentFeelings = read<Record<string, string>>(FEELINGS_KEY, {});
        const pending = pendingUploads(latest.current, synced, sentFeelings);
        for (let i = 0; i < pending.length; i += BATCH) {
          const batch = pending.slice(i, i + BATCH);
          if (!(await uploadPractices(batch))) return; // offline or refused: retry on the next change or visit
          batch.forEach((e) => {
            synced.add(e.id);
            if (e.feeling) sentFeelings[e.id] = e.feeling;
          });
          write(SYNCED_KEY, [...synced]);
          write(FEELINGS_KEY, sentFeelings);
        }

        let cursor = read<number>(CURSOR_KEY, 0);
        for (;;) {
          const page = await fetchPracticesAfter<PracticeLogEntry>(cursor);
          if (!page) return;
          if (page.entries.length) {
            merge(page.entries);
            page.entries.forEach((e) => {
              synced.add(e.id);
              if (e.feeling && !sentFeelings[e.id]) sentFeelings[e.id] = e.feeling;
            });
            write(SYNCED_KEY, [...synced]);
            write(FEELINGS_KEY, sentFeelings);
          }
          cursor = page.cursor;
          write(CURSOR_KEY, cursor);
          if (!page.hasMore) break;
        }
      } while (again.current);
    } catch (err) {
      console.warn('Practice sync failed:', err);
    } finally {
      running.current = false;
    }
  }, [merge]);

  const userId = auth.status === 'user' ? auth.user?.id ?? null : null;

  // Signed in: take this device's log into the account (first time), then sync.
  useEffect(() => {
    if (!userId) return;
    if (read<string | null>(OWNER_KEY, null) !== userId) {
      write(OWN_KEY, latest.current.map((e) => e.id));
      write(SYNCED_KEY, []);
      write(CURSOR_KEY, 0);
      write(FEELINGS_KEY, {});
      write(OWNER_KEY, userId);
    }
    sync();
  }, [userId, sync]);

  // A practice finished or rated while signed in: send it.
  const newest = entries.length ? entries[entries.length - 1].id : null;
  const recentFeelings = entries.slice(-20).map((e) => e.feeling ?? '-').join('');
  useEffect(() => {
    if (userId && newest) sync();
  }, [userId, newest, recentFeelings, sync]);

  // Signed out by any route: keep this device's own practices, drop the ones
  // that came from the account. A practice that never reached the account is
  // kept too, rather than lost.
  useEffect(() => {
    if (auth.status !== 'guest' || read<string | null>(OWNER_KEY, null) === null) return;
    const own = new Set(read<string[]>(OWN_KEY, []));
    const synced = new Set(read<string[]>(SYNCED_KEY, []));
    retainOnly((e) => own.has(e.id) || !synced.has(e.id));
    [OWNER_KEY, OWN_KEY, SYNCED_KEY, CURSOR_KEY, FEELINGS_KEY].forEach((key) => write(key, undefined));
  }, [auth.status, retainOnly]);
}
