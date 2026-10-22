import { describe, expect, it } from 'vitest';
import { conditionConflicts, profileConditionCodes } from '../api/_lib/catalog.js';
import type { CatalogCondition } from '../api/_lib/catalog.js';
import { BUILT_IN_CATALOG, BUILT_IN_CONDITIONS, toolsFor } from '../api/index.js';

// How a user's profile conditions ("bad knee", "high BP") are matched to the
// condition codes practices are avoided for.

// As in the Practice Library's Conditions tab.
const SHEET: CatalogCondition[] = [
  { code: 'knee_injury', label: 'Knee injury', userWords: ['bad knee', 'sore knees'] },
  { code: 'wrist_injury', label: 'Wrist injury', userWords: ['sore wrists', 'carpal tunnel'] },
  { code: 'lower_back_injury', label: 'Lower back injury', userWords: ['bad back', 'back pain'] },
  { code: 'pregnancy', label: 'Pregnancy', userWords: ['pregnant', 'expecting'] },
  { code: 'hypertension', label: 'High blood pressure', userWords: ['high BP'] },
  { code: 'balance_issues', label: 'Balance issues', userWords: ['unsteady', 'vertigo'] },
];
const ALL = SHEET.map((c) => c.code);

// The text match used before, kept so the new matching is never stricter.
const older = (tags: string[], said: string[]) => {
  const normalized = said.map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  return tags.filter((tag) => normalized.some((c) => c.includes(tag) || tag.includes(c)));
};

describe('condition matching', () => {
  it.each([
    ['bad knee', 'knee_injury'],
    ['Sore knees after running', 'knee_injury'],
    ['knee injury', 'knee_injury'],
    ['knee_injury', 'knee_injury'],
    ['high BP', 'hypertension'],
    ['High blood pressure', 'hypertension'],
    ['pregnant', 'pregnancy'],
    ['6 months pregnant', 'pregnancy'],
    ['back pain', 'lower_back_injury'],
    ['carpal tunnel', 'wrist_injury'],
    ['vertigo', 'balance_issues'],
  ])('"%s" → %s', (said, code) => {
    expect([...profileConditionCodes([said], SHEET)]).toEqual([code]);
    expect(conditionConflicts(ALL, [said], SHEET)).toEqual([code]);
  });

  it('matches whole words only', () => {
    expect([...profileConditionCodes(['kneeling practice is fine', 'expectations are low'], SHEET)]).toEqual([]);
  });

  it('only rules out what the practice lists', () => {
    expect(conditionConflicts(['wrist_injury', 'glaucoma'], ['bad knee', 'carpal tunnel'], SHEET)).toEqual(['wrist_injury']);
    expect(conditionConflicts(ALL, [], SHEET)).toEqual([]);
    expect(conditionConflicts(ALL, undefined, SHEET)).toEqual([]);
  });

  it('is never stricter than the text match it replaces', () => {
    const said = ['knee', 'wrist', 'hypertension', 'pregnancy', 'something else entirely', 'lower back'];
    for (const s of said) {
      for (const tag of older(ALL, [s])) expect(conditionConflicts(ALL, [s], SHEET), `${s}: ${tag}`).toContain(tag);
    }
  });

  it('keeps the built-in catalog safe for profiles that say "vertigo"', () => {
    const halfMoon = BUILT_IN_CATALOG.poseById.get('half_moon')!;
    expect(conditionConflicts(halfMoon.contraindications, ['vertigo'], BUILT_IN_CONDITIONS)).toContain('vertigo');
  });
});

describe('profile tool', () => {
  it('lists the served conditions for Amrita to record', () => {
    const tool = toolsFor({ ...BUILT_IN_CATALOG, conditions: SHEET }).find((t) => t.name === 'update_wellness_profile')!;
    const description = (tool.input_schema as any).properties.addConditions.description as string;
    expect(description).toContain('knee_injury (Knee injury)');
    expect(description).toContain('balance_issues (Balance issues)');
    expect(description).not.toContain('vertigo');
  });

  it('leaves the other tools as they are', () => {
    const names = toolsFor(BUILT_IN_CATALOG).map((t) => t.name);
    expect(names).toContain('create_ritual');
    expect(toolsFor(BUILT_IN_CATALOG).find((t) => t.name === 'create_ritual')).toBe(
      toolsFor({ ...BUILT_IN_CATALOG, conditions: SHEET }).find((t) => t.name === 'create_ritual')
    );
  });
});
