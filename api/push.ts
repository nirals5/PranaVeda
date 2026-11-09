import express from 'express';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isSameOrigin, requireUser } from './_lib/http.js';
import { parseCalendarUpload, parseSubscription, recordState, removeSubscription, runTick, saveSubscription, vapid } from './_lib/push.js';

// Push nudges for the website: /api/push/*. Signed-in only. The browser
// subscribes and keeps the server told of its busy times; a scheduled call to
// /api/push/tick (a Cloudflare cron, see cloudflare/push-ticker) sends nudges.

const app = express();
app.use(express.json({ limit: '64kb' }));

type Handler = (req: Request, res: Response) => Promise<unknown>;

const route = (handler: Handler) => async (req: Request, res: Response) => {
  try {
    await handler(req, res);
  } catch (err: any) {
    console.error(`[push] ${req.method} ${req.path} failed:`, err?.message || err);
    if (!res.headersSent) res.status(503).json({ error: 'push_unavailable' });
  }
};

// The key browsers need to subscribe. Absent until VAPID keys are set.
app.get('/api/push/key', (_req, res) => {
  const keys = vapid();
  if (!keys) return res.status(503).json({ error: 'push_unavailable' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ publicKey: keys.publicKey });
});

app.put(
  '/api/push/subscription',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const user = await requireUser(req, res);
    if (!user) return;
    const sub = parseSubscription(req.body?.subscription);
    if (!sub) return res.status(400).json({ error: 'invalid_subscription' });
    await saveSubscription(user.id, sub);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/push/subscription',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const user = await requireUser(req, res);
    if (!user) return;
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint_required' });
    await removeSubscription(user.id, endpoint);
    res.json({ ok: true });
  })
);

// `seen`: PranaVeda is on screen now. `calendar`: busy times for today and
// tomorrow, or untrusted when a calendar is missing or could not be read.
app.put(
  '/api/push/state',
  route(async (req, res) => {
    if (!isSameOrigin(req)) return res.status(403).json({ error: 'cross_origin' });
    const user = await requireUser(req, res);
    if (!user) return;
    const { seen, calendar: raw } = req.body ?? {};
    const calendar = raw === undefined ? undefined : parseCalendarUpload(raw);
    if (calendar === null) return res.status(400).json({ error: 'invalid_calendar' });
    await recordState(user.id, { seen: seen === true, calendar });
    res.json({ ok: true });
  })
);

function tickAllowed(req: Request): boolean {
  const secret = process.env.PUSH_TICK_SECRET;
  const given = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.post(
  '/api/push/tick',
  route(async (req, res) => {
    if (!tickAllowed(req)) return res.status(401).json({ error: 'unauthorized' });
    if (!vapid()) return res.status(503).json({ error: 'push_unavailable' });
    res.json(await runTick());
  })
);

export default app;
