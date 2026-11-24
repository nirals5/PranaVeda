import { describe, expect, it } from 'vitest';
import { createUsage, type UsageSend } from '../src/lib/usage.js';

// The website's usage counts (KAN-32): queued in the browser, sent in
// batches, nothing at all while "Share anonymous usage counts" is off.

const NOW = Date.parse('2026-11-24T12:00:00Z');
const DAY = 24 * 3600_000;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const setup = (now = NOW) => {
  const storage = memoryStorage();
  let clock = now;
  let ids = 0;
  const usage = createUsage({ storage, now: () => clock, uuid: () => `3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0${ids++}` }, 'abc1234');
  return { storage, usage, tick: (ms: number) => (clock += ms) };
};

const recorder = (answer = true) => {
  const sent: any[] = [];
  const send: UsageSend = async (body) => {
    sent.push(JSON.parse(body));
    return answer;
  };
  return { sent, send };
};

describe('usage counts on the website', () => {
  it('queues each event with its time and whether someone is signed in, under one install id', async () => {
    const { usage } = setup();
    usage.track('app_open');
    usage.setSignedIn(true);
    usage.track('chat_sent');
    const { sent, send } = recorder();
    await usage.flush(send);
    expect(sent).toEqual([
      {
        installId: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a00',
        platform: 'web',
        appVersion: 'abc1234',
        events: [
          { name: 'app_open', at: NOW, signedIn: false },
          { name: 'chat_sent', at: NOW, signedIn: true },
        ],
      },
    ]);
    usage.track('app_open');
    await usage.flush(send);
    expect(sent[1].installId).toBe(sent[0].installId);
  });

  it('sends at most 50 at a time, keeps what failed to send, and drops nothing on failure', async () => {
    const { usage } = setup();
    for (let i = 0; i < 60; i++) usage.track('app_open');
    const failing = recorder(false);
    await usage.flush(failing.send);
    expect(failing.sent[0].events).toHaveLength(50);
    const ok = recorder();
    await usage.flush(ok.send);
    expect(ok.sent.map((b) => b.events.length)).toEqual([50, 10]);
    const empty = recorder();
    await usage.flush(empty.send);
    expect(empty.sent).toEqual([]);
  });

  it('holds at most 200 waiting, and never sends one older than a week', async () => {
    const { usage, tick } = setup();
    usage.track('practice_started');
    tick(8 * DAY);
    for (let i = 0; i < 250; i++) usage.track('app_open');
    const { sent, send } = recorder();
    await usage.flush(send);
    const events = sent.flatMap((b) => b.events);
    expect(events).toHaveLength(200);
    expect(events.every((e: any) => e.name === 'app_open')).toBe(true);
  });

  it('records and sends nothing while switched off, and forgets what was waiting', async () => {
    const { usage, storage } = setup();
    expect(usage.isOn()).toBe(true);
    usage.track('app_open');
    usage.setOn(false);
    expect(usage.isOn()).toBe(false);
    usage.track('chat_sent');
    const { sent, send } = recorder();
    await usage.flush(send);
    expect(sent).toEqual([]);
    expect([...storage.data.keys()].some((k) => k.includes('queue'))).toBe(false);

    usage.setOn(true);
    usage.track('nudge_opened');
    await usage.flush(send);
    expect(sent.flatMap((b) => b.events).map((e: any) => e.name)).toEqual(['nudge_opened']);
  });

  it('survives storage it cannot read', async () => {
    const { usage, storage } = setup();
    storage.data.set('pranaveda_usage_queue', 'not json');
    usage.track('app_open');
    const { sent, send } = recorder();
    await usage.flush(send);
    expect(sent[0].events).toHaveLength(1);
  });
});
