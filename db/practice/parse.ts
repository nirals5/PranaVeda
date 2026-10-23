import type { Tabs } from '../food/parse.js';
import { slug } from '../food/parse.js';
import {
  BEST_TIMES,
  CONDITION_LEVELS,
  DOSHA_EFFECTS,
  INTENSITIES,
  MIN_EXPERIENCE,
  PRACTICE_BASIS,
  PRACTICE_EFFECTS,
  PRACTICE_TYPES,
  REVIEW_STATUSES,
  RULE_KINDS,
  SETTINGS,
  SOURCE_LEVELS,
  SOURCE_STATUSES,
  WEATHER,
  WHERE_SHOWN,
} from '../schema.js';

// Turns the Practice Library sheet (one string grid per tab) into rows for the
// practice tables, checking everything first. Errors block the import;
// warnings are recorded with it. Pure: no files, no database.

type Of<T extends readonly string[]> = T[number];
type Review = { status: Of<typeof REVIEW_STATUSES>; reviewedBy: string | null; reviewedOn: string | null };

export interface Practice extends Review {
  id: string;
  appId: string | null;
  type: Of<typeof PRACTICE_TYPES>;
  nameSanskrit: string;
  nameEnglish: string;
  sourceLevel: Of<typeof SOURCE_LEVELS> | null;
  sourceBodyArea: string | null;
  whereShown: Of<typeof WHERE_SHOWN> | null;
  mergedInto: string | null;
  minExperience: Of<typeof MIN_EXPERIENCE> | null;
  intensity: Of<typeof INTENSITIES> | null;
  settings: string[];
  settingNote: string | null;
  durationMin: number | null;
  effects: string[];
  vata: Of<typeof DOSHA_EFFECTS> | null;
  pitta: Of<typeof DOSHA_EFFECTS> | null;
  kapha: Of<typeof DOSHA_EFFECTS> | null;
  doshaVata: string | null;
  doshaPitta: string | null;
  doshaKapha: string | null;
  bestTimes: string[];
  timingNote: string | null;
  bestWeather: string[];
  counterPoseId: string | null;
  avoidNotes: string | null;
  avoidWeather: string[];
  avoidAfterMeal: boolean;
  plainBenefit: string | null;
  image: string | null;
  cues: string[];
  commonMistakes: string[];
  modifications: string | null;
  breathDescription: string | null;
  inhaleSec: number | null;
  holdInSec: number | null;
  exhaleSec: number | null;
  holdOutSec: number | null;
  cycles: number | null;
  ayurvedicNote: string | null;
  sourceCaution: string | null;
  dataFlag: string | null;
  basis: Of<typeof PRACTICE_BASIS> | null;
  iyengarRef: string | null;
  classicalRef: string | null;
  classicalSourceId: string | null;
}

export interface PracticeLibrary {
  sources: {
    id: string;
    title: string;
    author: string | null;
    role: string | null;
    edition: string | null;
    rights: string | null;
    status: Of<typeof SOURCE_STATUSES>;
    notes: string | null;
  }[];
  conditions: { code: string; label: string; userWords: string[]; sourcePhrases: string | null }[];
  needs: {
    id: string;
    name: string;
    description: string | null;
    typicalSignals: string | null;
    effectsThatServe: string[];
    doshaFocus: string | null;
    avoidEffects: string | null;
    whyTemplate: string | null;
  }[];
  practices: Practice[];
  practiceConditions: { practiceId: string; conditionCode: string; level: Of<typeof CONDITION_LEVELS> }[];
  practiceNeeds: { practiceId: string; needId: string }[];
  principles: (Review & { id: string; statement: string; concept: string | null; reference: string | null; basis: string | null })[];
  principleSources: { principleId: string; sourceId: string }[];
  rules: (Review & {
    id: string;
    kind: Of<typeof RULE_KINDS>;
    whenText: string;
    thenText: string;
    why: string | null;
    enforcedBy: string | null;
    basis: string | null;
  })[];
  rulePrinciples: { ruleId: string; principleId: string }[];
  flows: { id: string; name: string; category: string }[];
  flowMembers: { flowId: string; practiceId: string }[];
  sourceText: {
    practiceId: string;
    level: string | null;
    bodyArea: string | null;
    time: string | null;
    benefits: string | null;
    target: string | null;
    variations: string | null;
    cautionNotes: string | null;
    steps: string | null;
  }[];
}

