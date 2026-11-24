// Usage counts (KAN-32): how PranaVeda is used, counted per install. Counts,
// never content, and never the account: a random install id made in this
// browser, and for each event its name, time and whether someone was signed
// in. Queued here and sent in batches to /api/usage. Nothing at all while
// "Share anonymous usage counts" is off.

export type UsageEventName = 'app_open' | 'chat_sent' | 'practice_started' | 'practice_finished' | 'nudge_opened';
export type UsageSend = (body: string, opts: { leaving: boolean }) => Promise<boolean>;

interface QueuedEvent {
  name: UsageEventName;
  at: number;
  signedIn: boolean;
}

interface Deps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now: () => number;
  uuid: () => string;
}

const ID_KEY = 'pranaveda_install_id';
const QUEUE_KEY = 'pranaveda_usage_queue';
const OFF_KEY = 'pranaveda_usage_off';
const MAX_BATCH = 50;
const MAX_QUEUED = 200;
// The server refuses older ones.
const OLDEST_MS = 7 * 24 * 3600_000 - 60_000;

export function createUsage(deps: Deps, appVersion: string) {
  const { storage, now, uuid } = deps;
  let signedIn = false;
  let sending = false;

  const read = (): QueuedEvent[] => {
    try {
      const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const write = (queue: QueuedEvent[]) => {
    try {
      if (queue.length) storage.setItem(QUEUE_KEY, JSON.stringify(queue));
      else storage.removeItem(QUEUE_KEY);
    } catch {
      // Storage full or blocked: counts are not worth an error.
    }
  };
  const isOn = () => storage.getItem(OFF_KEY) !== '1';
  const installId = () => {
    const known = storage.getItem(ID_KEY);
    if (known) return known;
    const id = uuid();
    storage.setItem(ID_KEY, id);
    return id;
  };

  return {
    isOn,
    setSignedIn(value: boolean) {
      signedIn = value;
    },
    setOn(on: boolean) {
      if (on) storage.removeItem(OFF_KEY);
      else {
        storage.setItem(OFF_KEY, '1');
        storage.removeItem(QUEUE_KEY);
      }
    },
    track(name: UsageEventName) {
      if (!isOn()) return;
      write([...read(), { name, at: now(), signedIn }].slice(-MAX_QUEUED));
    },
    // One batch after another while each is accepted; what failed waits for next time.
    async flush(send: UsageSend, opts: { leaving?: boolean } = {}) {
      if (!isOn() || sending) return;
      sending = true;
      try {
        const fresh = read().filter((e) => e.at >= now() - OLDEST_MS);
        write(fresh);
        while (fresh.length) {
          const batch = fresh.slice(0, MAX_BATCH);
          const body = JSON.stringify({ installId: installId(), platform: 'web', appVersion, events: batch });
          if (!(await send(body, { leaving: !!opts.leaving }))) return;
          fresh.splice(0, batch.length);
          // Events tracked meanwhile stay queued behind the sent ones.
          write(read().slice(batch.length));
          if (opts.leaving) return;
        }
      } finally {
        sending = false;
      }
    },
  };
}

// As the tab closes, sendBeacon is the only send that is sure to leave.
export const browserSend: UsageSend = async (body, { leaving }) => {
  try {
    if (leaving && typeof navigator !== 'undefined' && navigator.sendBeacon) return navigator.sendBeacon('/api/usage', body);
    const res = await fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    return res.ok;
  } catch {
    return false;
  }
};

const noStorage: Deps['storage'] = { getItem: () => '1', setItem: () => {}, removeItem: () => {} };

function browserStorage(): Deps['storage'] {
  try {
    return typeof localStorage === 'undefined' ? noStorage : localStorage;
  } catch {
    return noStorage; // blocked: behaves as switched off
  }
}

declare const __APP_VERSION__: string | undefined;

export const usage = createUsage(
  { storage: browserStorage(), now: () => Date.now(), uuid: () => crypto.randomUUID() },
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
);
