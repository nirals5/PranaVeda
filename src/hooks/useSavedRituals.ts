import { useCallback, useEffect, useRef, useState } from 'react';
import { SavedPractice } from '../types';
import { Auth } from './useAuth';
import { fetchSavedRituals, sendSavedChanges } from '../lib/auth';
import { reconcileSaved } from '../lib/savedSync';

// Bookmarked rituals. Kept on the device, and while signed in they follow
// the account across devices, like the practice log (see usePracticeSync);
// unlike it, a ritual can be removed, and a removal travels too.
//
// Kept on the device while signed in:
//   OWNER_KEY   — whose account this device's list is synced with.
//   OWN_KEY     — ids this device had before sign-in; they stay on sign-out.
//   SYNCED_KEY  — ids the account is known to have. Anything else is waiting
//                 to upload, so a ritual saved offline is sent later.
//   REMOVED_KEY — ids removed here that the account has not heard about yet.
const LIST_KEY = 'pranaveda_practices';
const OWNER_KEY = 'pranaveda_saved_owner';
const OWN_KEY = 'pranaveda_saved_own_ids';
const SYNCED_KEY = 'pranaveda_saved_synced_ids';
const REMOVED_KEY = 'pranaveda_saved_removed_ids';

const SAVE_BATCH = 25; // the server's per-request limits
const REMOVE_BATCH = 100;

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

export function useSavedRituals(auth: Auth) {
  const [saved, setSavedState] = useState<SavedPractice[]>(() => read<SavedPractice[]>(LIST_KEY, []));
  const latest = useRef(saved);
  latest.current = saved;

  const setSaved = useCallback((next: SavedPractice[]) => {
    latest.current = next;
    setSavedState(next);
    write(LIST_KEY, next);
  }, []);

  const running = useRef(false);
  const again = useRef(false);

  // Send what was removed and saved here, then take the account's list.
  // One run at a time; a request made during a run starts another.
  const sync = useCallback(async () => {
    if (read<string | null>(OWNER_KEY, null) === null) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        let removes = read<string[]>(REMOVED_KEY, []);
        while (removes.length) {
          if (!(await sendSavedChanges({ removes: removes.slice(0, REMOVE_BATCH) }))) return; // offline: tried again later
          removes = removes.slice(REMOVE_BATCH);
          write(REMOVED_KEY, removes);
        }

        const synced = new Set(read<string[]>(SYNCED_KEY, []));
        const pending = latest.current.filter((r) => !synced.has(r.id));
        for (let i = 0; i < pending.length; i += SAVE_BATCH) {
          const batch = pending.slice(i, i + SAVE_BATCH);
          if (!(await sendSavedChanges({ saves: batch }))) return;
          batch.forEach((r) => synced.add(r.id));
          write(SYNCED_KEY, [...synced]);
        }

        const account = await fetchSavedRituals<SavedPractice>();
        if (!account) return;
        const merged = reconcileSaved(latest.current, account, synced, new Set(read<string[]>(REMOVED_KEY, [])));
        setSaved(merged.rituals);
        write(SYNCED_KEY, merged.synced);
      } while (again.current);
    } catch (err) {
      console.warn('Saved-ritual sync failed:', err);
    } finally {
      running.current = false;
    }
  }, [setSaved]);

  const userId = auth.status === 'user' ? auth.user?.id ?? null : null;

  // Signed in: take this device's list into the account (first time), then sync.
  useEffect(() => {
    if (!userId) return;
    if (read<string | null>(OWNER_KEY, null) !== userId) {
      write(OWN_KEY, latest.current.map((r) => r.id));
      write(SYNCED_KEY, []);
      write(REMOVED_KEY, []);
      write(OWNER_KEY, userId);
    }
    sync();
  }, [userId, sync]);

  // Signed out by any route: keep this device's own rituals, drop the ones
  // that came from the account. One that never reached the account is kept
  // too, rather than lost.
  useEffect(() => {
    if (auth.status !== 'guest' || read<string | null>(OWNER_KEY, null) === null) return;
    const own = new Set(read<string[]>(OWN_KEY, []));
    const synced = new Set(read<string[]>(SYNCED_KEY, []));
    setSaved(latest.current.filter((r) => own.has(r.id) || !synced.has(r.id)));
    [OWNER_KEY, OWN_KEY, SYNCED_KEY, REMOVED_KEY].forEach((key) => write(key, undefined));
  }, [auth.status, setSaved]);

  const save = useCallback(
    (ritual: SavedPractice) => {
      setSaved([ritual, ...latest.current]);
      if (userId) sync();
    },
    [setSaved, sync, userId]
  );

  const remove = useCallback(
    (id: string) => {
      setSaved(latest.current.filter((r) => r.id !== id));
      // Only the account needs telling, and only if it has (or may have) it.
      if (read<string | null>(OWNER_KEY, null) !== null) {
        write(REMOVED_KEY, [...new Set([...read<string[]>(REMOVED_KEY, []), id])]);
        if (userId) sync();
      }
    },
    [setSaved, sync, userId]
  );

  return { saved, save, remove };
}
