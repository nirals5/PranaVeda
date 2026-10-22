import { FOOD_GROUPS } from '../schema.js';
import type {
  DVIDAL,
  EXCLUSION_STATUSES,
  HOW_TAKEN,
  INGREDIENT_SATTVIK,
  KITCHEN,
  POTENCIES,
  RECIPE_STATUSES,
  SUBSTITUTION_ROLES,
} from '../schema.js';

// Turns the Food Library sheet (one string grid per tab) into rows for the
// food tables, checking everything first. Errors block the import; warnings
// are recorded with it. Pure: no files, no database.

export type Tabs = Record<string, string[][]>;

export interface Recipe {
  code: string;
  status: (typeof RECIPE_STATUSES)[number];
  statusReason: string | null;
  englishName: string;
  englishNameDrafted: boolean;
  sanskritName: string;
  dishType: string | null;
  howTaken: (typeof HOW_TAKEN)[number] | null;
  kitchenReady: boolean | null;
  potency: (typeof POTENCIES)[number] | null;
  ingredientsSanskrit: string | null;
  classicalProperties: string | null;
  classicalIndications: string | null;
  contraindications: string | null;
  classicalReference: string | null;
  sourceId: string;
  sourcePage: number | null;
  preparationNote: string | null;
  dvidal: (typeof DVIDAL)[number] | null;
  fermentedBatter: boolean;
  appCandidate: boolean;
}

export interface Ingredient {
  name: string;
  botanicalName: string | null;
  foodGroup: (typeof FOOD_GROUPS)[number];
  kitchen: (typeof KITCHEN)[number];
  sattvik: (typeof INGREDIENT_SATTVIK)[number];
  note: string | null;
}

