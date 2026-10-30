import 'dotenv/config';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import syncApp from '../api/sync.js';
import { getDb, schema } from '../api/_lib/db.js';
import { parseCalendarLink, parsePlaces } from '../api/_lib/connections.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, useSecrets } from './helpers.js';

// Saved places and the calendar link kept on the account (opt-in), end to
// end against the real database where one is configured. Every account made
// here is deleted afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, accountConnections } = schema;
const KEY = 'k'.repeat(48);

const home = { kind: 'home', lat: 37.7749, lon: -122.4194 };
const studio = { kind: 'studio', lat: 37.79, lon: -122.4 };
const LINK = 'webcal://calendar.example.com/private-abc123/basic.ics';

describe('connection checks', () => {
  it('accepts one real spot per kind of place', () => {
    expect(parsePlaces([home, studio])).toEqual([home, studio]);
    expect(parsePlaces([])).toEqual([]);
    expect(parsePlaces([home, { ...home, lat: 1 }])).toBeNull();
    expect(parsePlaces([{ kind: 'gym', lat: 1, lon: 1 }])).toBeNull();
    expect(parsePlaces([{ kind: 'home', lat: 91, lon: 0 }])).toBeNull();
    expect(parsePlaces([{ kind: 'home', lat: '37', lon: 0 }])).toBeNull();
    expect(parsePlaces('home')).toBeNull();
  });

  it('accepts an iCal address the website would', () => {
    expect(parseCalendarLink(`  ${LINK} `)).toBe(LINK);
    expect(parseCalendarLink('https://outlook.office365.com/owa/calendar/x/calendar.ics')).not.toBeNull();
    expect(parseCalendarLink('javascript:alert(1)')).toBeNull();
    expect(parseCalendarLink('')).toBeNull();
    expect(parseCalendarLink(`https://x.com/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe.skipIf(!hasDb)('connections sync', () => {
  const created: string[] = [];
  const saved = process.env.CONNECTIONS_ENC_KEY;

  const newUser = async () => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest connections' }).returning({ id: users.id });
    created.push(user.id);
    return { id: user.id, auth: `Bearer ${await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app')}` };
  };
  const get = (auth: string) => request(syncApp).get('/api/sync/connections').set('Authorization', auth);
  const put = (auth: string, body: object) => request(syncApp).put('/api/sync/connections').set('Authorization', auth).send(body);

  beforeAll(() => {
    useSecrets(SECRET_A);
    process.env.CONNECTIONS_ENC_KEY = KEY;
  });
  afterEach(() => {
    process.env.CONNECTIONS_ENC_KEY = KEY;
  });
  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
    if (saved === undefined) delete process.env.CONNECTIONS_ENC_KEY;
    else process.env.CONNECTIONS_ENC_KEY = saved;
  });

  it('keeps nothing until it is turned on', async () => {
    const user = await newUser();
    expect((await get(user.auth)).body).toEqual({ kept: false, connections: { places: [] }, version: 0 });
  });

  it('keeps places and the link, encrypted, and versions each change', async () => {
    const user = await newUser();
    const first = await put(user.auth, { baseVersion: 0, places: [home], calendarLink: LINK });
    expect(first.body).toEqual({ kept: true, connections: { places: [home], calendarLink: LINK }, version: 1 });

    // Nothing readable in the table: no link, no coordinates.
    const [row] = await getDb().select().from(accountConnections).where(eq(accountConnections.userId, user.id));
    expect(row.data).not.toContain('calendar.example.com');
    expect(row.data).not.toContain('37.7749');

    expect((await get(user.auth)).body).toEqual({ kept: true, connections: { places: [home], calendarLink: LINK }, version: 1 });
  });

  it('leaves out what a device does not send (the apps send places only)', async () => {
    const user = await newUser();
    await put(user.auth, { baseVersion: 0, places: [home], calendarLink: LINK });
    const fromApp = await put(user.auth, { baseVersion: 1, places: [home, studio] });
    expect(fromApp.body.connections).toEqual({ places: [home, studio], calendarLink: LINK });

    const linkOnly = await put(user.auth, { baseVersion: 2, calendarLink: null });
    expect(linkOnly.body).toEqual({ kept: true, connections: { places: [home, studio] }, version: 3 });
  });

  it('refuses a stale write and hands back what is stored now', async () => {
    const user = await newUser();
    await put(user.auth, { baseVersion: 0, places: [home] });
    await put(user.auth, { baseVersion: 1, places: [home, studio] });
    const stale = await put(user.auth, { baseVersion: 1, places: [] });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'version_conflict', kept: true, connections: { places: [home, studio] }, version: 2 });

    // Turning it on twice: the second device starts from the first one's.
    const again = await put(user.auth, { baseVersion: 0, places: [studio] });
    expect(again.status).toBe(409);
    expect(again.body.version).toBe(2);
  });

  it('turning it off removes everything from the account', async () => {
    const user = await newUser();
    await put(user.auth, { baseVersion: 0, places: [home], calendarLink: LINK });
    const off = await request(syncApp).delete('/api/sync/connections').set('Authorization', user.auth);
    expect(off.body).toEqual({ kept: false, connections: { places: [] }, version: 0 });
    expect(await getDb().select().from(accountConnections).where(eq(accountConnections.userId, user.id))).toEqual([]);

    // A device still writing to the old version learns it was turned off.
    const late = await put(user.auth, { baseVersion: 1, places: [studio] });
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ kept: false, version: 0 });
  });

  it('refuses bad input, other sites and signed-out requests', async () => {
    const user = await newUser();
    expect((await put(user.auth, { places: [home] })).body.error).toBe('base_version_required');
    expect((await put(user.auth, { baseVersion: 0, places: [{ kind: 'gym', lat: 0, lon: 0 }] })).body.error).toBe('invalid_places');
    expect((await put(user.auth, { baseVersion: 0, calendarLink: 'ftp://x' })).body.error).toBe('invalid_calendar_link');
    const crossSite = await put(user.auth, { baseVersion: 0, places: [home] }).set('Origin', 'https://evil.example');
    expect(crossSite.status).toBe(403);
    expect((await request(syncApp).get('/api/sync/connections')).status).toBe(401);
  });

  it('is unavailable rather than storing anything in the clear without a key', async () => {
    const user = await newUser();
    delete process.env.CONNECTIONS_ENC_KEY;
    const res = await put(user.auth, { baseVersion: 0, places: [home] });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('connections_unavailable');
    expect(await getDb().select().from(accountConnections).where(eq(accountConnections.userId, user.id))).toEqual([]);
  });

  it('goes with the account when it is deleted', async () => {
    const user = await newUser();
    await put(user.auth, { baseVersion: 0, places: [home] });
    await getDb().delete(users).where(eq(users.id, user.id));
    expect(await getDb().select().from(accountConnections).where(eq(accountConnections.userId, user.id))).toEqual([]);
  });
});
