import { useCallback, useEffect, useRef, useState } from 'react';
import { BusyInterval, OpenSlot, describeOpenSlot, findOpenSlot } from './useExternalCalendar';

// Browser notifications for Amrita's free-time nudge. They exist for when
// PranaVeda is open in a tab the user is NOT looking at — the in-app bar
// covers the rest — and they stop when the tab or browser closes (reaching a
// closed app needs push and a server).

const ENABLED_KEY = 'pranaveda_nudge_notifications';
const LAST_KEY = 'pranaveda_nudge_notified';
// Let the user settle into whatever they left for before interrupting it.
const AWAY_BEFORE_NOTIFY_MS = 15 * 60 * 1000;
// A full day of short gaps must not become a stream of notifications.
const MIN_GAP_MS = 3 * 60 * 60 * 1000;

export interface NotifyState {
  slot: OpenSlot | null;
  now: number;
  hiddenSince: number | null; // when the tab left view; null while visible
  last: { key: string; at: number } | null; // the previous notification
}

export function shouldNotify({ slot, now, hiddenSince, last }: NotifyState): boolean {
  if (!slot || hiddenSince === null || now - hiddenSince < AWAY_BEFORE_NOTIFY_MS) return false;
  if (last && (last.key === slot.key || now - last.at < MIN_GAP_MS)) return false;
  return true;
}

const supported = typeof window !== 'undefined' && 'Notification' in window;

function loadLast(): NotifyState['last'] {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
  } catch {
    return null;
  }
}

interface NudgeNotificationOptions {
  connected: boolean;
  busy: BusyInterval[];
  now: number;
  lastPracticeAt: number | null;
  // True while a nudge would intrude (e.g. the user is inside a practice).
  suppressed: boolean;
  onOpen: () => void;
}

export function useNudgeNotifications({ connected, busy, now, lastPracticeAt, suppressed, onOpen }: NudgeNotificationOptions) {
  const [permission, setPermission] = useState<NotificationPermission>(() => (supported ? Notification.permission : 'denied'));
  const [wanted, setWanted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const hiddenSinceRef = useRef<number | null>(document.visibilityState === 'hidden' ? Date.now() : null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const enabled = supported && wanted && permission === 'granted';

  useEffect(() => {
    const onVisibility = () => {
      hiddenSinceRef.current = document.visibilityState === 'hidden' ? Date.now() : null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!enabled || !connected || suppressed) return;
    const slot = findOpenSlot(busy, now, lastPracticeAt);
    // The record is read from storage each time so a second open tab does not
    // repeat a nudge the first already sent.
    if (!slot || !shouldNotify({ slot, now, hiddenSince: hiddenSinceRef.current, last: loadLast() })) return;
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ key: slot.key, at: now }));
      const notification = new Notification('Amrita', {
        body: `${describeOpenSlot(slot)} A good moment to practice.`,
        tag: 'pranaveda-nudge',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        onOpenRef.current();
      };
    } catch {
      // Some mobile browsers expose Notification but only allow it from a
      // service worker; there the in-app bar remains the only nudge.
    }
  }, [enabled, connected, suppressed, busy, now, lastPracticeAt]);

  const enable = useCallback(async () => {
    if (!supported) return;
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') return;
    setWanted(true);
    try {
      localStorage.setItem(ENABLED_KEY, '1');
    } catch {}
  }, []);

  const disable = useCallback(() => {
    setWanted(false);
    try {
      localStorage.removeItem(ENABLED_KEY);
    } catch {}
  }, []);

  return { supported, blocked: supported && permission === 'denied', enabled, enable, disable };
}

export type NudgeNotifications = ReturnType<typeof useNudgeNotifications>;
