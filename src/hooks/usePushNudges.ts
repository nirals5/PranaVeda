import { useCallback, useEffect, useRef, useState } from 'react';
import { Auth } from './useAuth';
import { ExternalCalendar } from './useExternalCalendar';
import { removePushSubscription, savePushSubscription, sendPushState } from '../lib/auth';

const SEEN_EVERY_MS = 5 * 60 * 1000;
const UPLOAD_AT_LEAST_EVERY_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_MESSAGE = 'pranaveda-nudge-open';

const supported =
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function onIphoneOutsideHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  return ios && !installed;
}

function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js');
}

interface Options {
  auth: Auth;
  calendar: ExternalCalendar;
  onOpen: () => void;
}

export function usePushNudges({ auth, calendar, onOpen }: Options) {
  const signedIn = auth.status === 'user';
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => (supported ? Notification.permission : 'denied'));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const wasSignedIn = useRef(false);
  const lastUpload = useRef<{ body: string; at: number } | null>(null);

  const available = supported && signedIn && serverKey !== null;
  const enabled = available && subscribed && permission === 'granted';

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    fetch('/api/push/key')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => !cancelled && setServerKey(body?.publicKey ?? null))
      .catch(() => {});
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => !cancelled && setSubscribed(!!sub))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Opened from a nudge: straight away, or by the tab it brought forward.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('nudge') === '1') {
      url.searchParams.delete('nudge');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      onOpenRef.current();
    }
    if (!supported) return;
    const onMessage = (event: MessageEvent) => event.data?.type === OPEN_MESSAGE && onOpenRef.current();
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // Signing in ties this browser to the account; signing out stops its nudges.
  useEffect(() => {
    if (!supported) return;
    if (signedIn && subscribed) {
      navigator.serviceWorker
        .getRegistration('/')
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => sub && savePushSubscription(sub.toJSON()))
        .catch(() => {});
    }
    if (wasSignedIn.current && auth.status === 'guest') {
      navigator.serviceWorker
        .getRegistration('/')
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => sub?.unsubscribe())
        .then(() => setSubscribed(false))
        .catch(() => {});
    }
    wasSignedIn.current = signedIn;
  }, [signedIn, auth.status, subscribed]);

  // Busy times for today and tomorrow: start and end only.
  useEffect(() => {
    if (!enabled) return;
    const from = new Date(calendar.now);
    from.setHours(0, 0, 0, 0);
    const upload = calendar.connected
      ? {
          trusted: true,
          google: calendar.googleConnected,
          busy: calendar.busy.map((b) => [b.start, b.end] as [number, number]),
          coveredUntil: from.getTime() + 2 * DAY_MS,
        }
      : { trusted: false, google: calendar.googleConnected };
    const body = JSON.stringify(upload);
    const last = lastUpload.current;
    if (last && last.body === body && Date.now() - last.at < UPLOAD_AT_LEAST_EVERY_MS) return;
    lastUpload.current = { body, at: Date.now() };
    sendPushState({ calendar: upload }).catch(() => {
      lastUpload.current = null;
    });
  }, [enabled, calendar.connected, calendar.googleConnected, calendar.busy, calendar.now]);

  // While PranaVeda is on screen the in-app bar is enough; the server holds
  // push nudges until it has been away for a while.
  useEffect(() => {
    if (!enabled) return;
    const seen = () => document.visibilityState === 'visible' && sendPushState({ seen: true }).catch(() => {});
    seen();
    const timer = window.setInterval(seen, SEEN_EVERY_MS);
    document.addEventListener('visibilitychange', seen);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', seen);
    };
  }, [enabled]);

  const enable = useCallback(async () => {
    if (!serverKey) return;
    setPending(true);
    setError(null);
    try {
      const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(serverKey) }));
      if (!(await savePushSubscription(sub.toJSON()))) {
        await sub.unsubscribe();
        throw new Error('save failed');
      }
      lastUpload.current = null;
      setSubscribed(true);
    } catch {
      setError('Notifications could not be turned on just now. Please try again.');
    } finally {
      setPending(false);
    }
  }, [serverKey]);

  const disable = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint).catch(() => false);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setPending(false);
    }
  }, []);

  return {
    available,
    enabled,
    blocked: supported && permission === 'denied',
    needsHomeScreen: !supported && onIphoneOutsideHomeScreen(),
    offerSignIn: supported && serverKey !== null && auth.status === 'guest',
    pending,
    error,
    enable,
    disable,
  };
}

export type PushNudges = ReturnType<typeof usePushNudges>;
