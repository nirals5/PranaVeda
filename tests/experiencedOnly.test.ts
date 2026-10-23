import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { getCatalog, resetCatalogCache } from '../api/_lib/catalog.js';
import { parseProfile } from '../api/_lib/profileSchema.js';
import {
  BUILT_IN_CATALOG,
  applyProfileUpdate,
  buildBreathworkCard,
  buildRitual,
  catalogPromptSummary,
  tooAdvanced,
} from '../api/index.js';

// G2: practices for experienced practitioners are offered only when the
// profile says the user is experienced; an unknown experience counts as not.

const EXPERIENCED_ONLY = ['bhastrika', 'bow', 'dancer', 'half_moon', 'warrior_3'];

const ritual = (poseId: string, breathworkId = 'sama_vritti') => ({
  title: 'Steady',
  description: 'x',
  summary: 'x',
  doshaTendency: 'Kapha',
  primaryEnergy: 'bright',
  poses: [
    { poseId, durationMinutes: 2 },
    { poseId: 'tadasana', durationMinutes: 2 },
  ],
  breathworkId,
  ayurvedic: { assessment: 'x', doshaPrimary: 'Kapha', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
  lifestyleTips: [],
});

describe('experienced-only practices', () => {
  it('are the five the Practice Library marks, in the built-in catalog too', () => {
    const marked = [...BUILT_IN_CATALOG.poses, ...BUILT_IN_CATALOG.breathwork].filter((x) => x.minExperience === 'experienced');
    expect(marked.map((x) => x.id).sort()).toEqual(EXPERIENCED_ONLY);
  });

  it.each([[{}], [{ experience: 'beginner' as const }], [{ experience: 'regular' as const }]])(
    'are held back from a profile of %j',
    (profile) => {
      const { error } = buildRitual(ritual('warrior_3'), profile, BUILT_IN_CATALOG, '');
      expect(error).toContain('warrior_3 (for experienced practitioners only');
      expect(error).toContain('ask how long they have practised');
    }
  );

  it('are offered to an experienced profile', () => {
    const { card, error } = buildRitual(ritual('warrior_3'), { experience: 'experienced' }, BUILT_IN_CATALOG, '');
    expect(error).toBeUndefined();
    expect(card.result.yogaPractice.poses[0].poseId).toBe('warrior_3');
  });

  it('leave every other practice as it was', () => {
    expect(buildRitual(ritual('triangle'), {}, BUILT_IN_CATALOG, '').error).toBeUndefined();
    expect(buildBreathworkCard({ breathworkId: 'nadi_shodhana' }, {}, BUILT_IN_CATALOG).error).toBeUndefined();
  });

  it('cover breath practices, in a ritual and on their own', () => {
    expect(buildRitual(ritual('triangle', 'bhastrika'), {}, BUILT_IN_CATALOG, '').error).toContain('bhastrika (for experienced');
    expect(buildBreathworkCard({ breathworkId: 'bhastrika' }, { experience: 'regular' }, BUILT_IN_CATALOG).error).toContain(
      'for experienced practitioners only; their experience is regular'
    );
    expect(buildBreathworkCard({ breathworkId: 'bhastrika' }, { experience: 'experienced' }, BUILT_IN_CATALOG).card).toBeDefined();
  });

  it('are marked in Amrita’s catalog', () => {
    const summary = catalogPromptSummary(BUILT_IN_CATALOG);
    expect(summary).toMatch(/- warrior_3 \(.*Experienced practitioners only\./);
    expect(summary).not.toMatch(/- tadasana \(.*Experienced practitioners only/);
  });

  it('check only the experienced mark', () => {
    expect(tooAdvanced({}, {})).toBe(false);
    expect(tooAdvanced({ minExperience: 'experienced' }, {})).toBe(true);
  });
});

describe('recording experience', () => {
  it('is something Amrita can set, and only to a known level', () => {
    expect(applyProfileUpdate({}, { set: { experience: 'experienced' } }).experience).toBe('experienced');
    expect(applyProfileUpdate({ experience: 'regular' }, { set: { experience: 'expert' } }).experience).toBe('regular');
    expect(applyProfileUpdate({ experience: 'regular' }, { addGoals: ['strength'] }).experience).toBe('regular');
  });

  it('is accepted in a stored profile, and only as a known level', () => {
    expect(parseProfile({ experience: 'beginner' })).toEqual({ experience: 'beginner' });
    expect(parseProfile({ experience: 'expert' })).toBeNull();
  });
});

// Against the configured database: the database marks the same practices.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('experienced-only practices in the database', () => {
  it('match the built-in catalog', async () => {
    resetCatalogCache();
    const catalog = await getCatalog(BUILT_IN_CATALOG);
    expect(catalog.source).toBe('database');
    const marked = [...catalog.poses, ...catalog.breathwork].filter((x) => x.minExperience === 'experienced');
    expect(marked.map((x) => x.id).sort()).toEqual(EXPERIENCED_ONLY);
  });
});
