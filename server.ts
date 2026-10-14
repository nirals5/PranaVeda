// Local dev / self-hosted entry point.
//
// API routes live in api/*.ts (the same Express apps Vercel serves as separate
// functions), so endpoints are defined exactly once. This file only adds env
// loading, Vite middleware in dev, and static serving in production.

import 'dotenv/config';
import path from 'path';
import express from 'express';
import app from './api/index';
import authApp from './api/auth';

const PORT = Number(process.env.PORT) || 3000;

// Vercel routes /api/auth/* and /api/me to api/auth.ts (see vercel.json); here
// the same app is mounted ahead of the page handlers.
app.use(authApp);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PranaVeda server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
