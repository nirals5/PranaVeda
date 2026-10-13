import express from 'express';
import { sql } from 'drizzle-orm';
import { getDb } from './_lib/db.js';

// Accounts and sign-in: /api/auth/*, /api/me. A separate function from
// api/index.ts so the live chat endpoints are untouched by anything here.

const app = express();
app.use(express.json());

// Proves routing and database reachability; says nothing about the database.
app.get('/api/auth/health', async (_req, res) => {
  try {
    await getDb().execute(sql`select 1`);
    res.json({ ok: true, db: true });
  } catch (err: any) {
    console.error('[auth] health check failed:', err?.message || err);
    res.status(503).json({ ok: false, db: false });
  }
});

// Scoped to this function's own prefix: in local dev this app is mounted
// inside the main one and must let every other path fall through.
app.use('/api/auth', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