export interface ParseResult {
  library: PracticeLibrary;
  errors: string[];
  warnings: string[];
}

// The exact headers each tab must have, in order. A renamed or added column
// stops the import until this file is updated, rather than being dropped.
export const HEADERS = {
  Practices: [
    'id', 'app_id', 'type', 'name_sanskrit', 'name_english', 'source_level', 'source_body_area', 'where_shown',
    'merged_into', 'min_experience', 'intensity', 'setting', 'setting_note', 'duration_min', 'effect', 'vata', 'pitta',
    'kapha', 'dosha_vata', 'dosha_pitta', 'dosha_kapha', 'best_time', 'timing_note', 'best_weather', 'needs_served',
    'counter_pose_id', 'avoid_conditions',
    'caution_conditions', 'avoid_notes', 'avoid_weather', 'avoid_after_meal', 'plain_benefit', 'image', 'cues',
    'common_mistakes', 'modifications', 'breath_description', 'inhale_sec', 'hold_in_sec', 'exhale_sec', 'hold_out_sec',
    'cycles', 'ayurvedic_note', 'source_caution', 'data_flag', 'basis', 'status', 'reviewed_by', 'reviewed_on',
    'iyengar_ref', 'classical_ref', 'classical_source_id',
  ],
  Needs: [
    'need_id', 'need', 'plain_description', 'typical_signals', 'effects_that_serve', 'dosha_focus', 'avoid_effects',
    'why_template', 'practices_available',
  ],
  Rules: ['rule_id', 'kind', 'when', 'then', 'why', 'principle_id', 'enforced_by', 'basis', 'status', 'reviewed_by', 'reviewed_on'],
  Principles: [
    'principle_id', 'statement (plain language)', 'concept', 'source_id', 'reference', 'basis', 'status', 'reviewed_by',
    'reviewed_on',
  ],
  Sources: ['source_id', 'title', 'author / tradition', 'role in PranaVeda', 'edition / identifier', 'rights', 'status', 'notes'],
  Conditions: ['code', 'label', 'user_words', 'source_phrases'],
  Lists: [
    'type', 'where_shown', 'min_experience', 'intensity', 'dosha_effect', 'effect', 'setting', 'best_time', 'best_weather',
    'status', 'rule_kind',
  ],
  'All Poses': [
    'ID', 'Sanskrit Name', 'English Name', 'Level', 'Body Area / Focus', 'Time', 'Flow / Course(s)', 'Benefits (source text)',
    'Target (source text)', 'Variations / Modifications (source text)', 'Caution Notes', 'Steps (source text)',
  ],
} as const;

type Tab = keyof typeof HEADERS;
type Row<T extends Tab> = Record<(typeof HEADERS)[T][number], string> & { line: number };

// Each Lists column and the values the importer knows for it. The sheet's
// dropdowns read Lists, so the two must agree.
const LISTS: Record<(typeof HEADERS)['Lists'][number], readonly string[]> = {
  type: PRACTICE_TYPES,
  where_shown: WHERE_SHOWN,
  min_experience: MIN_EXPERIENCE,
  intensity: INTENSITIES,
  dosha_effect: DOSHA_EFFECTS,
  effect: PRACTICE_EFFECTS,
  setting: SETTINGS,
  best_time: BEST_TIMES,
  best_weather: WEATHER,
  status: REVIEW_STATUSES,
  rule_kind: RULE_KINDS,
};

// The tags the engine needs before it can recommend a practice.
const REQUIRED_TAGS = [
  'where_shown', 'min_experience', 'intensity', 'setting', 'effect', 'vata', 'pitta', 'kapha', 'best_time', 'needs_served',
] as const;

const blank = (s: string) => (s.trim() === '' ? null : s.trim());

// A ";" list, trimmed, without repeats, in the order written.
export const list = (s: string) => [...new Set(s.split(';').map((x) => x.trim()).filter(Boolean))];

// "2026-10-22", or "10/22/2026" as Sheets may show a typed date, → "2026-10-22".
// null when empty, undefined when it is not a date.
export function isoDate(s: string): string | null | undefined {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined;
}

