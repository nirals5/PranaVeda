import { useCallback, useEffect, useRef, useState } from 'react';
import { WellnessProfile } from '../types';
import { Auth } from './useAuth';
import { fetchAccountProfile, saveAccountProfile } from '../lib/auth';
import { addOfferToAccount, ProfileOffer, profileOffer } from '../lib/profileOffer';

// While someone is signed in, the profile on this device is a copy of their
// account's. These two keys record that, so the copy can be taken away again:
//   OWNER_KEY  — whose account the device's profile currently belongs to.
//   BACKUP_KEY — the device's own profile from before sign-in, put back on
//                sign-out (absent if there was none).
const OWNER_KEY = 'pranaveda_profile_owner';
const BACKUP_KEY = 'pranaveda_profile_before_signin';
// Which offer of this device's details "Not now" answered (see profileOffer).
const DECLINED_KEY = 'pranaveda_profile_offer_declined';

const isEmpty = (profile: WellnessProfile) => !profile || Object.keys(profile).length === 0;

function readDeviceProfile(): WellnessProfile | null {
  try {
    return JSON.parse(read(BACKUP_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

// Keeps the wellness profile in line with the account:
//   - Sign-in, account has no profile yet: this device's profile becomes the
//     account's — the one-time import on first sign-in.
//   - Sign-in, account has one: it replaces the copy on this device, which is
//     how a profile built on one device appears on another. What the device
//     had and the account lacks is offered, and added only on a yes.
//   - Signed out by any route (sign-out, session ended, account deleted, or
//     found expired on a later visit): the account's copy is removed and the
//     device's own pre-sign-in profile is put back, so the next person to use
//     this device does not see it.
// While signed in, Amrita saves changes to the account herself during chat.
export function useProfileSync(auth: Auth, profile: WellnessProfile, replaceProfile: (profile: WellnessProfile) => void) {
  const syncedFor = useRef<string | null>(null);
  const latest = useRef(profile);
  latest.current = profile;
  const [declined, setDeclined] = useState(() => read(DECLINED_KEY));

  // Signed out: hand the device back.
  useEffect(() => {
    if (auth.status !== 'guest') return;
    syncedFor.current = null;
    if (read(OWNER_KEY) === null) return;
    const backup = read(BACKUP_KEY);
    let restored: WellnessProfile = {};
    try {
      restored = backup ? JSON.parse(backup) : {};
    } catch {}
    replaceProfile(restored);
    write(OWNER_KEY, null);
    write(BACKUP_KEY, null);
    write(DECLINED_KEY, null);
    setDeclined(null);
  }, [auth.status, replaceProfile]);

  // Signed in: take the account's profile (or give it this device's).
  useEffect(() => {
    const userId = auth.status === 'user' ? auth.user?.id : null;
    if (!userId || syncedFor.current === userId) return;
    syncedFor.current = userId;

    (async () => {
      try {
        const account = await fetchAccountProfile<WellnessProfile>();
        if (!account) {
          syncedFor.current = null; // offline or unavailable: try again next visit
          return;
        }
        const local = latest.current;

        // The first time this device's profile is taken over, keep the
        // device's own profile to put back later. On later visits the local
        // copy is already the account's and must not become the backup.
        if (read(OWNER_KEY) === null) write(BACKUP_KEY, isEmpty(local) ? null : JSON.stringify(local));
        write(OWNER_KEY, userId);

        if (account.version === 0) {
          if (isEmpty(local)) return;
          const saved = await saveAccountProfile(local, 0);
          // Normally what was just sent; if another device saved first, theirs.
          if (saved) replaceProfile(saved.profile);
          return;
        }
        replaceProfile(account.profile);
      } catch (err) {
        console.warn('Profile sync failed:', err);
        syncedFor.current = null;
      }
    })();
  }, [auth.status, auth.user?.id, replaceProfile]);

  const offer = auth.status === 'user' && read(OWNER_KEY) !== null ? profileOffer(readDeviceProfile(), profile) : null;

  const addOffer = useCallback(async () => {
    const device = readDeviceProfile();
    if (!device) return false;
    try {
      const stored = await addOfferToAccount(device, () => fetchAccountProfile<WellnessProfile>(), (merged, version) => saveAccountProfile(merged, version));
      if (stored) replaceProfile(stored);
      return stored !== null;
    } catch (err) {
      console.warn('Adding profile details failed:', err);
      return false;
    }
  }, [replaceProfile]);

  const declineOffer = useCallback((declinedOffer: ProfileOffer) => {
    write(DECLINED_KEY, declinedOffer.key);
    setDeclined(declinedOffer.key);
  }, []);

  return { profileOffer: offer && offer.key !== declined ? offer : null, addOffer, declineOffer };
}
