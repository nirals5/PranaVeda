import { eq, sql, and } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { connectionsKey, seal, unseal } from './tokens.js';

// Saved places and the website's calendar link, kept on the account when the
// user turns that on ("Keep my places and calendar link on my account"), so
// every signed-in device uses the same ones. Off by default: until then they
// never leave the device. Stored encrypted (a calendar link works like a
// password), with a version for optimistic concurrency, as the profile is.

const { accountConnections } = schema;

export const PLACE_KINDS = ['home', 'work', 'studio', 'outdoors'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface SyncedPlace {
  kind: PlaceKind;
  lat: number;
  lon: number;
}

export interface Connections {
  places: SyncedPlace[];
  calendarLink?: string;
}

export interface VersionedConnections {
  connections: Connections;
  version: number;
}

export class ConnectionsUnavailable extends Error {}

const MAX_LINK = 2048;

// Spots the apps and website save: one per kind, a real position.
export function parsePlaces(raw: unknown): SyncedPlace[] | null {
  if (!Array.isArray(raw) || raw.length > PLACE_KINDS.length) return null;
  const places: SyncedPlace[] = [];
  for (const p of raw) {
    const { kind, lat, lon } = (p ?? {}) as Record<string, unknown>;
    if (!PLACE_KINDS.includes(kind as PlaceKind) || places.some((q) => q.kind === kind)) return null;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    places.push({ kind: kind as PlaceKind, lat, lon });
  }
  return places;
}

// An iCal address, as the website's calendar card accepts one.
export function parseCalendarLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const link = raw.trim();
  if (!link || link.length > MAX_LINK || !/^(https?|webcal):\/\/\S+$/i.test(link)) return null;
  return link;
}

function key(): Buffer {
  const k = connectionsKey();
  // Never stored in the clear: without the key, syncing is simply unavailable.
  if (!k) throw new ConnectionsUnavailable('CONNECTIONS_ENC_KEY is not set');
  return k;
}

// Null when nothing is kept on the account (never turned on, or turned off).
export async function loadConnections(userId: string): Promise<VersionedConnections | null> {
  const [row] = await getDb()
    .select({ data: accountConnections.data, version: accountConnections.version })
    .from(accountConnections)
    .where(eq(accountConnections.userId, userId))
    .limit(1);
  if (!row) return null;
  const opened = unseal(row.data, key());
  if (opened === null) throw new ConnectionsUnavailable('stored connections cannot be opened');
  return { connections: JSON.parse(opened) as Connections, version: row.version };
}

export type SaveConnectionsResult = { ok: true; version: number } | { ok: false; current: VersionedConnections | null };

// Writes the whole set. `baseVersion` 0 starts keeping them on the account;
// otherwise it must match what is stored, or nothing is written and the
// current set comes back for the device to start again from.
export async function saveConnections(userId: string, connections: Connections, baseVersion: number): Promise<SaveConnectionsResult> {
  const data = seal(JSON.stringify(connections), key());
  const db = getDb();
  const written =
    baseVersion === 0
      ? await db
          .insert(accountConnections)
          .values({ userId, data, version: 1 })
          .onConflictDoNothing()
          .returning({ version: accountConnections.version })
      : await db
          .update(accountConnections)
          .set({ data, version: sql`${accountConnections.version} + 1`, updatedAt: new Date() })
          .where(and(eq(accountConnections.userId, userId), eq(accountConnections.version, baseVersion)))
          .returning({ version: accountConnections.version });
  if (written.length === 1) return { ok: true, version: written[0].version };
  return { ok: false, current: await loadConnections(userId) };
}

// Turning it off: nothing is kept on the account any more. Devices keep
// their own copies.
export async function forgetConnections(userId: string): Promise<void> {
  await getDb().delete(accountConnections).where(eq(accountConnections.userId, userId));
}
