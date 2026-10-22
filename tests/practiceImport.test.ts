import { describe, expect, it } from 'vitest';
import type { Tabs } from '../db/food/parse.js';
import { HEADERS, isoDate, list, parsePracticeLibrary } from '../db/practice/parse.js';

// A tiny sheet in the real layout; each test changes only what it is about.
type Cells = Record<string, string>;
type Tab = keyof typeof HEADERS;
const grid = (headers: readonly string[], rows: Cells[]) => [[...headers], ...rows.map((r) => headers.map((h) => r[h] ?? ''))];

const tagged: Cells = {
  where_shown: 'right_now',
  min_experience: 'any',
  intensity: 'gentle',
  setting: 'floor',
  effect: 'calming; grounding',
  vata: 'balances',
  pitta: 'balances',
  kapha: 'neutral',
  best_time: 'evening; any',
  needs_served: 'N1',
  basis: 'AI-drafted',
  status: 'draft',
};
const pose = (overrides: Cells = {}): Cells => ({
  id: 'P09',
  app_id: 'childs_pose',
  type: 'asana',
  name_sanskrit: 'Balasana',
  name_english: "Child's Pose",
  duration_min: '1.5',
  avoid_conditions: 'knee_injury',
  caution_conditions: 'pregnancy',
  avoid_notes: 'Late pregnancy: widen knees.',
  cues: 'Sink hips toward heels; Let the forehead rest down',
  ...tagged,
  ...overrides,
});
const breath = (overrides: Cells = {}): Cells => ({
  id: 'B01',
  type: 'pranayama',
  name_sanskrit: 'Nadi Shodhana',
  name_english: 'Alternate Nostril Breathing',
  inhale_sec: '4',
  hold_in_sec: '4',
  exhale_sec: '6',
  hold_out_sec: '0',
  cycles: '10',
  classical_source_id: 'S4',
  ...tagged,
  ...overrides,
});

const listsRows: Cells[] = [
  { type: 'asana', where_shown: 'right_now', min_experience: 'any', intensity: 'gentle', dosha_effect: 'balances', effect: 'grounding', setting: 'floor', best_time: 'morning', best_weather: 'hot', status: 'draft', rule_kind: 'guardrail' },
  { type: 'pranayama', where_shown: 'explore_only', min_experience: 'experienced', intensity: 'moderate', dosha_effect: 'neutral', effect: 'calming', setting: 'standing', best_time: 'midday', best_weather: 'cold', status: 'reviewed', rule_kind: 'hint' },
  { where_shown: 'hidden', intensity: 'strong', dosha_effect: 'aggravates', effect: 'energizing', setting: 'chair', best_time: 'evening', best_weather: 'any', status: 'approved' },
  { effect: 'warming', setting: 'lying', best_time: 'any' },
  { effect: 'cooling', best_time: 'after_meals' },
  { effect: 'balancing' },
  { effect: 'digestive' },
  { effect: 'focusing' },
  { effect: 'restorative' },
];

function sheet(over: Partial<Record<Tab, Cells[]>> = {}): Tabs {
  const rows: Record<Tab, Cells[]> = {
    Practices: [pose(), breath()],
    Needs: [{ need_id: 'N1', need: 'Ground', effects_that_serve: 'grounding; calming', practices_available: '2' }],
    Rules: [
      { rule_id: 'G1', kind: 'guardrail', when: 'A condition is in avoid_conditions', then: 'Remove it', principle_id: 'PR1', status: 'draft' },
      { rule_id: 'H1', kind: 'hint', when: 'Morning', then: 'Lean toward N3', status: 'draft' },
    ],
    Principles: [{ principle_id: 'PR1', 'statement (plain language)': 'Like increases like.', source_id: 'S3; S4', status: 'draft' }],
    Sources: [
      { source_id: 'S3', title: 'Charaka Samhita', status: 'approved' },
      { source_id: 'S4', title: 'Hatha Yoga Pradipika', status: 'approved' },
    ],
    Conditions: [
      { code: 'knee_injury', label: 'Knee injury', user_words: 'bad knee; sore knees' },
      { code: 'pregnancy', label: 'Pregnancy', user_words: 'pregnant' },
    ],
    Lists: listsRows,
    'All Poses': [{ ID: 'P09', 'Sanskrit Name': 'Balasana', 'Flow / Course(s)': 'Hatha Yoga (yoga-styles); Stress relief (life-style-yoga)', 'Steps (source text)': 'Kneel.' }],
    ...over,
  };
  return Object.fromEntries(Object.entries(rows).map(([tab, r]) => [tab, grid(HEADERS[tab as Tab], r)]));
}

