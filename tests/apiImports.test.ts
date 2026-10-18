import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vercel runs each file in api/ as a native ES module without bundling, so a
// relative import must name its file with ".js" ("./_lib/db.js"). Without the
// extension, or with ".ts", it still passes the type check and runs locally,
// and only crashes on Vercel at the first request. This follows every
// function's imports, including files outside api/ (db/schema.ts), and fails
// on any that would not load there.

const root = resolve(__dirname, '..');
const functions = readdirSync(join(root, 'api'))
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
  .map((name) => join(root, 'api', name));

// `import … from './x.js'`, `export … from './x.js'`, `import './x.js'` and `import('./x.js')`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

function relativeImports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(SPECIFIER)].map((match) => match[1]);
}

/** Every relative import reachable from the functions, as "file: specifier" for the ones Vercel cannot load. */
function problems(): { files: number; bad: string[] } {
  const seen = new Set<string>();
  const bad: string[] = [];
  const queue = [...functions];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of relativeImports(readFileSync(file, 'utf8'))) {
      const where = `${relative(root, file)}: '${specifier}'`;
      if (!specifier.endsWith('.js')) {
        bad.push(`${where} needs a ".js" extension`);
        continue;
      }
      const target = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
      if (existsSync(target)) queue.push(target);
      else if (!existsSync(resolve(dirname(file), specifier))) bad.push(`${where} names a file that does not exist`);
    }
  }
  return { files: seen.size, bad };
}

describe('imports in the Vercel functions', () => {
  it('end in ".js" and name files that exist, in every file the functions load', () => {
    const { files, bad } = problems();
    expect(files).toBeGreaterThan(functions.length); // it really followed the imports
    expect(bad).toEqual([]);
  });

  it('spots the imports that would crash on Vercel', () => {
    const source = `
      import app from './_lib/ok.js';
      import { db } from "../db/schema";
      export { thing } from './_lib/thing.ts';
      const lazy = await import('./_lib/lazy');
      // import commented from './_lib/commented';
      import express from 'express';
    `;
    expect(relativeImports(source)).toEqual(['./_lib/ok.js', '../db/schema', './_lib/thing.ts', './_lib/lazy']);
  });
});
