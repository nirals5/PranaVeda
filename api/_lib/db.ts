import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../db/schema.js';

// Relative imports under api/ must end in ".js": Vercel runs these files as
// native ES modules, and an extension-less import crashes at first request.

type Db = ReturnType<typeof drizzle<typeof schema>>;
let cached: Db | undefined;

// Created on first use, never at module load, so a missing or broken
// DATABASE_URL cannot take down requests that do not need the database.
export function getDb(): Db {
  if (cached) return cached;
  // Requests use Neon's pooled endpoint when one is configured; migrations
  // (drizzle.config.ts) use the direct one.
  const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
