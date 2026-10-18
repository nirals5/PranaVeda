import { SavedPractice } from '../types';

// How a device's saved rituals and the account's list come together, after
// this device has sent what it saved and removed. The iOS and Android apps
// follow the same rules (SavedRituals.swift, SavedRituals.kt).
//
//   synced         — ids this device knows the account has.
//   pendingRemoves — ids removed here that the account has not heard about yet.
//
// A ritual the account no longer lists, that this device knew it had, was
// removed elsewhere and goes. One the account has and this device does not
// (and did not just remove) was saved elsewhere and arrives. Anything not yet
// synced stays: it is still on its way up.
export function reconcileSaved(
  local: SavedPractice[],
  account: SavedPractice[],
  synced: Set<string>,
  pendingRemoves: Set<string>
): { rituals: SavedPractice[]; synced: string[] } {
  const accountIds = new Set(account.map((r) => r.id));
  const kept = local.filter((r) => !(synced.has(r.id) && !accountIds.has(r.id)));
  const keptIds = new Set(kept.map((r) => r.id));
  const arrived = account.filter((r) => !keptIds.has(r.id) && !pendingRemoves.has(r.id));
  const rituals = [...arrived, ...kept].sort((a, b) => savedMillis(b.id) - savedMillis(a.id));
  return { rituals, synced: [...accountIds].filter((id) => !pendingRemoves.has(id)) };
}

// When a ritual was saved, from its id ("save_1760000000000" or
// "save_1760000000000_ab12c", "temp_…"): newest first. 0 if unknown.
export function savedMillis(id: string): number {
  const match = /_(\d{12,})/.exec(id);
  return match ? Number(match[1]) : 0;
}
