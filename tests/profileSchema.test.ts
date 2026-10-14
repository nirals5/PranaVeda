import { describe, expect, it } from 'vitest';
import { MAX_PROFILE_BYTES, parseProfile } from '../api/_lib/profileSchema.js';

describe('parseProfile', () => {
  it('accepts an empty profile and a full one', () => {
    expect(parseProfile({})).toEqual({});
    const full = {
      name: 'Asha',
      prakriti: 'Vata-Pitta',
      prakritiConfidence: 'medium',
      doshaProfile: {
        primary: 'Vata', secondary: 'Pitta', balance: { vata: 50, pitta: 30, kapha: 20 },
        essence: 'Airy', explanation: 'Because…', guidance: ['Warm meals'], confidence: 'medium', assessedDate: '2026-10-13',
      },
      goals: ['sleep better'],
      conditions: ['knee_injury'],
      preferences: ['evening practice'],
      observations: [{ date: '2026-10-13', note: 'slept poorly' }],
      practiceHistory: [{ date: '2026-10-13', title: 'Evening wind-down', kind: 'ritual' }],
    };
    expect(parseProfile(full)).toEqual(full);
  });

  it('keeps fields it does not know, so a newer profile shape survives an older server', () => {
    expect(parseProfile({ name: 'Asha', seasonalNotes: ['autumn: grounding'] })).toEqual({ name: 'Asha', seasonalNotes: ['autumn: grounding'] });
  });

  it('refuses malformed profiles', () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile('a string')).toBeNull();
    expect(parseProfile({ goals: 'sleep better' })).toBeNull();
    expect(parseProfile({ prakritiConfidence: 'certain' })).toBeNull();
    expect(parseProfile({ practiceHistory: [{ date: '2026-10-13', title: 'x', kind: 'nap' }] })).toBeNull();
    expect(parseProfile({ name: 'x'.repeat(81) })).toBeNull();
  });

  it('refuses a profile over the size cap', () => {
    const huge = { notes: 'x'.repeat(MAX_PROFILE_BYTES) };
    expect(parseProfile(huge)).toBeNull();
  });
});
