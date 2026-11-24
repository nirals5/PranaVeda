import { describe, expect, it } from 'vitest';
import { MAX_BATCH, USAGE_EVENTS, parseUsageBatch } from '../api/_lib/usage.js';

// Usage counts (KAN-32): what an install may send. Counts, never content, and
// never the account: an install id made on the device, the platform, the app
// version, and for each event its name, time and whether someone was signed in.

const NOW = Date.parse('2026-11-24T12:00:00Z');
const INSTALL = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const event = (over: Record<string, unknown> = {}) => ({ name: 'app_open', at: NOW - 60_000, signedIn: false, ...over });
const batch = (over: Record<string, unknown> = {}) => ({ installId: INSTALL, platform: 'web', appVersion: '1.0.3', events: [event()], ...over });

describe('a usage batch', () => {
  it('is read as sent, with times as dates', () => {
    expect(parseUsageBatch(batch({ events: [event(), event({ name: 'practice_finished', signedIn: true })] }), NOW)).toEqual({
      installId: INSTALL,
      platform: 'web',
      appVersion: '1.0.3',
      events: [
        { name: 'app_open', at: new Date(NOW - 60_000), signedIn: false },
        { name: 'practice_finished', at: new Date(NOW - 60_000), signedIn: true },
      ],
    });
  });

  it('names only the five events', () => {
    expect(USAGE_EVENTS).toEqual(['app_open', 'chat_sent', 'practice_started', 'practice_finished', 'nudge_opened']);
    for (const name of USAGE_EVENTS) expect(parseUsageBatch(batch({ events: [event({ name })] }), NOW)).not.toBeNull();
    expect(parseUsageBatch(batch({ events: [event({ name: 'page_view' })] }), NOW)).toBeNull();
  });

  it('refuses anything that could carry content or point at a person', () => {
    expect(parseUsageBatch(batch({ events: [event({ text: 'I feel anxious' })] }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ events: [event({ practiceId: 'p-12' })] }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ userId: 'u-1' }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ email: 'a@b.c' }), NOW)).toBeNull();
  });

  it('needs a random install id, a known platform and a plain version', () => {
    expect(parseUsageBatch(batch({ installId: 'hetan-iphone' }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ installId: INSTALL.toUpperCase() }), NOW)?.installId).toBe(INSTALL);
    for (const platform of ['web', 'ios', 'android']) expect(parseUsageBatch(batch({ platform }), NOW)).not.toBeNull();
    expect(parseUsageBatch(batch({ platform: 'windows' }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ appVersion: '1.0 (build 3)' }), NOW)).not.toBeNull();
    expect(parseUsageBatch(batch({ appVersion: '<script>' }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ appVersion: 'x'.repeat(33) }), NOW)).toBeNull();
  });

  it('holds 1 to 50 events from the last week, none from the future', () => {
    expect(MAX_BATCH).toBe(50);
    expect(parseUsageBatch(batch({ events: [] }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ events: Array.from({ length: 50 }, () => event()) }), NOW)?.events).toHaveLength(50);
    expect(parseUsageBatch(batch({ events: Array.from({ length: 51 }, () => event()) }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ events: [event({ at: NOW - 8 * 24 * 3600_000 })] }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ events: [event({ at: NOW + 10 * 60_000 })] }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ events: [event({ at: 'yesterday' })] }), NOW)).toBeNull();
    expect(parseUsageBatch(batch({ events: [event({ signedIn: 'yes' })] }), NOW)).toBeNull();
  });
});