export function parsePracticeLibrary(tabs: Tabs): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lib: PracticeLibrary = {
    sources: [],
    conditions: [],
    needs: [],
    practices: [],
    practiceConditions: [],
    practiceNeeds: [],
    principles: [],
    principleSources: [],
    rules: [],
    rulePrinciples: [],
    flows: [],
    flowMembers: [],
    sourceText: [],
  };

  const rows = <T extends Tab>(tab: T): Row<T>[] => {
    const grid = tabs[tab];
    if (!grid) {
      errors.push(`Tab "${tab}" is missing.`);
      return [];
    }
    const expected = HEADERS[tab] as readonly string[];
    const header = (grid[0] ?? []).map((h) => h.trim());
    while (header.length > expected.length && header[header.length - 1] === '') header.pop();
    if (header.join('|') !== expected.join('|')) {
      errors.push(`${tab}: columns are [${header.join(', ')}], expected [${expected.join(', ')}].`);
      return [];
    }
    return grid
      .map((cells, i) => ({ cells, line: i + 1 }))
      .slice(1)
      .filter(({ cells }) => cells.some((c) => c.trim() !== ''))
      .map(({ cells, line }) => {
        const row = { line } as Row<T>;
        expected.forEach((h, i) => ((row as Record<string, unknown>)[h] = (cells[i] ?? '').trim()));
        return row;
      });
  };

  // A value from a fixed list: null when empty, undefined (with an error) when
  // it is not on the list.
  const one = <V extends string>(allowed: readonly V[], value: string, where: string, what: string): V | null | undefined => {
    if (value === '') return null;
    if ((allowed as readonly string[]).includes(value)) return value as V;
    errors.push(`${where}: ${what} "${value}" is not one of: ${allowed.join(', ')}.`);
    return undefined;
  };
  // A ";" list whose every item comes from `allowed`.
  const many = (allowed: readonly string[] | Set<string>, value: string, where: string, what: string): string[] => {
    const has = (x: string) => (allowed instanceof Set ? allowed.has(x) : allowed.includes(x));
    const items = list(value);
    const bad = items.filter((x) => !has(x));
    if (bad.length) errors.push(`${where}: ${what} has ${bad.map((b) => `"${b}"`).join(', ')}, which is not on its list.`);
    return items.filter(has);
  };
  const num = (value: string, where: string, what: string, whole = false): number | null => {
    if (value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (whole && !Number.isInteger(n))) {
      errors.push(`${where}: ${what} "${value}" is not ${whole ? 'a whole number' : 'a number'}.`);
      return null;
    }
    return n;
  };
  // status / reviewed_by / reviewed_on: "reviewed" and "approved" need both of the others.
  const review = (r: { status: string; reviewed_by: string; reviewed_on: string }, where: string): Review | undefined => {
    const status = one(REVIEW_STATUSES, r.status, where, 'status');
    const reviewedOn = isoDate(r.reviewed_on);
    if (reviewedOn === undefined) errors.push(`${where}: reviewed_on "${r.reviewed_on}" is not a date (YYYY-MM-DD).`);
    if (status === null) errors.push(`${where}: status is empty.`);
    if (!status || reviewedOn === undefined) return undefined;
    if (status !== 'draft' && (!r.reviewed_by || !reviewedOn)) {
      errors.push(`${where}: status "${status}" needs reviewed_by and reviewed_on.`);
      return undefined;
    }
    return { status, reviewedBy: blank(r.reviewed_by), reviewedOn };
  };
  const firstTime = (seen: Set<string>, id: string, where: string, what = 'id') => {
    if (seen.has(id)) {
      errors.push(`${where}: ${what} ${id} is used twice.`);
      return false;
    }
    seen.add(id);
    return true;
  };

  // Lists must hold exactly the values the importer knows.
  const listRows = rows('Lists');
  for (const [col, known] of Object.entries(LISTS)) {
    if (!listRows.length) break;
    const inSheet = listRows.map((r) => r[col as keyof typeof LISTS]).filter(Boolean);
    const unknown = inSheet.filter((v) => !known.includes(v));
    const missing = known.filter((v) => !inSheet.includes(v));
    if (unknown.length) errors.push(`Lists › ${col}: ${unknown.join(', ')} is not known to the importer; add it to db/schema.ts first.`);
    if (missing.length) warnings.push(`Lists › ${col}: the importer also accepts ${missing.join(', ')}, which the sheet's list lacks.`);
  }

  // Sources
  const sourceIds = new Set<string>();
  for (const r of rows('Sources')) {
    const where = `Sources row ${r.line} (${r.source_id})`;
    const status = one(SOURCE_STATUSES, r.status, where, 'status');
    if (!/^S\d+$/.test(r.source_id)) errors.push(`${where}: source_id is not in the form S1.`);
    if (!r.title) errors.push(`${where}: title is empty.`);
    if (status === null) errors.push(`${where}: status is empty.`);
    if (!/^S\d+$/.test(r.source_id) || !firstTime(sourceIds, r.source_id, where) || !r.title || !status) continue;
    lib.sources.push({
      id: r.source_id,
      title: r.title,
      author: blank(r['author / tradition']),
      role: blank(r['role in PranaVeda']),
      edition: blank(r['edition / identifier']),
      rights: blank(r.rights),
      status,
      notes: blank(r.notes),
    });
  }

  // Conditions
  const conditionCodes = new Set<string>();
  for (const r of rows('Conditions')) {
    const where = `Conditions row ${r.line} (${r.code})`;
    if (!/^[a-z][a-z_]*$/.test(r.code)) {
      errors.push(`${where}: code must be lower case letters and underscores.`);
      continue;
    }
    if (!r.label) errors.push(`${where}: label is empty.`);
    if (!firstTime(conditionCodes, r.code, where, 'code') || !r.label) continue;
    lib.conditions.push({ code: r.code, label: r.label, userWords: list(r.user_words), sourcePhrases: blank(r.source_phrases) });
  }

  // Needs. practices_available is a count the sheet calculates; it is not stored.
  const needIds = new Set<string>();
  for (const r of rows('Needs')) {
    const where = `Needs row ${r.line} (${r.need_id})`;
    if (!/^N\d+$/.test(r.need_id) || !r.need) {
      errors.push(`${where}: need_id must be in the form N1, and need is required.`);
      continue;
    }
    if (!firstTime(needIds, r.need_id, where)) continue;
    lib.needs.push({
      id: r.need_id,
      name: r.need,
      description: blank(r.plain_description),
      typicalSignals: blank(r.typical_signals),
      effectsThatServe: many(PRACTICE_EFFECTS, r.effects_that_serve, where, 'effects_that_serve'),
      doshaFocus: blank(r.dosha_focus),
      avoidEffects: blank(r.avoid_effects),
      whyTemplate: blank(r.why_template),
    });
  }

  // Principles
  const principleIds = new Set<string>();
  for (const r of rows('Principles')) {
    const where = `Principles row ${r.line} (${r.principle_id})`;
    const statement = r['statement (plain language)'];
    if (!/^PR\d+$/.test(r.principle_id) || !statement) {
      errors.push(`${where}: principle_id must be in the form PR1, and the statement is required.`);
      continue;
    }
    const rev = review(r, where);
    const sources = many(sourceIds, r.source_id, where, 'source_id');
    if (!firstTime(principleIds, r.principle_id, where) || !rev) continue;
    lib.principles.push({ id: r.principle_id, statement, concept: blank(r.concept), reference: blank(r.reference), basis: blank(r.basis), ...rev });
    lib.principleSources.push(...sources.map((sourceId) => ({ principleId: r.principle_id, sourceId })));
  }

  // Rules
  const ruleIds = new Set<string>();
  for (const r of rows('Rules')) {
    const where = `Rules row ${r.line} (${r.rule_id})`;
    if (!/^[GH]\d+$/.test(r.rule_id)) {
      errors.push(`${where}: rule_id must be in the form G1 or H1.`);
      continue;
    }
    const kind = one(RULE_KINDS, r.kind, where, 'kind');
    if (kind && (r.rule_id[0] === 'G') !== (kind === 'guardrail')) errors.push(`${where}: G-rules are guardrails and H-rules are hints.`);
    if (!r.when || !r.then) errors.push(`${where}: when and then are required.`);
    const rev = review(r, where);
    const principles = many(principleIds, r.principle_id, where, 'principle_id');
    if (!firstTime(ruleIds, r.rule_id, where) || !kind || !rev || !r.when || !r.then) continue;
    lib.rules.push({
      id: r.rule_id,
      kind,
      whenText: r.when,
      thenText: r.then,
      why: blank(r.why),
      enforcedBy: blank(r.enforced_by),
      basis: blank(r.basis),
      ...rev,
    });
    lib.rulePrinciples.push(...principles.map((principleId) => ({ ruleId: r.rule_id, principleId })));
  }

  // Practices. All ids are collected first, so a reference can point at a later row.
  const practiceRows = rows('Practices');
  const practiceIds = new Set(practiceRows.map((r) => r.id));
  const seenPractices = new Set<string>();
  const appIds = new Set<string>();
  let untagged = 0;
  const partlyTagged: string[] = [];

  for (const r of practiceRows) {
    const where = `Practices row ${r.line} (${r.id})`;
    if (!/^[PB]\d{2}$/.test(r.id)) {
      errors.push(`${where}: id is not in the form P01 or B01.`);
      continue;
    }
    if (!firstTime(seenPractices, r.id, where)) continue;
    const before = errors.length;

    const type = one(PRACTICE_TYPES, r.type, where, 'type');
    if (type && (r.id[0] === 'P') !== (type === 'asana')) errors.push(`${where}: P ids are poses (asana) and B ids are breath practices (pranayama).`);
    if (!r.name_sanskrit || !r.name_english) errors.push(`${where}: both names are required.`);
    if (r.app_id) firstTime(appIds, r.app_id, where, 'app_id');

    const ref = (value: string, what: string) => {
      if (value && !practiceIds.has(value)) errors.push(`${where}: ${what} ${value} is not a practice id.`);
      if (value && value === r.id) errors.push(`${where}: ${what} points at itself.`);
      return blank(value);
    };
    const whereShown = one(WHERE_SHOWN, r.where_shown, where, 'where_shown');
    const mergedInto = ref(r.merged_into, 'merged_into');
    if (mergedInto && whereShown !== 'hidden') errors.push(`${where}: a merged practice must have where_shown = hidden.`);
    const counterPoseId = ref(r.counter_pose_id, 'counter_pose_id');

    const avoid = many(conditionCodes, r.avoid_conditions, where, 'avoid_conditions');
    const caution = many(conditionCodes, r.caution_conditions, where, 'caution_conditions');
    const both = avoid.filter((c) => caution.includes(c));
    if (both.length) errors.push(`${where}: ${both.join(', ')} is in both avoid_conditions and caution_conditions.`);
    // G13: the app shows avoid_notes to a user with a caution condition, so it must say how to adapt.
    if (caution.length && !blank(r.avoid_notes)) {
      errors.push(`${where}: caution_conditions needs avoid_notes saying how to adapt the practice.`);
    }

    const breath = {
      inhaleSec: num(r.inhale_sec, where, 'inhale_sec', true),
      holdInSec: num(r.hold_in_sec, where, 'hold_in_sec', true),
      exhaleSec: num(r.exhale_sec, where, 'exhale_sec', true),
      holdOutSec: num(r.hold_out_sec, where, 'hold_out_sec', true),
      cycles: num(r.cycles, where, 'cycles', true),
    };
    if (type === 'asana' && (Object.values(breath).some((v) => v !== null) || r.breath_description)) {
      errors.push(`${where}: breath counts and breath_description are for breath practices only.`);
    }
    if (r.classical_source_id && !sourceIds.has(r.classical_source_id)) {
      errors.push(`${where}: classical_source_id ${r.classical_source_id} is not in Sources.`);
    }
    const meal = one(['yes'] as const, r.avoid_after_meal, where, 'avoid_after_meal');

    const tags = {
      sourceLevel: one(SOURCE_LEVELS, r.source_level, where, 'source_level'),
      minExperience: one(MIN_EXPERIENCE, r.min_experience, where, 'min_experience'),
      intensity: one(INTENSITIES, r.intensity, where, 'intensity'),
      vata: one(DOSHA_EFFECTS, r.vata, where, 'vata'),
      pitta: one(DOSHA_EFFECTS, r.pitta, where, 'pitta'),
      kapha: one(DOSHA_EFFECTS, r.kapha, where, 'kapha'),
      basis: one(PRACTICE_BASIS, r.basis, where, 'basis'),
    };
    const settings = many(SETTINGS, r.setting, where, 'setting');
    const effects = many(PRACTICE_EFFECTS, r.effect, where, 'effect');
    const bestTimes = many(BEST_TIMES, r.best_time, where, 'best_time');
    const bestWeather = many(WEATHER, r.best_weather, where, 'best_weather');
    const avoidWeather = many(WEATHER, r.avoid_weather, where, 'avoid_weather');
    const needsServed = many(needIds, r.needs_served, where, 'needs_served');
    const durationMin = num(r.duration_min, where, 'duration_min');
    // A merged duplicate carries no review of its own: the row it merged into does.
    const rev = mergedInto && !r.status ? ({ status: 'draft', reviewedBy: null, reviewedOn: null } as const) : review(r, where);

    if (!mergedInto) {
      const filled = REQUIRED_TAGS.filter((t) => r[t] !== '');
      if (filled.length === 0) untagged += 1;
      else if (filled.length < REQUIRED_TAGS.length) {
        partlyTagged.push(`${r.id} (missing ${REQUIRED_TAGS.filter((t) => r[t] === '').join(', ')})`);
      }
    }

    if (errors.length > before || !type || !rev || whereShown === undefined || meal === undefined) continue;
    if (Object.values(tags).includes(undefined)) continue;

    lib.practices.push({
      id: r.id,
      appId: blank(r.app_id),
      type,
      nameSanskrit: r.name_sanskrit,
      nameEnglish: r.name_english,
      sourceLevel: tags.sourceLevel ?? null,
      sourceBodyArea: blank(r.source_body_area),
      whereShown,
      mergedInto,
      minExperience: tags.minExperience ?? null,
      intensity: tags.intensity ?? null,
      settings,
      settingNote: blank(r.setting_note),
      durationMin,
      effects,
      vata: tags.vata ?? null,
      pitta: tags.pitta ?? null,
      kapha: tags.kapha ?? null,
      doshaVata: blank(r.dosha_vata),
      doshaPitta: blank(r.dosha_pitta),
      doshaKapha: blank(r.dosha_kapha),
      bestTimes,
      timingNote: blank(r.timing_note),
      bestWeather,
      counterPoseId,
      avoidNotes: blank(r.avoid_notes),
      avoidWeather,
      avoidAfterMeal: meal === 'yes',
      plainBenefit: blank(r.plain_benefit),
      image: blank(r.image),
      cues: list(r.cues),
      commonMistakes: list(r.common_mistakes),
      modifications: blank(r.modifications),
      breathDescription: blank(r.breath_description),
      ...breath,
      ayurvedicNote: blank(r.ayurvedic_note),
      sourceCaution: blank(r.source_caution),
      dataFlag: blank(r.data_flag),
      basis: tags.basis ?? null,
      ...rev,
      iyengarRef: blank(r.iyengar_ref),
      classicalRef: blank(r.classical_ref),
      classicalSourceId: blank(r.classical_source_id),
    });
    lib.practiceConditions.push(
      ...avoid.map((conditionCode) => ({ practiceId: r.id, conditionCode, level: 'avoid' as const })),
      ...caution.map((conditionCode) => ({ practiceId: r.id, conditionCode, level: 'caution' as const }))
    );
    lib.practiceNeeds.push(...needsServed.map((needId) => ({ practiceId: r.id, needId })));
  }
  if (untagged) warnings.push(`${untagged} practices have no recommendation tags yet, so the engine skips them.`);
  if (partlyTagged.length) warnings.push(`Partly tagged, so the engine skips them: ${partlyTagged.join('; ')}.`);

  // All Poses: the original Yogism text, and the flows each pose belongs to.
  const flowIds = new Set<string>();
  const seenSourceText = new Set<string>();
  for (const r of rows('All Poses')) {
    const where = `All Poses row ${r.line} (${r.ID})`;
    if (!practiceIds.has(r.ID)) {
      errors.push(`${where}: ID is not a practice id.`);
      continue;
    }
    if (!firstTime(seenSourceText, r.ID, where, 'ID')) continue;
    lib.sourceText.push({
      practiceId: r.ID,
      level: blank(r.Level),
      bodyArea: blank(r['Body Area / Focus']),
      time: blank(r.Time),
      benefits: blank(r['Benefits (source text)']),
      target: blank(r['Target (source text)']),
      variations: blank(r['Variations / Modifications (source text)']),
      cautionNotes: blank(r['Caution Notes']),
      steps: blank(r['Steps (source text)']),
    });
    for (const flow of list(r['Flow / Course(s)'])) {
      const m = flow.match(/^(.*\S)\s*\(([^()]+)\)$/);
      if (!m) {
        errors.push(`${where}: flow "${flow}" is not in the form "Name (category)".`);
        continue;
      }
      const id = slug(flow);
      if (!flowIds.has(id)) {
        flowIds.add(id);
        lib.flows.push({ id, name: m[1], category: m[2] });
      }
      lib.flowMembers.push({ flowId: id, practiceId: r.ID });
    }
  }

  return { library: lib, errors, warnings };
}
