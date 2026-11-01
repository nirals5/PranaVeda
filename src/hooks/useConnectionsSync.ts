import { useCallback, useEffect, useRef, useState } from 'react';
import { Auth } from './useAuth';
import { Place } from './usePlace';
import { ExternalCalendar } from './useExternalCalendar';
import { AccountConnections, fetchAccountConnections, forgetAccountConnections, saveAccountConnections } from '../lib/auth';
import { Connections, changedFields, joinConnections } from '../lib/connectionsSync';

// Saved places and the calendar link, kept on the account once the user turns
// that on, so every signed-in device uses the same ones. Off by default: until
// then they stay on this device. While on, the account's copy is the one in
// use, and a change here is sent straight away.
//
// Kept on the device while signed in:
//   OWNER_KEY   — whose account this device follows.
//   VERSION_KEY — the account version this device's copy matches; 0 when this
//                 device isn't following the account (yet).
//   AGREED_KEY  — that copy, so only what changed here is sent.
//   OWN_KEY     — this device's own places and link from before it followed
//                 the account; put back on sign-out.
const OWNER_KEY = 'pranaveda_connections_owner';
const VERSION_KEY = 'pranaveda_connections_version';
const AGREED_KEY = 'pranaveda_connections_synced';
const OWN_KEY = 'pranaveda_connections_own';

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

export function useConnectionsSync(auth: Auth, place: Place, calendar: ExternalCalendar) {
  // Null until the account has been asked.
  const [kept, setKept] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const userId = auth.status === 'user' ? auth.user?.id ?? null : null;

  const placeRef = useRef(place);
  placeRef.current = place;
  const calendarRef = useRef(calendar);
  calendarRef.current = calendar;

  const local = useCallback((): Connections => {
    const link = calendarRef.current.icsUrl;
    const places = placeRef.current.places.map(({ kind, lat, lon }) => ({ kind, lat, lon }));
    return link ? { places, calendarLink: link } : { places };
  }, []);

  const use = useCallback((connections: Connections, version: number) => {
    write(AGREED_KEY, connections);
    write(VERSION_KEY, version);
    placeRef.current.replacePlaces(connections.places);
    calendarRef.current.adoptIcsUrl(connections.calendarLink);
    // These reach the refs on the next render, but sync can look again before
    // that. Reading the old copy then would send it back, and each device
    // would keep overwriting the account with the copy it just replaced.
    placeRef.current = { ...placeRef.current, places: connections.places };
    calendarRef.current = { ...calendarRef.current, icsUrl: connections.calendarLink };
    setKept(true);
  }, []);

  const stopFollowing = useCallback(() => {
    write(VERSION_KEY, 0);
    write(AGREED_KEY, undefined);
    write(OWN_KEY, undefined);
    setKept(false);
  }, []);

  // Whatever the server answered: the account's copy, or that it keeps none.
  const settle = useCallback(
    (reply: AccountConnections<Connections>) => (reply.kept ? use(reply.connections, reply.version) : stopFollowing()),
    [use, stopFollowing]
  );

  const running = useRef(false);
  const again = useRef(false);

  // Send anything changed here, or take the account's copy (joining it first
  // if this device isn't following yet). One run at a time.
  const sync = useCallback(async () => {
    if (!read<string | null>(OWNER_KEY, null)) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const version = read<number>(VERSION_KEY, 0);
        if (version > 0) {
          const changes = changedFields(local(), read<Connections>(AGREED_KEY, { places: [] }));
          if (Object.keys(changes).length) {
            const sent = JSON.stringify(local());
            let reply = await saveAccountConnections<Connections>(changes, version);
            // Changed elsewhere meanwhile: this device's change is the newest.
            if (reply?.conflict && reply.kept) reply = await saveAccountConnections<Connections>(changes, reply.version);
            if (!reply) return; // offline: tried again later
            if (reply.kept && !reply.conflict && JSON.stringify(local()) !== sent) {
              // Changed here while sending: keep that change and send it next.
              write(AGREED_KEY, reply.connections);
              write(VERSION_KEY, reply.version);
              again.current = true;
            } else settle(reply);
            continue;
          }
        }
        const before = JSON.stringify(local());
        const account = await fetchAccountConnections<Connections>();
        if (!account) return;
        if (JSON.stringify(local()) !== before) {
          // Changed here while reading: that change goes first.
          again.current = true;
          continue;
        }
        if (!account.kept) {
          if (version > 0) stopFollowing();
          else setKept(false);
          continue;
        }
        if (version === 0) {
          // Joining: the account's places win, this device fills the gaps.
          write(OWN_KEY, local());
          const joined = joinConnections(account.connections, local());
          const changes = changedFields(joined, account.connections);
          if (Object.keys(changes).length) {
            const reply = await saveAccountConnections<Connections>(changes, account.version);
            if (!reply) return;
            if (reply.conflict) again.current = true;
            else settle(reply);
            continue;
          }
        }
        use(account.connections, account.version);
      } while (again.current);
    } catch (err) {
      console.warn('Connections sync failed:', err);
    } finally {
      running.current = false;
    }
  }, [local, settle, stopFollowing, use]);

  // Signed in: a different account starts afresh, then follow the account.
  useEffect(() => {
    if (!userId) return;
    if (read<string | null>(OWNER_KEY, null) !== userId) {
      [VERSION_KEY, AGREED_KEY, OWN_KEY].forEach((key) => write(key, undefined));
      write(OWNER_KEY, userId);
    }
    sync();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, sync]);

  // A place saved, moved or removed, or the link changed, here: send it.
  const placesKey = JSON.stringify(place.places);
  useEffect(() => {
    if (userId && read<number>(VERSION_KEY, 0) > 0) sync();
  }, [placesKey, calendar.icsUrl, userId, sync]);

  // Signed out: this device goes back to its own places and link.
  useEffect(() => {
    if (auth.status !== 'guest' || read<string | null>(OWNER_KEY, null) === null) return;
    const own = read<Connections | null>(OWN_KEY, null);
    if (own && read<number>(VERSION_KEY, 0) > 0) {
      placeRef.current.replacePlaces(own.places);
      calendarRef.current.adoptIcsUrl(own.calendarLink);
    }
    [OWNER_KEY, VERSION_KEY, AGREED_KEY, OWN_KEY].forEach((key) => write(key, undefined));
    setKept(null);
  }, [auth.status]);

  const turnOn = useCallback(async () => {
    setPending(true);
    setFailed(false);
    try {
      const mine = local();
      write(OWN_KEY, mine);
      const reply = await saveAccountConnections<Connections>(mine, 0);
      if (!reply) return setFailed(true);
      if (reply.conflict) {
        // Another device turned it on first: join it.
        write(VERSION_KEY, 0);
        await sync();
      } else settle(reply);
    } finally {
      setPending(false);
    }
  }, [local, settle, sync]);

  // Nothing stays on the account; this device keeps what it has now.
  const turnOff = useCallback(async () => {
    setPending(true);
    setFailed(false);
    try {
      if (await forgetAccountConnections()) stopFollowing();
      else setFailed(true);
    } finally {
      setPending(false);
    }
  }, [stopFollowing]);

  return { kept, pending, failed, turnOn, turnOff };
}

export type ConnectionsSync = ReturnType<typeof useConnectionsSync>;
