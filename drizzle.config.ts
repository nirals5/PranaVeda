import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  // Migrations need a direct (non-pooled) connection. Vercel's Neon
  // integration names it DATABASE_URL_UNPOOLED; locally it is DATABASE_URL.
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)! },
});