export interface FoodLibrary {
  sources: { id: string; title: string; author: string | null; edition: string | null; rights: string | null; role: string | null }[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  ingredientNames: { ingredient: string; name: string }[];
  recipeIngredients: { recipeCode: string; position: number; ingredient: string; honeySwapped: boolean }[];
  exclusions: { id: string; item: string; status: (typeof EXCLUSION_STATUSES)[number]; notes: string | null; appliesTo: string | null }[];
  exclusionTerms: { exclusionId: string; term: string }[];
  substitutions: {
    position: number;
    replaces: string;
    exclusionId: string | null;
    swap: string;
    basis: string | null;
    ayurvedicQuality: string | null;
    howToUse: string | null;
    role: (typeof SUBSTITUTION_ROLES)[number] | null;
  }[];
}

export interface ParseResult {
  library: FoodLibrary;
  errors: string[];
  warnings: string[];
}

// Every recipe row comes from the FSSAI compendium (Sources tab, F1).
export const COMPENDIUM_SOURCE = 'F1';

// The exact headers each tab must have, in order. A renamed or added column
// stops the import until this file is updated, rather than being dropped.
export const HEADERS = {
  Recipes: [
    'recipe_id', 'english_name', 'sanskrit_name', 'dish_type', 'how_taken', 'sattvik_status', 'sattvik_reason',
    'kitchen_ready', 'herbs_or_special_items', 'ingredients_english', 'ingredients_sanskrit', 'potency',
    'classical_properties', 'classical_indications (reference only)', 'contraindications', 'classical_reference',
    'compendium_page', 'app_candidate', 'name_basis', 'preparation_note', 'jain_dvidal_flag', 'fermented_batter',
  ],
  Removed: ['recipe_id', 'sanskrit_name', 'english_name', 'status', 'reason', 'compendium_page'],
  Substitutions: ['replaces', 'swap', 'basis', 'Ayurvedic quality (to review)', 'how to use', 'role'],
  Ingredients: [
    'english_name', 'sanskrit_names (as spelled in source)', 'botanical / source name', 'group', 'kitchen', 'sattvik',
    'note', 'used_in_recipes',
  ],
  Exclusions: ['item', 'status', 'match terms'],
  Sources: ['id', 'title', 'publisher / author', 'edition / location', 'rights', 'role'],
} as const;

type Tab = keyof typeof HEADERS;
type Row<T extends Tab> = Record<(typeof HEADERS)[T][number], string> & { line: number };

const RECIPE_STATUS: Record<string, Recipe['status']> = {
  Sattvik: 'sattvik',
  Adapted: 'adapted',
  Check: 'check',
  'Not sattvik': 'not_sattvik',
  'Not for home use': 'not_for_home_use',
};
const HOW: Record<string, NonNullable<Recipe['howTaken']>> = {
  drink: 'drink',
  eat: 'eat',
  'eat (chew)': 'chew',
  'lick (spoonable)': 'lick',
};
const KITCHEN_READY: Record<string, boolean> = { 'Kitchen-ready': true, 'Needs herbs or special items': false };
const POTENCY: Record<string, NonNullable<Recipe['potency']>> = { warming: 'warming', cooling: 'cooling' };
const DVIDAL_FLAG: Record<string, NonNullable<Recipe['dvidal']>> = {
  'pulse with curd/buttermilk': 'pulse_with_curd',
  'pulse with milk': 'pulse_with_milk',
};
const YES_NO: Record<string, boolean> = { Yes: true, No: false };
const YES_BLANK: Record<string, boolean> = { Yes: true, '': false };
const KITCHEN_FLAG: Record<string, Ingredient['kitchen']> = { Y: 'yes', N: 'no', '?': 'unknown' };
const SATTVIK_FLAG: Record<string, Ingredient['sattvik']> = {
  ok: 'ok',
  excluded: 'excluded',
  'to confirm': 'to_confirm',
  unsafe: 'unsafe',
};
const EXCLUSION_STATUS: Record<string, FoodLibrary['exclusions'][number]['status']> = {
  excluded: 'excluded',
  unsafe: 'unsafe',
  'combination rule': 'combination_rule',
  'allowed by exception': 'allowed_by_exception',
  'allowed in small amounts': 'allowed_in_small_amounts',
};
const ROLE: Record<string, NonNullable<FoodLibrary['substitutions'][number]['role']>> = {
  'Primary (Niral)': 'primary',
  'Also classical': 'classical',
  'Jain adaptation': 'jain_adaptation',
};
const GROUP: Record<string, Ingredient['foodGroup']> = Object.fromEntries(FOOD_GROUPS.map((g) => [g, g]));

// How an adapted recipe's ingredient list names the honey swap.
const HONEY_SWAP = /maple syrup, blackstrap molasses or date sugar \(swap for honey\)/gi;
const HONEY_TOKEN = '\u0000honey';

const blank = (s: string) => (s.trim() === '' ? null : s.trim());

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// Splits on commas outside parentheses: "lotus (flower, leaf or stamens)" is one item.
export function splitList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// "if Diabetes" → "Diabetes"; the sheet's bare "if" placeholder → null.
export function cleanContraindication(s: string): string | null {
  return blank(s.trim().replace(/^if\b\s*/i, ''));
}

export function parseFoodLibrary(tabs: Tabs): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const library: FoodLibrary = {
    sources: [],
    recipes: [],
    ingredients: [],
    ingredientNames: [],
    recipeIngredients: [],
    exclusions: [],
    exclusionTerms: [],
    substitutions: [],
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

  // A value from a fixed list. Unknown values are an error; `undefined` tells
  // the caller to skip the row.
  const pick = <V>(map: Record<string, V>, value: string, where: string, what: string): V | undefined => {
    if (Object.hasOwn(map, value)) return map[value];
    errors.push(`${where}: unknown ${what} "${value}" (expected one of: ${Object.keys(map).join(', ')}).`);
    return undefined;
  };
  const optional = <V>(map: Record<string, V>, value: string, where: string, what: string): V | null | undefined =>
    value === '' ? null : pick(map, value, where, what);
  const page = (value: string, where: string): number | null => {
    if (value === '') return null;
    if (/^\d+(\.0+)?$/.test(value)) return parseInt(value, 10);
    errors.push(`${where}: compendium_page "${value}" is not a whole number.`);
    return null;
  };

  // Sources
  for (const r of rows('Sources')) {
    if (!r.id || !r.title) {
      errors.push(`Sources row ${r.line}: id and title are required.`);
      continue;
    }
    library.sources.push({
      id: r.id,
      title: r.title,
      author: blank(r['publisher / author']),
      edition: blank(r['edition / location']),
      rights: blank(r.rights),
      role: blank(r.role),
    });
  }
  if (tabs.Sources && !library.sources.some((s) => s.id === COMPENDIUM_SOURCE)) {
    errors.push(`Sources: no ${COMPENDIUM_SOURCE} row, which every recipe cites.`);
  }

  // Ingredients
  const byLower = new Map<string, string>();
  for (const r of rows('Ingredients')) {
    const where = `Ingredients row ${r.line} ("${r.english_name}")`;
    if (!r.english_name) {
      errors.push(`Ingredients row ${r.line}: english_name is empty.`);
      continue;
    }
    const key = r.english_name.toLowerCase();
    if (byLower.has(key)) {
      errors.push(`${where}: same name as "${byLower.get(key)}" (names must differ by more than capitals).`);
      continue;
    }
    byLower.set(key, r.english_name);
    const foodGroup = pick(GROUP, r.group, where, 'group');
    const kitchen = pick(KITCHEN_FLAG, r.kitchen, where, 'kitchen value');
    const sattvik = pick(SATTVIK_FLAG, r.sattvik, where, 'sattvik value');
    if (!foodGroup || !kitchen || !sattvik) continue;
    library.ingredients.push({
      name: r.english_name,
      botanicalName: blank(r['botanical / source name']),
      foodGroup,
      kitchen,
      sattvik,
      note: blank(r.note),
    });
    const seen = new Set<string>();
    for (const name of splitList(r['sanskrit_names (as spelled in source)'])) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      library.ingredientNames.push({ ingredient: r.english_name, name });
    }
  }
  const kitchenOf = new Map(library.ingredients.map((i) => [i.name, i.kitchen]));
  const honey = byLower.get('honey');

