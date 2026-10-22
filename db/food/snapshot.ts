import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FoodRows } from '../../api/_lib/exclusions.js';
import type { FoodLibrary } from './parse.js';

// The app keeps its own copy of the Exclusions tab (api/_lib/foodRules.builtIn.ts)
// so the sattvik check still runs when the database cannot be read. Each
// import rewrites it from the sheet; commit the change it makes.

const TARGET = fileURLToPath(new URL('../../api/_lib/foodRules.builtIn.ts', import.meta.url));

export function foodRowsOf(lib: Pick<FoodLibrary, 'exclusions' | 'exclusionTerms' | 'substitutions'>): FoodRows {
  return {
    exclusions: lib.exclusions.map(({ id, item, status, notes, notWhen }) => ({ id, item, status, notes, notWhen })),
    terms: lib.exclusionTerms.map(({ exclusionId, term }) => ({ exclusionId, term })),
    substitutions: lib.substitutions.map(({ replaces, swap }) => ({ replaces, swap })),
  };
}

export function snapshotSource(rows: FoodRows): string {
  return `// Written by \`npm run food:import\` from the Food Library's Exclusions and
// Substitutions tabs. Do not edit by hand: change the sheet and import it.
import type { FoodRows } from './exclusions.js';

export const BUILT_IN_FOOD_ROWS: FoodRows = ${JSON.stringify(rows, null, 2)};
`;
}

// Returns whether the file changed.
export async function writeFoodRulesSnapshot(rows: FoodRows): Promise<boolean> {
  const next = snapshotSource(rows);
  const current = await readFile(TARGET, 'utf8').catch(() => '');
  if (current === next) return false;
  await writeFile(TARGET, next);
  return true;
}
