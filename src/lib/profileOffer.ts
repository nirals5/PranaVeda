import { WellnessProfile } from '../types';

// What this device knew before sign-in that the account doesn't. Signed in, the
// account is the profile, so without this a condition entered only here would
// quietly stop reaching Amrita. Nothing moves until the person says yes: the
// details could be someone else's, and they can be about health. The iOS and
// Android apps follow the same rules (ProfileOffer).

const LISTS = ['conditions', 'goals', 'preferences'] as const;
// The server's limit on each list (api/_lib/profileSchema.ts).
const MAX_ITEMS = 60;

export interface ProfileOffer {
  // What to show, in order: conditions first.
  items: string[];
  // How many of them are health conditions.
  health: number;
  // Identifies this offer, so "Not now" holds until the device's copy changes.
  key: string;
}

const same = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const blank = (value: unknown) => value === undefined || value === null || value === '';
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function missingFrom(account: string[] | undefined, device: string[] | undefined): string[] {
  const seen = new Set((account ?? []).map(same));
  const missing: string[] = [];
  for (const item of device ?? []) {
    const key = same(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    missing.push(item.trim());
  }
  return missing;
}

// The offer, or null when the account already has everything worth asking
// about. Observations and practice history are Amrita's notes rather than
// something the person entered, so alone they don't prompt a question.
export function profileOffer(device: WellnessProfile | null, account: WellnessProfile): ProfileOffer | null {
  if (!device) return null;
  const conditions = missingFrom(account.conditions, device.conditions);
  const items = [
    ...conditions,
    ...missingFrom(account.goals, device.goals).map((goal) => `Goal: ${goal}`),
    ...missingFrom(account.preferences, device.preferences).map((preference) => `Preference: ${preference}`),
  ];
  if (blank(account.name) && !blank(device.name)) items.push(`Name: ${device.name}`);
  if (blank(account.prakriti) && !blank(device.prakriti)) items.push(`Constitution: ${device.prakriti}`);
  if (blank(account.vikriti) && !blank(device.vikriti)) items.push(`Current imbalance: ${device.vikriti}`);
  if (!account.doshaProfile && device.doshaProfile) items.push(`Dosha result: ${device.doshaProfile.primary}`);
  if (blank(account.experience) && device.experience) items.push(`Experience: ${capitalized(device.experience)}`);
  if (items.length === 0) return null;
  return { items, health: conditions.length, key: JSON.stringify(items.map(same).sort()) };
}

// "1 health detail", or "3 details, including health details", and so on.
export function describeOffer(offer: ProfileOffer): string {
  const count = offer.items.length;
  const what =
    offer.health === count
      ? `${count} health ${count === 1 ? 'detail' : 'details'}`
      : `${count} ${count === 1 ? 'detail' : 'details'}${offer.health > 0 ? ', including health details,' : ''}`;
  return `This device has ${what} your account doesn't have.`;
}

function addEntries<T>(account: T[] | undefined, device: T[] | undefined): T[] | undefined {
  if (!device?.length) return account;
  const seen = new Set((account ?? []).map((entry) => JSON.stringify(entry)));
  const merged = [...(account ?? [])];
  for (const entry of device) {
    if (merged.length >= MAX_ITEMS) break;
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

// The account's profile with this device's details added. Nothing the account
// already has is changed or removed.
export function mergeOffer(device: WellnessProfile, account: WellnessProfile): WellnessProfile {
  const merged: WellnessProfile = { ...account };
  for (const list of LISTS) {
    const missing = missingFrom(account[list], device[list]);
    if (missing.length) merged[list] = [...(account[list] ?? []), ...missing].slice(0, MAX_ITEMS);
  }
  if (blank(account.name) && !blank(device.name)) merged.name = device.name;
  if (blank(account.prakriti) && !blank(device.prakriti)) {
    merged.prakriti = device.prakriti;
    if (device.prakritiConfidence) merged.prakritiConfidence = device.prakritiConfidence;
  }
  if (blank(account.vikriti) && !blank(device.vikriti)) merged.vikriti = device.vikriti;
  if (!account.doshaProfile && device.doshaProfile) merged.doshaProfile = device.doshaProfile;
  if (blank(account.experience) && device.experience) merged.experience = device.experience;
  const observations = addEntries(account.observations, device.observations);
  if (observations) merged.observations = observations;
  const practiceHistory = addEntries(account.practiceHistory, device.practiceHistory);
  if (practiceHistory) merged.practiceHistory = practiceHistory;
  return merged;
}

interface Versioned {
  profile: WellnessProfile;
  version: number;
}

// Adds the details starting from the account's latest copy. If another device
// saved first, the save returns theirs with the details still missing, so it
// tries once more on that. The stored profile on success, otherwise null.
export async function addOfferToAccount(
  device: WellnessProfile,
  load: () => Promise<Versioned | null>,
  save: (profile: WellnessProfile, baseVersion: number) => Promise<Versioned | null>
): Promise<WellnessProfile | null> {
  let account = await load();
  for (let attempt = 0; account && attempt < 2; attempt++) {
    const saved = await save(mergeOffer(device, account.profile), account.version);
    if (saved && !profileOffer(device, saved.profile)) return saved.profile;
    account = saved;
  }
  return null;
}