describe('practice library import', () => {
  it('reads a clean sheet with no errors', () => {
    const { library, errors, warnings } = parsePracticeLibrary(sheet());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    const [p09, b01] = library.practices;
    expect(p09).toMatchObject({
      id: 'P09',
      appId: 'childs_pose',
      durationMin: 1.5,
      effects: ['calming', 'grounding'],
      bestTimes: ['evening', 'any'],
      cues: ['Sink hips toward heels', 'Let the forehead rest down'],
      status: 'draft',
    });
    expect(b01).toMatchObject({ inhaleSec: 4, holdInSec: 4, exhaleSec: 6, holdOutSec: 0, cycles: 10, classicalSourceId: 'S4' });
    expect(library.practiceConditions).toEqual([
      { practiceId: 'P09', conditionCode: 'knee_injury', level: 'avoid' },
      { practiceId: 'P09', conditionCode: 'pregnancy', level: 'caution' },
    ]);
    expect(library.practiceNeeds).toEqual([
      { practiceId: 'P09', needId: 'N1' },
      { practiceId: 'B01', needId: 'N1' },
    ]);
    expect(library.conditions[0].userWords).toEqual(['bad knee', 'sore knees']);
    expect(library.principleSources).toEqual([
      { principleId: 'PR1', sourceId: 'S3' },
      { principleId: 'PR1', sourceId: 'S4' },
    ]);
    expect(library.rulePrinciples).toEqual([{ ruleId: 'G1', principleId: 'PR1' }]);
  });

  it('reads the Yogism flows and source text', () => {
    const { library } = parsePracticeLibrary(sheet());
    expect(library.flows).toEqual([
      { id: 'hatha_yoga_yoga_styles', name: 'Hatha Yoga', category: 'yoga-styles' },
      { id: 'stress_relief_life_style_yoga', name: 'Stress relief', category: 'life-style-yoga' },
    ]);
    expect(library.flowMembers.map((m) => m.practiceId)).toEqual(['P09', 'P09']);
    expect(library.sourceText[0]).toMatchObject({ practiceId: 'P09', steps: 'Kneel.' });
  });

  it('refuses references that point nowhere', () => {
    const { errors } = parsePracticeLibrary(
      sheet({ Practices: [pose({ counter_pose_id: 'P99', avoid_conditions: 'knee_injury; vertigo', needs_served: 'N1; N7' }), breath()] })
    );
    expect(errors).toEqual([
      'Practices row 2 (P09): counter_pose_id P99 is not a practice id.',
      'Practices row 2 (P09): avoid_conditions has "vertigo", which is not on its list.',
      'Practices row 2 (P09): needs_served has "N7", which is not on its list.',
    ]);
  });

  it('refuses a condition that is both avoid and caution', () => {
    const { errors } = parsePracticeLibrary(sheet({ Practices: [pose({ caution_conditions: 'knee_injury' }), breath()] }));
    expect(errors).toEqual(['Practices row 2 (P09): knee_injury is in both avoid_conditions and caution_conditions.']);
  });

  it('keeps breath counts to breath practices, and P and B ids to their types', () => {
    const { errors } = parsePracticeLibrary(sheet({ Practices: [pose({ cycles: '5' }), breath({ type: 'asana' })] }));
    expect(errors).toEqual([
      'Practices row 2 (P09): breath counts and breath_description are for breath practices only.',
      'Practices row 3 (B01): P ids are poses (asana) and B ids are breath practices (pranayama).',
      'Practices row 3 (B01): breath counts and breath_description are for breath practices only.',
    ]);
  });

  it('requires a merged practice to be hidden', () => {
    const merged = pose({ id: 'P20', app_id: '', merged_into: 'P09', where_shown: 'right_now', status: '' });
    expect(parsePracticeLibrary(sheet({ Practices: [pose(), merged, breath()] })).errors).toEqual([
      'Practices row 3 (P20): a merged practice must have where_shown = hidden.',
    ]);
  });

  it('requires a reviewer and date before a row counts as reviewed', () => {
    const { errors, library } = parsePracticeLibrary(
      sheet({ Practices: [pose({ status: 'approved' }), breath({ status: 'reviewed', reviewed_by: 'Sneha Desai', reviewed_on: '10/22/2026' })] })
    );
    expect(errors).toEqual(['Practices row 2 (P09): status "approved" needs reviewed_by and reviewed_on.']);
    expect(library.practices.find((p) => p.id === 'B01')).toMatchObject({ reviewedBy: 'Sneha Desai', reviewedOn: '2026-10-22' });
  });

  it('stops when Lists has a value the importer does not know', () => {
    const lists = listsRows.map((r, i) => (i === 3 ? { ...r, setting: 'mat' } : r));
    expect(parsePracticeLibrary(sheet({ Lists: lists })).errors).toEqual([
      'Lists › setting: mat is not known to the importer; add it to db/schema.ts first.',
    ]);
  });

  it('warns about practices that are untagged or partly tagged', () => {
    const untagged = { id: 'P47', type: 'asana', name_sanskrit: 'Kapotasana', name_english: 'Pigeon', status: 'draft' };
    const partly = pose({ id: 'P10', app_id: '', vata: '', pitta: '' });
    expect(parsePracticeLibrary(sheet({ Practices: [pose(), partly, untagged, breath()] })).warnings).toEqual([
      '1 practices have no recommendation tags yet, so the engine skips them.',
      'Partly tagged, so the engine skips them: P10 (missing vata, pitta).',
    ]);
  });

  it('stops when a tab gains, loses or renames a column', () => {
    const tabs = sheet();
    tabs.Conditions[0] = ['code', 'label', 'words'];
    expect(parsePracticeLibrary(tabs).errors[0]).toMatch(/^Conditions: columns are \[code, label, words\]/);
  });
});

describe('practice library helpers', () => {
  it('splits ";" lists without repeats, in order', () => {
    expect(list('evening; any; evening')).toEqual(['evening', 'any']);
    expect(list('')).toEqual([]);
  });

  it('reads dates written either way', () => {
    expect(isoDate('2026-10-22')).toBe('2026-10-22');
    expect(isoDate('1/5/2026')).toBe('2026-01-05');
    expect(isoDate('')).toBeNull();
    expect(isoDate('next week')).toBeUndefined();
  });
});
