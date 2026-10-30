// Saved places and the calendar link, kept on the account when the user turns
// that on (api/_lib/connections.ts). The rules for bringing a device's own
// copy together with the account's, shared by the hook and its tests; the
// apps follow the same rules for places.

export type PlaceKind = 'home' | 'work' | 'studio' | 'outdoors';

export interface SyncedPlace {
  kind: PlaceKind;
  lat: number;
  lon: number;
}

export interface Connections {
  places: SyncedPlace[];
  calendarLink?: string;
}

const KIND_ORDER: PlaceKind[] = ['home', 'work', 'studio', 'outdoors'];
const byKind = (a: SyncedPlace, b: SyncedPlace) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);

// A device joining an account that already keeps them: the account's spot
// wins for each kind, this device adds kinds the account lacks, and the
// account's link wins over this device's.
export function joinConnections(account: Connections, device: Connections): Connections {
  const kinds = new Set(account.places.map((p) => p.kind));
  const places = [...account.places, ...device.places.filter((p) => !kinds.has(p.kind))].sort(byKind);
  const calendarLink = account.calendarLink ?? device.calendarLink;
  return calendarLink ? { places, calendarLink } : { places };
}

export function samePlaces(a: SyncedPlace[], b: SyncedPlace[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort(byKind);
  return [...a].sort(byKind).every((p, i) => p.kind === sorted[i].kind && p.lat === sorted[i].lat && p.lon === sorted[i].lon);
}

// What changed since the copy last agreed with the account: only that is
// sent, so a link changed on another computer isn't overwritten by a device
// that only moved Home.
export function changedFields(now: Connections, agreed: Connections): { places?: SyncedPlace[]; calendarLink?: string | null } {
  const changes: { places?: SyncedPlace[]; calendarLink?: string | null } = {};
  if (!samePlaces(now.places, agreed.places)) changes.places = now.places;
  if ((now.calendarLink ?? null) !== (agreed.calendarLink ?? null)) changes.calendarLink = now.calendarLink ?? null;
  return changes;
}
