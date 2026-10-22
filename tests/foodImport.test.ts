import { describe, expect, it } from 'vitest';
import { cleanContraindication, HEADERS, parseFoodLibrary, slug, splitList, type Tabs } from '../db/food/parse.js';

// A tiny sheet in the real layout; each test changes only what it is about.
type Cells = Record<string, string>;
const grid = (headers: readonly string[], rows: Cells[]) => [[...headers], ...rows.map((r) => headers.map((h) => r[h] ?? ''))];

const recipe = (overrides: Cells = {}): Cells => ({
  recipe_id: 'FC04.01',
  english_name: 'Ash gourd jam',
  sanskrit_name: 'Kushmanda Avaleha',
  dish_type: 'jam (avaleha)',
  how_taken: 'lick (spoonable)',
  sattvik_status: 'Sattvik',
  kitchen_ready: 'Kitchen-ready',
  ingredients_english: 'ash gourd, ghee',
  ingredients_sanskrit: 'Kushmanda, Ghrita',
  potency: 'cooling',
  contraindications: 'if',
  compendium_page: '14.0',
  app_candidate: 'Yes',
  name_basis: 'AI-drafted',
  ...overrides,
});

function sheet(over: Partial<Record<keyof typeof HEADERS, Cells[]>> = {}): Tabs {
  const rows: Record<keyof typeof HEADERS, Cells[]> = {
    Recipes: [recipe()],
    Removed: [{ recipe_id: 'FC01.01', sanskrit_name: 'Alikamatsya', english_name: 'Black gram snack', status: 'Not sattvik', reason: 'fish', compendium_page: '8' }],
    Substitutions: [{ replaces: 'Honey', swap: 'Maple syrup', basis: 'Modern', role: 'Primary (Niral)' }],
    Ingredients: [
      { english_name: 'ash gourd', 'sanskrit_names (as spelled in source)': 'Kushmanda, kushmanda, Petha', group: 'vegetable', kitchen: 'Y', sattvik: 'ok' },
      { english_name: 'ghee', 'sanskrit_names (as spelled in source)': 'Ghrita', group: 'dairy', kitchen: 'Y', sattvik: 'ok' },
      { english_name: 'honey', 'sanskrit_names (as spelled in source)': 'Madhu', group: 'sweetener', kitchen: 'Y', sattvik: 'excluded' },
      { english_name: 'lotus (flower, leaf or stamens)', 'sanskrit_names (as spelled in source)': 'Kamala', group: 'herb', kitchen: 'N', sattvik: 'ok' },
    ],
    Exclusions: [
      { item: 'Honey', status: 'excluded', 'match terms': 'honey; madhu; shahad', 'applies to': 'All diet suggestions', 'not when': 'honey, I; honeymoon' },
      { item: 'Figs (udumbara family)', status: 'excluded', 'match terms': 'fig; anjeer', notes: 'All parts of Ficus trees are excluded.' },
      {
        item: 'Milk or curd + sour fruit',
        status: 'combination rule',
        'match terms': 'milk or curd with lemon, citron or other sour fruit',
        'applies to': 'Meal and recipe suggestions',
        notes: 'Recipes marked Check.',
      },
    ],
    Sources: [{ id: 'F1', title: 'Ayurveda Aahara Compendium' }],
    ...over,
  };
  return Object.fromEntries(Object.entries(rows).map(([tab, r]) => [tab, grid(HEADERS[tab as keyof typeof HEADERS], r)]));
}

