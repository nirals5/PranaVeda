import { describe, expect, it } from 'vitest';
import { addOfferToAccount, describeOffer, mergeOffer, profileOffer } from '../src/lib/profileOffer';
import type { WellnessProfile } from '../src/types';

// What a device knew before sign-in that the account doesn't, and adding it
// when the person says yes (useProfileSync).

describe('profileOffer', () => {
  it('lists what the account lacks, conditions first', () => {
    const offer = profileOffer(
      { goals: ['Sleep better'], conditions: ['Bad knee', 'High BP'], preferences: ['Mornings'] },
      { conditions: ['High BP'] }
    );
    expect(offer?.items).toEqual(['Bad knee', 'Goal: Sleep better', 'Preference: Mornings']);
    expect(offer?.health).toBe(1);
  });

  it('treats capitals and spacing as the same detail', () => {
    expect(profileOffer({ conditions: ['  bad   KNEE '] }, { conditions: ['Bad knee'] })).toBeNull();
  });

  it("offers single details only when the account has none, and never replaces the account's", () => {
    const offer = profileOffer(
      { name: 'Device', prakriti: 'Vata', experience: 'experienced' },
      { name: 'Account', prakriti: '' }
    );
    expect(offer?.items).toEqual(['Constitution: Vata', 'Experience: Experienced']);
  });

  it("doesn't ask about Amrita's own notes alone", () => {
    const device: WellnessProfile = {
      observations: [{ date: '2026-10-31', note: 'Slept well' }],
      practiceHistory: [{ date: '2026-10-31', title: 'Box', kind: 'breathwork' }],
    };
    expect(profileOffer(device, {})).toBeNull();
  });

  it('asks nothing without a device copy, or when nothing is missing', () => {
    expect(profileOffer(null, { conditions: ['Bad knee'] })).toBeNull();
    expect(profileOffer({ conditions: ['Bad knee'] }, { conditions: ['Bad knee'], goals: ['More'] })).toBeNull();
  });

  it('gives the same key however the details are ordered', () => {
    const a = profileOffer({ conditions: ['One', 'Two'] }, {});
    const b = profileOffer({ conditions: ['two', 'one'] }, {});
    expect(a?.key).toBe(b?.key);
  });
});

describe('describeOffer', () => {
  const describing = (device: WellnessProfile) => describeOffer(profileOffer(device, {})!);

  it('names health details only when there are some', () => {
    expect(describing({ conditions: ['One'] })).toBe("This device has 1 health detail your account doesn't have.");
    expect(describing({ conditions: ['One', 'Two'] })).toBe("This device has 2 health details your account doesn't have.");
    expect(describing({ goals: ['One'] })).toBe("This device has 1 detail your account doesn't have.");
    expect(describing({ conditions: ['One'], goals: ['Two'] })).toBe(
      "This device has 2 details, including health details, your account doesn't have."
    );
  });
});

describe('mergeOffer', () => {
  it("adds what's missing and changes nothing the account has", () => {
    const account: WellnessProfile = { name: 'Account', conditions: ['High BP'], prakriti: 'Pitta', prakritiConfidence: 'high' };
    const merged = mergeOffer(
      { name: 'Device', conditions: ['high bp', 'Bad knee'], goals: ['Sleep'], prakriti: 'Vata', prakritiConfidence: 'low', experience: 'regular' },
      account
    );
    expect(merged).toEqual({
      name: 'Account',
      conditions: ['High BP', 'Bad knee'],
      goals: ['Sleep'],
      prakriti: 'Pitta',
      prakritiConfidence: 'high',
      experience: 'regular',
    });
  });

  it("brings Amrita's notes along without repeats", () => {
    const shared = { date: '2026-10-30', title: 'Box', kind: 'breathwork' as const };
    const added = { date: '2026-10-31', title: 'Morning', kind: 'ritual' as const };
    const merged = mergeOffer({ conditions: ['One'], practiceHistory: [shared, added] }, { practiceHistory: [shared] });
    expect(merged.practiceHistory).toEqual([shared, added]);
  });

  it('keeps every list within what the server allows', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Account ${i}`);
    const merged = mergeOffer({ conditions: ['Extra'] }, { conditions: many });
    expect(merged.conditions).toEqual(many);
    expect(profileOffer({ conditions: ['Extra'] }, merged)?.items).toEqual(['Extra']);
  });

  it('leaves nothing to offer afterwards', () => {
    const device: WellnessProfile = { conditions: ['One'], goals: ['Two'], name: 'N', vikriti: 'Vata', experience: 'regular' };
    expect(profileOffer(device, mergeOffer(device, { name: 'Other' }))).toBeNull();
  });
});

describe('addOfferToAccount', () => {
  const device: WellnessProfile = { conditions: ['Bad knee'] };

  it('saves on the version it read', async () => {
    const versions: number[] = [];
    const stored = await addOfferToAccount(
      device,
      async () => ({ profile: { goals: ['Sleep'] }, version: 3 }),
      async (profile, version) => {
        versions.push(version);
        return { profile, version: version + 1 };
      }
    );
    expect(versions).toEqual([3]);
    expect(stored).toEqual({ goals: ['Sleep'], conditions: ['Bad knee'] });
  });

  it("retries once on what another device saved, keeping that device's change", async () => {
    const versions: number[] = [];
    const stored = await addOfferToAccount(
      device,
      async () => ({ profile: {}, version: 3 }),
      async (profile, version) => {
        versions.push(version);
        return version === 3 ? { profile: { goals: ['Theirs'] }, version: 4 } : { profile, version: version + 1 };
      }
    );
    expect(versions).toEqual([3, 4]);
    expect(stored).toEqual({ goals: ['Theirs'], conditions: ['Bad knee'] });
  });

  it('gives up after a second conflict, or when the server is unavailable', async () => {
    let saves = 0;
    const busy = await addOfferToAccount(device, async () => ({ profile: {}, version: 1 }), async () => {
      saves++;
      return { profile: {}, version: 1 + saves };
    });
    expect(busy).toBeNull();
    expect(saves).toBe(2);
    expect(await addOfferToAccount(device, async () => null, async () => null)).toBeNull();
    expect(await addOfferToAccount(device, async () => ({ profile: {}, version: 1 }), async () => null)).toBeNull();
  });
});
