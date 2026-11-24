import express from 'express';
import type { Request, Response } from 'express';
import { isSameOrigin } from './_lib/http.js';
import { limitRequest, limitMessage } from './_lib/rateLimit.js';
import { parseUsageBatch, pruneUsage, saveUsage } from './_lib/usage.js';

// Usage counts (KAN-32): POST /api/usage. Guests and signed-in people alike,
// and deliberately without reading who is signed in: the batch carries an
// install id and nothing that names the account. Limited per network address.

const app = express();
// The website sends with navigator.sendBeacon as the tab closes, which posts text/plain.
app.use('/api/usage', express.json({ limit: '32kb', type: ['application/json', 'text/plain'] }));

app.post('/api/usage', async (req: Request, res: Response) => {
  try {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const limit = await limitRequest(req, 'usage');
    if (limit) return res.status(429).json({ error: limitMessage(limit) });
    const batch = parseUsageBatch(req.body);
    if (!batch) return res.status(400).json({ error: 'invalid_batch' });
    await saveUsage(batch);
    // Now and then, rather than on a schedule of its own.
    if (Math.random() < 0.01) await pruneUsage();
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[usage] save failed:', err?.message || err);
    if (!res.headersSent) res.status(503).json({ error: 'usage_unavailable' });
  }
});

export default app;