describe('food library import', () => {
  it('reads a clean sheet with no errors', () => {
    const { library, errors, warnings } = parseFoodLibrary(sheet());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(library.recipes.map((r) => [r.code, r.status])).toEqual([
      ['FC04.01', 'sattvik'],
      ['FC01.01', 'not_sattvik'],
    ]);
    const [jam] = library.recipes;
    expect(jam).toMatchObject({ howTaken: 'lick', sourcePage: 14, contraindications: null, englishNameDrafted: true, appCandidate: true });
    expect(library.recipeIngredients).toEqual([
      { recipeCode: 'FC04.01', position: 1, ingredient: 'ash gourd', honeySwapped: false },
      { recipeCode: 'FC04.01', position: 2, ingredient: 'ghee', honeySwapped: false },
    ]);
  });

  it('keeps one spelling of each Sanskrit name', () => {
    const { library } = parseFoodLibrary(sheet());
    expect(library.ingredientNames.filter((n) => n.ingredient === 'ash gourd').map((n) => n.name)).toEqual(['Kushmanda', 'Petha']);
  });

  it('links the honey swap to honey and keeps items with commas in brackets whole', () => {
    const { library, errors } = parseFoodLibrary(
      sheet({
        Recipes: [
          recipe({
            sattvik_status: 'Adapted',
            app_candidate: 'No',
            kitchen_ready: 'Needs herbs or special items',
            ingredients_english: 'Ghee, lotus (flower, leaf or stamens), maple syrup, blackstrap molasses or date sugar (swap for honey)',
          }),
        ],
      })
    );
    expect(errors).toEqual([]);
    expect(library.recipeIngredients.map((l) => [l.ingredient, l.honeySwapped])).toEqual([
      ['ghee', false],
      ['lotus (flower, leaf or stamens)', false],
      ['honey', true],
    ]);
  });

  it('refuses a recipe id used twice, even across Recipes and Removed', () => {
    const { errors } = parseFoodLibrary(
      sheet({ Recipes: [recipe(), recipe({ english_name: 'Other' }), recipe({ recipe_id: 'FC01.01' })] })
    );
    expect(errors).toEqual([
      'Recipes row 3 (FC04.01): recipe_id FC04.01 is already used by Recipes row 2 (FC04.01).',
      'Removed row 2 (FC01.01): recipe_id FC01.01 is already used by Recipes row 4 (FC01.01).',
    ]);
  });

  it('refuses ingredients missing from the glossary and names that differ only by capitals', () => {
    const base = sheet().Ingredients;
    const tabs = sheet({ Recipes: [recipe({ ingredients_english: 'ash gourd, saffron' })] });
    tabs.Ingredients = [...base, base[1].map((c, i) => (i === 0 ? 'Ghee' : c))];
    expect(parseFoodLibrary(tabs).errors).toEqual([
      'Ingredients row 6 ("Ghee"): same name as "ghee" (names must differ by more than capitals).',
      'Recipes row 2 (FC04.01): ingredient "saffron" is not in the Ingredients tab.',
    ]);
  });

  it('refuses values outside the known lists', () => {
    const { errors, library } = parseFoodLibrary(sheet({ Recipes: [recipe({ how_taken: 'Sattu' })] }));
    expect(errors).toEqual([
      'Recipes row 2 (FC04.01): unknown how_taken "Sattu" (expected one of: drink, eat, eat (chew), lick (spoonable)).',
    ]);
    expect(library.recipes.map((r) => r.code)).toEqual(['FC01.01']);
  });

  it('stops when a tab gains, loses or renames a column', () => {
    const tabs = sheet();
    tabs.Sources[0] = ['id', 'title', 'publisher', 'edition / location', 'rights', 'role'];
    expect(parseFoodLibrary(tabs).errors[0]).toMatch(/^Sources: columns are \[id, title, publisher,/);
  });

  it('reads exclusion terms, notes and where they apply, and keeps a combination rule as wording', () => {
    const { library } = parseFoodLibrary(sheet());
    expect(library.exclusions.map((e) => [e.id, e.status, e.appliesTo, e.notes])).toEqual([
      ['honey', 'excluded', 'All diet suggestions', null],
      ['figs_udumbara_family', 'excluded', null, 'All parts of Ficus trees are excluded.'],
      [
        'milk_or_curd_sour_fruit',
        'combination_rule',
        'Meal and recipe suggestions',
        'milk or curd with lemon, citron or other sour fruit. Recipes marked Check.',
      ],
    ]);
    expect(library.exclusionTerms.filter((t) => t.exclusionId === 'figs_udumbara_family').map((t) => t.term)).toEqual(['fig', 'anjeer']);
    expect(library.exclusionTerms.some((t) => t.exclusionId === 'milk_or_curd_sour_fruit')).toBe(false);
    expect(library.exclusions.map((e) => e.notWhen)).toEqual([['honey, I', 'honeymoon'], [], []]);
    expect(library.substitutions[0]).toMatchObject({ exclusionId: 'honey', role: 'primary' });
  });

  it('refuses a sentence left in the match terms', () => {
    const tabs = sheet();
    const header = tabs.Exclusions[0];
    tabs.Exclusions[2][header.indexOf('match terms')] = 'fig; anjeer. All parts of Ficus trees are excluded.';
    expect(parseFoodLibrary(tabs).errors).toEqual([
      'Exclusions row 3 ("Figs (udumbara family)"): match term "anjeer. All parts of Ficus trees are excluded." reads as a sentence; move it to notes.',
    ]);
  });

  it('warns about candidates that are not Sattvik and skips notes in Substitutions', () => {
    const { warnings } = parseFoodLibrary(
      sheet({
        Recipes: [recipe({ sattvik_status: 'Adapted' })],
        Substitutions: [{ replaces: 'Note: every sweetener above is heavier.' }],
      })
    );
    expect(warnings).toEqual([
      '1 app candidates are not Sattvik, though the README says candidates are "sattvik and kitchen-ready".',
      'Substitutions row 2 has no swap, so it was not imported: "Note: every sweetener above is heavier.…"',
    ]);
  });
});

describe('food library helpers', () => {
  it('splits only on commas outside brackets', () => {
    expect(splitList('a, b (c, d), e')).toEqual(['a', 'b (c, d)', 'e']);
    expect(splitList('')).toEqual([]);
  });

  it('cleans the contraindication placeholder', () => {
    expect(cleanContraindication('if')).toBeNull();
    expect(cleanContraindication('if Madhumeha (diabetes)')).toBe('Madhumeha (diabetes)');
    expect(cleanContraindication('Diabetes')).toBe('Diabetes');
    expect(cleanContraindication('ifrit')).toBe('ifrit');
  });

  it('makes exclusion ids from item names', () => {
    expect(slug('Pulse + unboiled dairy (dvidal)')).toBe('pulse_unboiled_dairy_dvidal');
  });
});
