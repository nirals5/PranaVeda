import { describe, expect, it } from 'vitest';
import { changedFields, joinConnections, samePlaces } from '../src/lib/connectionsSync';
import type { SyncedPlace } from '../src/lib/connectionsSync';

// A device bringing its own places and calendar link together with the
// account's (useConnectionsSync), and sending only what changed.

const home: SyncedPlace = { kind: 'home', lat: 37.7749, lon: -122.4194 };
const otherHome: SyncedPlace = { kind: 'home', lat: 40.7, lon: -74 };
const work: SyncedPlace = { kind: 'work', lat: 37.79, lon: -122.4 };
const studio: SyncedPlace = { kind: 'studio', lat: 37.8, lon: -122.41 };
const LINK = 'webcal://calendar.example.com/a.ics';

describe('joinConnections', () => {
  it("keeps the account's spot for each kind and adds this device's other kinds", () => {
    expect(joinConnections({ places: [home] }, { places: [otherHome, studio, work] })).toEqual({ places: [home, work, studio] });
  });

  it("uses the account's link, else this device's", () => {
    expect(joinConnections({ places: [], calendarLink: LINK }, { places: [], calendarLink: 'https://x/b.ics' })).toEqual({ places: [], calendarLink: LINK });
    expect(joinConnections({ places: [] }, { places: [], calendarLink: LINK })).toEqual({ places: [], calendarLink: LINK });
    expect(joinConnections({ places: [] }, { places: [] })).toEqual({ places: [] });
  });
});

describe('changedFields', () => {
  it('sends only what changed', () => {
    const agreed = { places: [home], calendarLink: LINK };
    expect(changedFields({ places: [home], calendarLink: LINK }, agreed)).toEqual({});
    expect(changedFields({ places: [home, work], calendarLink: LINK }, agreed)).toEqual({ places: [home, work] });
    expect(changedFields({ places: [home] }, agreed)).toEqual({ calendarLink: null });
    expect(changedFields({ places: [], calendarLink: 'https://x/b.ics' }, agreed)).toEqual({ places: [], calendarLink: 'https://x/b.ics' });
  });

  it('ignores order, but not a moved spot', () => {
    expect(samePlaces([home, work], [work, home])).toBe(true);
    expect(samePlaces([home], [otherHome])).toBe(false);
    expect(samePlaces([home], [home, work])).toBe(false);
  });
});
