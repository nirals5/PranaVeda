import express from 'express';
import type { Request, Response } from 'express';
import { isSameOrigin, requireUser } from './_lib/http.js';
import { parseProfile } from './_lib/profileSchema.js';
import { loadAccountProfile, saveProfile } from './_lib/profiles.js';

// Keeping a signed-in user's data the same on every device: /api/sync/*.
// Signed-in only; a guest's data never leaves their device.

const app = express();
app.use(express.json({ limit: '64kb' }));

type Handler = (req: Request, res: Response) => Promise<unknown>;

const route = (handler: Handler) => async (req: Request, res: Response) => {
  try {
    await handler(req, res);
  } catch (err: any) {
    console.error(`[sync] ${req.method} ${req.path} failed:`, err?.message || err);
    if (!res.headersSent) res.status(503).json({ error: 'sync_unavailable' });
  }
};

// The profile and its version. Version 0 means the account has no profile yet.
app.get(
  '/api/sync/profile',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const stored = await loadAccountProfile(user.id);
    res.json(stored ?? { profile: {}, version: 0 });
  })
);

// Replaces the profile. `baseVersion` is the version the client last saw;
// if someone has written since, nothing is saved and the current profile is
// returned with 409 so the client can start again from it.
app.put(
  '/api/sync/profile',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const user = await requireUser(req, res);
    if (!user) return;
    const { profile: raw, baseVersion } = req.body ?? {};
    if (!Number.isInteger(baseVersion) || baseVersion < 0) return res.status(400).json({ error: 'base_version_required' });
    const profile = parseProfile(raw);
    if (!profile) return res.status(400).json({ error: 'invalid_profile' });

    const result = await saveProfile(user.id, profile, baseVersion);
    // (Narrowed by property: this project compiles without strict null checks.)
    if ('current' in result) return res.status(409).json({ error: 'version_conflict', ...result.current });
    res.json({ profile, version: result.version });
  })
);

app.use('/api/sync', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