  // Recipes and removed recipes share one set of codes.
  const codes = new Map<string, string>();
  const claim = (code: string, where: string) => {
    if (!/^FC\d{2}\.\d{2}$/.test(code)) {
      errors.push(`${where}: recipe_id "${code}" is not in the form FC00.00.`);
      return false;
    }
    if (codes.has(code)) {
      errors.push(`${where}: recipe_id ${code} is already used by ${codes.get(code)}.`);
      return false;
    }
    codes.set(code, where);
    return true;
  };

  let kitchenDisagrees = 0;
  let nonSattvikCandidates = 0;
  for (const r of rows('Recipes')) {
    const where = `Recipes row ${r.line} (${r.recipe_id})`;
    const ok = claim(r.recipe_id, where);
    const status = pick(RECIPE_STATUS, r.sattvik_status, where, 'sattvik_status');
    if (status === 'not_sattvik' || status === 'not_for_home_use') {
      errors.push(`${where}: "${r.sattvik_status}" recipes belong in the Removed tab.`);
    }
    const howTaken = optional(HOW, r.how_taken, where, 'how_taken');
    const kitchenReady = pick(KITCHEN_READY, r.kitchen_ready, where, 'kitchen_ready');
    const potency = optional(POTENCY, r.potency, where, 'potency');
    const dvidal = optional(DVIDAL_FLAG, r.jain_dvidal_flag, where, 'jain_dvidal_flag');
    const appCandidate = pick(YES_NO, r.app_candidate, where, 'app_candidate');
    const fermentedBatter = pick(YES_BLANK, r.fermented_batter, where, 'fermented_batter');
    const sourcePage = page(r.compendium_page, where);

    // Ingredients, in order, linked to the glossary by English name.
    const links: FoodLibrary['recipeIngredients'] = [];
    for (const item of splitList(r.ingredients_english.replace(HONEY_SWAP, HONEY_TOKEN))) {
      const swapped = item === HONEY_TOKEN;
      const name = swapped ? honey : byLower.get(item.toLowerCase());
      if (!name) {
        errors.push(
          swapped
            ? `${where}: uses the honey swap, but the Ingredients tab has no "honey".`
            : `${where}: ingredient "${item}" is not in the Ingredients tab.`
        );
        continue;
      }
      links.push({ recipeCode: r.recipe_id, position: links.length + 1, ingredient: name, honeySwapped: swapped });
    }

    if (!ok || !status || howTaken === undefined || kitchenReady === undefined || potency === undefined) continue;
    if (dvidal === undefined || appCandidate === undefined || fermentedBatter === undefined) continue;

    if (links.length && kitchenReady !== links.every((l) => l.honeySwapped || kitchenOf.get(l.ingredient) === 'yes')) {
      kitchenDisagrees += 1;
    }
    if (appCandidate && status !== 'sattvik') nonSattvikCandidates += 1;

    library.recipes.push({
      code: r.recipe_id,
      status,
      statusReason: blank(r.sattvik_reason),
      englishName: r.english_name,
      englishNameDrafted: r.name_basis === 'AI-drafted',
      sanskritName: r.sanskrit_name,
      dishType: blank(r.dish_type),
      howTaken,
      kitchenReady,
      potency,
      ingredientsSanskrit: blank(r.ingredients_sanskrit),
      classicalProperties: blank(r.classical_properties),
      classicalIndications: blank(r['classical_indications (reference only)']),
      contraindications: cleanContraindication(r.contraindications),
      classicalReference: blank(r.classical_reference),
      sourceId: COMPENDIUM_SOURCE,
      sourcePage,
      preparationNote: blank(r.preparation_note),
      dvidal,
      fermentedBatter,
      appCandidate,
    });
    library.recipeIngredients.push(...links);
  }
  if (nonSattvikCandidates) {
    warnings.push(
      `${nonSattvikCandidates} app candidates are not Sattvik, though the README says candidates are "sattvik and kitchen-ready".`
    );
  }
  if (kitchenDisagrees) {
    warnings.push(`${kitchenDisagrees} recipes' kitchen_ready disagrees with their ingredients' kitchen flags in the Ingredients tab.`);
  }

