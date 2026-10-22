import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema.js';
import { readWorkbook } from '../food/workbook.js';
import { parsePracticeLibrary } from './parse.js';
import { writePracticeLibrary } from './write.js';

// npm run practice:import -- <export.xlsx> [--dry-run]
//
// Loads the "PranaVeda – Practice Library" sheet into the practice tables.
// Download the sheet first (File › Download › Microsoft Excel). Nothing is
// written if the sheet has errors; --dry-run checks it and writes nothing
// either way.

const MAX_LISTED = 40;

function list(title: string, items: string[]) {
  if (!items.length) return;
  console.log(`\n${title} (${items.length}):`);
  for (const item of items.slice(0, MAX_LISTED)) console.log(`  - ${item}`);
  if (items.length > MAX_LISTED) console.log(`  … and ${items.length - MAX_LISTED} more`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: npm run practice:import -- <export.xlsx> [--dry-run]');
    process.exit(2);
  }

  const { library: lib, errors, warnings } = parsePracticeLibrary(await readWorkbook(file));
  console.log(
    `Read ${lib.practices.length} practices, ${lib.conditions.length} conditions, ${lib.needs.length} needs, ` +
      `${lib.rules.length} rules, ${lib.principles.length} principles, ${lib.sources.length} sources, ` +
      `${lib.flows.length} flows, ${lib.sourceText.length} source texts.`
  );
  list('Warnings', warnings);
  list('Errors — fix these in the sheet, download it again and re-run', errors);
  if (errors.length) process.exit(1);
  if (dryRun) {
    console.log('\nDry run: the sheet is ready to import. Nothing was written.');
    return;
  }

  // Migrations use the direct connection (drizzle.config.ts); so does this.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = drizzle(neon(url), { schema });
  const fileSha256 = createHash('sha256').update(await readFile(file)).digest('hex');
  const { importId } = await writePracticeLibrary(db, lib, { fileName: basename(file), fileSha256, warnings });
  console.log(`\nImported (practice_imports #${importId}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
