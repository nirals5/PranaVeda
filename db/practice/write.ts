import { and, isNull, notInArray, sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '../schema.js';
import { chunks, replaceAll } from '../food/write.js';
import type { PracticeLibrary } from './parse.js';

const {
  conditions,
  needs,
  practiceConditions,
  practiceFlowMembers,
  practiceFlows,
  practiceImports,
  practiceNeeds,
  practicePrincipleSources,
  practicePrinciples,
  practiceRulePrinciples,
  practiceRules,
  practiceSources,
  practiceSourceText,
  practices,
} = schema;

type Db = NeonHttpDatabase<typeof schema>;

export interface ImportRecord {
  fileName: string;
  fileSha256: string;
  warnings: string[];
}

// Makes the practice tables match the sheet, in one transaction (Neon runs a
// batch as one). Practices missing from the sheet are retired rather than
// deleted, so an id a user saved still resolves; everything else is replaced.
export async function writePracticeLibrary(db: Db, lib: PracticeLibrary, record: ImportRecord) {
  const counts = Object.fromEntries(Object.entries(lib).map(([k, rows]) => [k, rows.length]));

  const statements = [
    // Links first, so the rows they point at can be replaced.
    db.delete(practiceConditions),
    db.delete(practiceNeeds),
    db.delete(practiceRulePrinciples),
    db.delete(practicePrincipleSources),
    db.delete(practiceFlowMembers),
    db.delete(practiceSourceText),
    db.delete(practiceFlows),
    db.delete(practiceRules),
    db.delete(practicePrinciples),
    db.delete(conditions).where(notInArray(conditions.code, lib.conditions.map((c) => c.code))),
    db.delete(needs).where(notInArray(needs.id, lib.needs.map((n) => n.id))),
    ...chunks(lib.sources).map((rows) =>
      db.insert(practiceSources).values(rows).onConflictDoUpdate({ target: practiceSources.id, set: replaceAll(practiceSources, ['id']) })
    ),
    ...chunks(lib.conditions).map((rows) =>
      db.insert(conditions).values(rows).onConflictDoUpdate({ target: conditions.code, set: replaceAll(conditions, ['code']) })
    ),
    ...chunks(lib.needs).map((rows) =>
      db.insert(needs).values(rows).onConflictDoUpdate({ target: needs.id, set: replaceAll(needs, ['id']) })
    ),
    ...chunks(lib.practices.map((p) => ({ ...p, retiredAt: null }))).map((rows) =>
      db.insert(practices).values(rows).onConflictDoUpdate({ target: practices.id, set: replaceAll(practices, ['id']) })
    ),
    db
      .update(practices)
      .set({ retiredAt: sql`now()` })
      .where(and(notInArray(practices.id, lib.practices.map((p) => p.id)), isNull(practices.retiredAt))),
    db
      .delete(practiceSources)
      .where(
        and(
          notInArray(practiceSources.id, lib.sources.map((s) => s.id)),
          sql`not exists (select 1 from ${practices} where ${practices.classicalSourceId} = ${practiceSources.id})`
        )
      ),
    ...chunks(lib.principles).map((rows) => db.insert(practicePrinciples).values(rows)),
    ...chunks(lib.principleSources).map((rows) => db.insert(practicePrincipleSources).values(rows)),
    ...chunks(lib.rules).map((rows) => db.insert(practiceRules).values(rows)),
    ...chunks(lib.rulePrinciples).map((rows) => db.insert(practiceRulePrinciples).values(rows)),
    ...chunks(lib.flows).map((rows) => db.insert(practiceFlows).values(rows)),
    ...chunks(lib.flowMembers).map((rows) => db.insert(practiceFlowMembers).values(rows)),
    ...chunks(lib.sourceText).map((rows) => db.insert(practiceSourceText).values(rows)),
    ...chunks(lib.practiceConditions).map((rows) => db.insert(practiceConditions).values(rows)),
    ...chunks(lib.practiceNeeds).map((rows) => db.insert(practiceNeeds).values(rows)),
    db.insert(practiceImports).values({ ...record, counts }).returning({ id: practiceImports.id }),
  ] as const;

  const results = await db.batch(statements as unknown as Parameters<Db['batch']>[0]);
  const [{ id }] = results[results.length - 1] as { id: number }[];
  return { importId: id, counts };
}
