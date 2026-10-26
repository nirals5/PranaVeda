import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { getCatalog, resetCatalogCache } from '../api/_lib/catalog.js';
import { parseProfile } from '../api/_lib/profileSchema.js';
import {
  AFTER_MEAL_MINUTES,
  BUILT_IN_CATALOG,
  applyProfileUpdate,
  buildBreathworkCard,
  buildRitual,
  buildSystemPrompt,
  catalogPromptSummary,
  minutesSinceMeal,
  tooSoonAfterMeal,
} from '../api/index.js';

// G7: for two hours after a meal, practices the Practice Library marks
// avoid_after_meal (inversions, strong backbends, strong core work, vigorous
// breathing) are not offered.

const AFTER_MEAL = [
  'bhastrika', 'bow', 'cobra', 'dancer', 'downward_dog', 'forearm_plank',
  'legs_up_the_wall', 'side_plank', 'standing_forward_fold', 'wide_legged_forward_fold',
];

const NOW = new Date('2026-10-25T13:00:00Z');
const ateAgo = (minutes: number) => ({ lastMealAt: new Date(NOW.getTime() - minutes * 60_000).toISOString() });
// Experienced, so the G2 check does not refuse bow, dancer or bhastrika first.
const fed = (minutes: number) => ({ experience: 'experienced' as const, ...ateAgo(minutes) });

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

describe('after-meal practices', () => {
  it('are the ten the Practice Library marks, in the built-in catalog too', () => {
    const marked = [...BUILT_IN_CATALOG.poses, ...BUILT_IN_CATALOG.breathwork].filter((x) => x.avoidAfterMeal);
    expect(marked.map((x) => x.id).sort()).toEqual(AFTER_MEAL);
  });

  it('are refused within two hours of a meal, saying why and what to offer instead', () => {
    const { error } = buildRitual(ritual('downward_dog'), fed(45), BUILT_IN_CATALOG, '', NOW);
    expect(error).toContain('downward_dog (not within two hours of a meal; they ate about 45 minutes ago)');
    expect(error).toContain('help digestion');
  });

  it('are offered again once two hours have passed, or when no meal is known', () => {
    expect(buildRitual(ritual('downward_dog'), fed(AFTER_MEAL_MINUTES), BUILT_IN_CATALOG, '', NOW).error).toBeUndefined();
    expect(buildRitual(ritual('downward_dog'), { experience: 'experienced' }, BUILT_IN_CATALOG, '', NOW).error).toBeUndefined();
    expect(buildRitual(ritual('downward_dog'), fed(AFTER_MEAL_MINUTES - 1), BUILT_IN_CATALOG, '', NOW).error).toBeDefined();
  });

  it('leave every other practice as it was after a meal', () => {
    expect(buildRitual(ritual('wind_relieving', 'nadi_shodhana'), fed(10), BUILT_IN_CATALOG, '', NOW).error).toBeUndefined();
    expect(buildBreathworkCard({ breathworkId: 'nadi_shodhana' }, fed(10), BUILT_IN_CATALOG, NOW).error).toBeUndefined();
  });

  it('cover breath practices, in a ritual and on their own', () => {
    expect(buildRitual(ritual('triangle', 'bhastrika'), fed(30), BUILT_IN_CATALOG, '', NOW).error).toContain('bhastrika (not within two hours of a meal');
    expect(buildBreathworkCard({ breathworkId: 'bhastrika' }, fed(30), BUILT_IN_CATALOG, NOW).error).toContain(
      'bhastrika is not within two hours of a meal; they ate about 30 minutes ago'
    );
    expect(buildBreathworkCard({ breathworkId: 'bhastrika' }, fed(180), BUILT_IN_CATALOG, NOW).card).toBeDefined();
  });

  it('are marked in Amrita’s catalog', () => {
    const summary = catalogPromptSummary(BUILT_IN_CATALOG);
    expect(summary).toMatch(/- cobra \(.*Not within 2 hours of a meal\./);
    expect(summary).not.toMatch(/- wind_relieving \(.*Not within 2 hours of a meal/);
  });

  it('count a meal time in the future (a clock out of step) as just now, and ignore a broken one', () => {
    expect(minutesSinceMeal(ateAgo(-30), NOW)).toBe(0);
    expect(minutesSinceMeal({ lastMealAt: 'lunchtime' }, NOW)).toBeNull();
    expect(tooSoonAfterMeal({ avoidAfterMeal: true }, { lastMealAt: 'lunchtime' }, NOW)).toBe(false);
    expect(tooSoonAfterMeal({}, ateAgo(5), NOW)).toBe(false);
  });
});

describe('recording a meal', () => {
  it('is something Amrita records from how long ago they ate', () => {
    expect(applyProfileUpdate({}, { ateMinutesAgo: 40 }, '2026-10-25', NOW).lastMealAt).toBe('2026-10-25T12:20:00.000Z');
    expect(applyProfileUpdate({}, { ateMinutesAgo: 0 }, '2026-10-25', NOW).lastMealAt).toBe(NOW.toISOString());
    expect(applyProfileUpdate({}, { ateMinutesAgo: '15' }, '2026-10-25', NOW).lastMealAt).toBe('2026-10-25T12:45:00.000Z');
  });

  it('ignores a value that is not a sensible number of minutes', () => {
    for (const ateMinutesAgo of [-5, 24 * 60 + 1, 'soon', '', null, true]) {
      expect(applyProfileUpdate(ateAgo(300), { ateMinutesAgo }, '2026-10-25', NOW).lastMealAt).toBe(ateAgo(300).lastMealAt);
    }
    expect(applyProfileUpdate({}, { addGoals: ['calm'] }, '2026-10-25', NOW)).not.toHaveProperty('lastMealAt');
  });

  it('is accepted in a stored profile', () => {
    expect(parseProfile(ateAgo(10))).toEqual(ateAgo(10));
  });
});

describe('telling Amrita', () => {
  const prompt = (profile: object) =>
    buildSystemPrompt(profile, 'now', 'text', undefined, undefined, undefined, undefined, undefined, undefined, null, NOW);

  it('says how long ago they ate and how long to stay gentle, within two hours', () => {
    const text = prompt(ateAgo(50));
    expect(text).toContain('# After a meal');
    expect(text).toContain('They ate about 50 minutes ago. For about 70 more minutes');
  });

  it('says nothing about a meal two hours ago or more, or with none recorded', () => {
    expect(prompt(ateAgo(AFTER_MEAL_MINUTES))).not.toContain('# After a meal');
    expect(prompt({})).not.toContain('# After a meal');
  });

  it('always asks her to record meals', () => {
    expect(prompt({})).toContain("record it with update_wellness_profile's ateMinutesAgo");
  });
});

// Against the configured database: the database marks the same practices.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('after-meal practices in the database', () => {
  it('match the built-in catalog', async () => {
    resetCatalogCache();
    const catalog = await getCatalog(BUILT_IN_CATALOG);
    expect(catalog.source).toBe('database');
    const marked = [...catalog.poses, ...catalog.breathwork].filter((x) => x.avoidAfterMeal);
    expect(marked.map((x) => x.id).sort()).toEqual(AFTER_MEAL);
  });
});
