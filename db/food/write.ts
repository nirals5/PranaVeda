import { and, getTableColumns, isNull, notInArray, sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../schema.js';
import type { FoodLibrary } from './parse.js';

const {
  exclusions,
  exclusionTerms,
  foodImports,
  foodIngredientNames,
  foodIngredients,
  foodRecipeIngredients,
  foodRecipes,
  foodSources,
  foodSubstitutions,
} = schema;

type Db = NeonHttpDatabase<typeof schema>;

// Postgres allows 65,535 parameters per statement; rows are inserted in
// chunks well under that.
const CHUNK = 500;
export const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK));

// "on conflict do update" that takes every non-key column from the new row.
export function replaceAll(table: PgTable, keys: string[]) {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => !keys.includes(key))
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)])
  );
}

export interface ImportRecord {
  fileName: string;
  fileSha256: string;
  warnings: string[];
}

// Makes the food tables match the sheet, in one transaction (Neon runs a
// batch as one). Recipes missing from the sheet are retired rather than
// deleted, so a code a user saved still resolves; everything else is replaced.
export async function writeFoodLibrary(db: Db, lib: FoodLibrary, record: ImportRecord) {
  const recipeCodes = lib.recipes.map((r) => r.code);
  const counts = {
    recipes: lib.recipes.length,
    ingredients: lib.ingredients.length,
    ingredientNames: lib.ingredientNames.length,
    recipeIngredients: lib.recipeIngredients.length,
    exclusions: lib.exclusions.length,
    exclusionTerms: lib.exclusionTerms.length,
    substitutions: lib.substitutions.length,
    sources: lib.sources.length,
  };

  const statements = [
    // Links first, so the rows they point at can be replaced.
    db.delete(foodRecipeIngredients),
    db.delete(foodIngredientNames),
    db.delete(foodSubstitutions),
    db.delete(exclusionTerms),
    db.delete(exclusions).where(notInArray(exclusions.id, lib.exclusions.map((e) => e.id))),
    db.delete(foodIngredients).where(notInArray(foodIngredients.name, lib.ingredients.map((i) => i.name))),
    ...chunks(lib.sources).map((rows) =>
      db.insert(foodSources).values(rows).onConflictDoUpdate({ target: foodSources.id, set: replaceAll(foodSources, ['id']) })
    ),
    ...chunks(lib.exclusions).map((rows) =>
      db.insert(exclusions).values(rows).onConflictDoUpdate({ target: exclusions.id, set: replaceAll(exclusions, ['id']) })
    ),
    ...chunks(lib.ingredients).map((rows) =>
      db.insert(foodIngredients).values(rows).onConflictDoUpdate({ target: foodIngredients.name, set: replaceAll(foodIngredients, ['name']) })
    ),
    ...chunks(lib.recipes.map((r) => ({ ...r, retiredAt: null }))).map((rows) =>
      db.insert(foodRecipes).values(rows).onConflictDoUpdate({ target: foodRecipes.code, set: replaceAll(foodRecipes, ['code']) })
    ),
    db
      .update(foodRecipes)
      .set({ retiredAt: sql`now()` })
      .where(and(notInArray(foodRecipes.code, recipeCodes), isNull(foodRecipes.retiredAt))),
    db
      .delete(foodSources)
      .where(
        and(
          notInArray(foodSources.id, lib.sources.map((s) => s.id)),
          sql`not exists (select 1 from ${foodRecipes} where ${foodRecipes.sourceId} = ${foodSources.id})`
        )
      ),
    ...chunks(lib.ingredientNames).map((rows) => db.insert(foodIngredientNames).values(rows)),
    ...chunks(lib.recipeIngredients).map((rows) => db.insert(foodRecipeIngredients).values(rows)),
    ...chunks(lib.exclusionTerms).map((rows) => db.insert(exclusionTerms).values(rows)),
    ...chunks(lib.substitutions).map((rows) => db.insert(foodSubstitutions).values(rows)),
    db.insert(foodImports).values({ ...record, counts }).returning({ id: foodImports.id }),
  ] as const;

  const results = await db.batch(statements as unknown as Parameters<Db['batch']>[0]);
  const [{ id }] = results[results.length - 1] as { id: number }[];
  return { importId: id, counts };
}