  for (const r of rows('Removed')) {
    const where = `Removed row ${r.line} (${r.recipe_id})`;
    const ok = claim(r.recipe_id, where);
    const status = pick(RECIPE_STATUS, r.status, where, 'status');
    if (status && status !== 'not_sattvik' && status !== 'not_for_home_use') {
      errors.push(`${where}: status "${r.status}" belongs in the Recipes tab.`);
      continue;
    }
    const sourcePage = page(r.compendium_page, where);
    if (!ok || !status) continue;
    library.recipes.push({
      code: r.recipe_id,
      status,
      statusReason: blank(r.reason),
      englishName: r.english_name,
      englishNameDrafted: true,
      sanskritName: r.sanskrit_name,
      dishType: null,
      howTaken: null,
      kitchenReady: null,
      potency: null,
      ingredientsSanskrit: null,
      classicalProperties: null,
      classicalIndications: null,
      contraindications: null,
      classicalReference: null,
      sourceId: COMPENDIUM_SOURCE,
      sourcePage,
      preparationNote: null,
      dvidal: null,
      fermentedBatter: false,
      appCandidate: false,
    });
  }

  // Exclusions. "match terms" holds the terms, separated by ";", and may end
  // with sentences of notes; a combination rule is all wording, no terms.
  for (const r of rows('Exclusions')) {
    const where = `Exclusions row ${r.line} ("${r.item}")`;
    const id = slug(r.item);
    if (!id) {
      errors.push(`Exclusions row ${r.line}: item is empty.`);
      continue;
    }
    if (library.exclusions.some((e) => e.id === id)) {
      errors.push(`${where}: same item as an earlier row.`);
      continue;
    }
    const status = pick(EXCLUSION_STATUS, r.status, where, 'status');
    if (!status) continue;
    const text = r['match terms'];
    let terms: string[] = [];
    let notes: string | null = null;
    if (status === 'combination_rule') notes = blank(text);
    else {
      const stop = text.search(/\.(\s|$)/);
      notes = stop === -1 ? null : blank(text.slice(stop + 1));
      terms = [...new Set((stop === -1 ? text : text.slice(0, stop)).split(';').map((t) => t.trim()).filter(Boolean))];
    }
    library.exclusions.push({ id, item: r.item, status, notes, appliesTo: null });
    library.exclusionTerms.push(...terms.map((term) => ({ exclusionId: id, term })));
  }

  // Substitutions. A row without a swap is a note, which has no place yet.
  const exclusionByItem = new Map(library.exclusions.map((e) => [e.item.toLowerCase(), e.id]));
  for (const r of rows('Substitutions')) {
    const where = `Substitutions row ${r.line}`;
    if (!r.swap) {
      warnings.push(`${where} has no swap, so it was not imported: "${r.replaces.slice(0, 80)}…"`);
      continue;
    }
    const role = optional(ROLE, r.role, where, 'role');
    if (role === undefined) continue;
    library.substitutions.push({
      position: library.substitutions.length + 1,
      replaces: r.replaces,
      exclusionId: exclusionByItem.get(r.replaces.toLowerCase()) ?? null,
      swap: r.swap,
      basis: blank(r.basis),
      ayurvedicQuality: blank(r['Ayurvedic quality (to review)']),
      howToUse: blank(r['how to use']),
      role,
    });
  }

  return { library, errors, warnings };
}
