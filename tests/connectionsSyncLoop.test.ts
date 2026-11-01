// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../src/hooks/useAuth';
import type { ExternalCalendar } from '../src/hooks/useExternalCalendar';
import type { Place } from '../src/hooks/usePlace';
import type { Connections, SyncedPlace } from '../src/lib/connectionsSync';

// The sync hook against a pretend server, with React's real render timing: a
// copy taken from the account reaches the screen only on the next render, and
// that gap must not make the device send its old copy back.

const server = vi.hoisted(() => ({
  connections: { places: [] } as unknown,
  version: 1,
  puts: 0,
  gets: 0,
  delay: 5,
}));

vi.mock('../src/lib/auth', () => {
  const wait = () => new Promise((resolve) => setTimeout(resolve, server.delay));
  return {
    fetchAccountConnections: async () => {
      server.gets++;
      await wait();
      return { kept: true, connections: server.connections, version: server.version };
    },
    saveAccountConnections: async (changes: { baseVersion?: number } & Record<string, unknown>) => {
      server.puts++;
      await wait();
      const { baseVersion: _base, ...fields } = changes;
      server.connections = { ...(server.connections as object), ...fields };
      server.version++;
      return { kept: true, connections: server.connections, version: server.version };
    },
    forgetAccountConnections: async () => true,
  };
});

import { useConnectionsSync } from '../src/hooks/useConnectionsSync';

const home: SyncedPlace = { kind: 'home', lat: 37.7749, lon: -122.4194 };
const work: SyncedPlace = { kind: 'work', lat: 37.8, lon: -122.3 };
const auth = { status: 'user', user: { id: 'u1' } } as unknown as Auth;
// Plain waiting, not act(): act holds renders back, and the gap between a state
// change and its render is what these tests are about.
const settle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function start(device: SyncedPlace[], agreed: Connections) {
  localStorage.setItem('pranaveda_connections_owner', JSON.stringify('u1'));
  localStorage.setItem('pranaveda_connections_version', JSON.stringify(1));
  localStorage.setItem('pranaveda_connections_synced', JSON.stringify(agreed));
  return renderHook(() => {
    const [places, setPlaces] = useState<SyncedPlace[]>(device);
    const replacePlaces = useCallback((next: SyncedPlace[]) => setPlaces(next), []);
    const [icsUrl, setIcsUrl] = useState<string | undefined>(agreed.calendarLink);
    const place = { places, replacePlaces } as unknown as Place;
    const calendar = { icsUrl, adoptIcsUrl: setIcsUrl } as unknown as ExternalCalendar;
    useConnectionsSync(auth, place, calendar);
    return { places, setPlaces, icsUrl };
  });
}

describe('useConnectionsSync', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(server, { connections: { places: [] }, version: 1, puts: 0, gets: 0, delay: 5 });
  });
  afterEach(cleanup);

  it('takes a place saved on another device without sending the old copy back', async () => {
    Object.assign(server, { connections: { places: [home] }, version: 2 });
    const { result } = start([], { places: [] });
    await settle(200);
    expect(result.current.places).toEqual([home]);
    expect(server.puts).toBe(0);
    expect(server.version).toBe(2);
  });

  it('takes a calendar link changed on another device without sending the old one back', async () => {
    Object.assign(server, { connections: { places: [], calendarLink: 'https://example.com/b.ics' }, version: 2 });
    const { result } = start([], { places: [], calendarLink: 'https://example.com/a.ics' });
    await settle(200);
    expect(result.current.icsUrl).toBe('https://example.com/b.ics');
    expect(server.puts).toBe(0);
  });

  it('keeps a place saved here while the account was being read', async () => {
    Object.assign(server, { connections: { places: [] }, version: 1, delay: 50 });
    const { result } = start([], { places: [] });
    await waitFor(() => expect(server.gets).toBeGreaterThan(0));
    act(() => result.current.setPlaces([home]));
    await settle(400);
    expect(result.current.places).toEqual([home]);
    expect((server.connections as Connections).places).toEqual([home]);
  });

  it('keeps a place saved here while another change was being sent', async () => {
    Object.assign(server, { connections: { places: [] }, version: 1, delay: 50 });
    const { result } = start([home], { places: [] });
    await waitFor(() => expect(server.puts).toBe(1));
    act(() => result.current.setPlaces([home, work]));
    await settle(400);
    expect(result.current.places).toEqual([home, work]);
    expect((server.connections as Connections).places).toEqual([home, work]);
    expect(server.puts).toBe(2);
  });
});
