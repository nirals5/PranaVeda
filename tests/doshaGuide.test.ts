import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../api/index.js';
import { DOSHA_GUIDE, DOSHA_GUIDE_NOTE } from '../api/_lib/doshaGuide.js';

describe('GET /api/dosha-guide', () => {
  it('serves the same balancing reference the website shows, to anyone', async () => {
    const res = await request(app).get('/api/dosha-guide');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.body).toEqual({ doshas: DOSHA_GUIDE, note: DOSHA_GUIDE_NOTE });
  });

  it('covers every dosha with every section the screens show', () => {
    expect(Object.keys(DOSHA_GUIDE).sort()).toEqual(['Kapha', 'Pitta', 'Vata']);
    for (const entry of Object.values(DOSHA_GUIDE)) {
      for (const text of [entry.tagline, entry.qualities, entry.aggravatedBy, entry.balancedBy, entry.breath, entry.practiceStyle, entry.rhythm, entry.season]) {
        expect(text.length).toBeGreaterThan(10);
      }
      expect(entry.diet.length).toBeGreaterThan(0);
      expect(entry.lifestyle.length).toBeGreaterThan(0);
    }
  });
});
