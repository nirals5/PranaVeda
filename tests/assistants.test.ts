import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../api/index.js';

// The Smart assistants card (You tab, Profile) lists Alexa only once the skill
// is published: ALEXA_SKILL_URL is set to its Amazon page then, and the apps
// and website show it without a new release.

describe('GET /api/assistants', () => {
  const saved = process.env.ALEXA_SKILL_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.ALEXA_SKILL_URL;
    else process.env.ALEXA_SKILL_URL = saved;
  });

  it('leaves Alexa out until the skill is published', async () => {
    delete process.env.ALEXA_SKILL_URL;
    const res = await request(app).get('/api/assistants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ alexa: null });
  });

  it('lists Alexa with its page and what to say once published', async () => {
    process.env.ALEXA_SKILL_URL = 'https://www.amazon.com/dp/B0EXAMPLE1';
    const res = await request(app).get('/api/assistants');
    expect(res.body.alexa.url).toBe('https://www.amazon.com/dp/B0EXAMPLE1');
    expect(res.body.alexa.phrases).toEqual([
      'Alexa, open Prana Veda',
      'Alexa, ask Prana Veda for a breathing practice',
      'Alexa, ask Prana Veda to remind me every evening at seven',
    ]);
  });

  it('ignores an address that is not an https Amazon page', async () => {
    for (const url of ['http://www.amazon.com/dp/B0EXAMPLE1', 'https://example.com/skill', 'https://amazon.com.evil.test/x', 'not a url']) {
      process.env.ALEXA_SKILL_URL = url;
      expect((await request(app).get('/api/assistants')).body).toEqual({ alexa: null });
    }
  });
});
