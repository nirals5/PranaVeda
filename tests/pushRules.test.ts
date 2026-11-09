import { describe, expect, it } from 'vitest';
import { type NudgeInput, openSlotAt, planNudge } from '../api/_lib/pushRules.js';

const ZONE = 'America/Los_Angeles';
const H = 60 * 60 * 1000;
const M = 60 * 1000;
// Tuesday 10 November 2026, 2:00 PM in Los Angeles (UTC-8).
const NOW = Date.parse('2026-11-10T22:00:00Z');
const at = (hhmm: string) => Date.parse(`2026-11-10T${hhmm}:00-08:00`);

const base = (over: Partial<NudgeInput> = {}): NudgeInput => ({
  now: NOW,
  timeZone: ZONE,
  lastPracticeAt: null,
  state: {
    busy: [[at('15:00'), at('16:00')]],
    trusted: true,
    google: false,
    uploadedAt: NOW - H,
    coveredUntil: NOW + 30 * H,
    seenAt: NOW - H,
    lastSlotKey: null,
    lastNotifiedAt: null,
  },
  linkBusy: undefined,
  ...over,
});

describe('open slot in the user’s own time zone', () => {
  it('finds the gap before the next commitment', () => {
    expect(openSlotAt([[at('15:00'), at('16:00')]], NOW, null, ZONE)).toEqual({ key: String(at('15:00')), until: at('15:00'), minutes: 60 });
  });

  it('is open for the rest of the day when nothing else is booked today', () => {
    const slot = openSlotAt([], NOW, null, ZONE)!;
    expect(slot.until).toBeNull();
    expect(slot.key).toBe(String(Date.parse('2026-11-11T00:00:00-08:00')));
  });

  it('stays quiet during a commitment, in short gaps, at night and after a practice', () => {
    expect(openSlotAt([[at('13:30'), at('15:00')]], NOW, null, ZONE)).toBeNull();
    expect(openSlotAt([[at('14:05'), at('15:00')]], NOW, null, ZONE)).toBeNull();
    expect(openSlotAt([], at('06:30'), null, ZONE)).toBeNull();
    expect(openSlotAt([], at('22:10'), null, ZONE)).toBeNull();
    expect(openSlotAt([], NOW, NOW - H, ZONE)).toBeNull();
    expect(openSlotAt([], NOW, NOW - 3 * H, ZONE)).not.toBeNull();
  });

  it('uses the user’s zone, not the server’s', () => {
    // 2 PM in Los Angeles is 11 PM in Paris.
    expect(openSlotAt([], NOW, null, 'Europe/Paris')).toBeNull();
  });
});

describe('planNudge', () => {
  it('nudges in open time, with the time in the user’s zone', () => {
    expect(planNudge(base())).toEqual({ key: String(at('15:00')), body: 'You have 60 open minutes, until 3:00 PM. A good moment to practice.' });
  });

  it('waits while PranaVeda was on screen in the last 15 minutes', () => {
    expect(planNudge(base({ state: { ...base().state, seenAt: NOW - 5 * M } }))).toBeNull();
  });

  it('sends one nudge per opening, and at most one every three hours', () => {
    expect(planNudge(base({ state: { ...base().state, lastSlotKey: String(at('15:00')), lastNotifiedAt: NOW - 4 * H } }))).toBeNull();
    expect(planNudge(base({ state: { ...base().state, lastSlotKey: 'other', lastNotifiedAt: NOW - 2 * H } }))).toBeNull();
    expect(planNudge(base({ state: { ...base().state, lastSlotKey: 'other', lastNotifiedAt: NOW - 4 * H } }))).not.toBeNull();
  });

  it('fails closed when a calendar could not be read', () => {
    expect(planNudge(base({ state: { ...base().state, trusted: false } }))).toBeNull();
    expect(planNudge(base({ linkBusy: null }))).toBeNull();
  });

  it('stops trusting uploaded busy times after a day', () => {
    expect(planNudge(base({ state: { ...base().state, uploadedAt: NOW - 25 * H } }))).toBeNull();
    expect(planNudge(base({ state: { ...base().state, coveredUntil: NOW - M } }))).toBeNull();
  });

  it('adds the account’s calendar link, read now, to the uploaded busy times', () => {
    expect(planNudge(base({ linkBusy: [[at('13:00'), at('14:30')]] }))).toBeNull();
    expect(planNudge(base({ linkBusy: [[at('14:30'), at('15:30')]] }))?.body).toContain('30 open minutes');
  });

  it('lets the link alone stand in for old uploads, only when it is the only calendar', () => {
    const old = { ...base().state, uploadedAt: NOW - 3 * 24 * H, coveredUntil: NOW - 24 * H };
    expect(planNudge(base({ state: old, linkBusy: [] }))).not.toBeNull();
    expect(planNudge(base({ state: { ...old, google: true }, linkBusy: [] }))).toBeNull();
    expect(planNudge(base({ state: old }))).toBeNull();
  });
});
