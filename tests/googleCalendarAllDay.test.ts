import { describe, expect, it } from 'vitest';
import { withoutWholeDays } from '../src/hooks/useExternalCalendar';

// KAN-28: all-day events never stop a nudge, out of office and holidays
// included. Google's free/busy answer counts an all-day "Busy" or "Out of
// office" event as busy from midnight to midnight, so whole days are taken
// back out.

const at = (day: number, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

describe('busy times from Google, without all-day events', () => {
  it('leaves an out-of-office day open', () => {
    expect(withoutWholeDays([{ start: at(10), end: at(11) }])).toEqual([]);
  });

  it('leaves a vacation of several days open', () => {
    expect(withoutWholeDays([{ start: at(10), end: at(13) }])).toEqual([]);
  });

  it('keeps meetings', () => {
    const meetings = [
      { start: at(10, 9), end: at(10, 10) },
      { start: at(10, 14), end: at(10, 15, 30) },
    ];
    expect(withoutWholeDays(meetings)).toEqual(meetings);
  });

  it('keeps the part of the evening before a day off, when Google joins them', () => {
    expect(withoutWholeDays([{ start: at(9, 22), end: at(11) }])).toEqual([{ start: at(9, 22), end: at(10) }]);
  });

  it('keeps the early hours of an overnight shift that runs into a day off', () => {
    expect(withoutWholeDays([{ start: at(10), end: at(11, 6) }])).toEqual([{ start: at(11), end: at(11, 6) }]);
  });

  it('keeps a long event that does not cover a whole day', () => {
    const shift = [{ start: at(10, 6), end: at(11, 5) }];
    expect(withoutWholeDays(shift)).toEqual(shift);
  });
});
