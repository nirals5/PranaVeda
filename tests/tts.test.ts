import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app, { TTS_MAX_CHARS } from '../api/index.js';

// /api/tts speaks with Amrita's ElevenLabs voice, which is paid per character.
// Guided practices now use it too, so a request's length is capped: well above
// a pose's guidance or a long chat reply, far below a script's abuse.

describe('/api/tts', () => {
  const saved = { key: process.env.ELEVENLABS_API_KEY, voice: process.env.ELEVENLABS_VOICE_ID };
  beforeEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
  });
  afterEach(() => {
    if (saved.key !== undefined) process.env.ELEVENLABS_API_KEY = saved.key;
    if (saved.voice !== undefined) process.env.ELEVENLABS_VOICE_ID = saved.voice;
  });

  it('refuses a missing or non-text request', async () => {
    expect((await request(app).post('/api/tts').send({})).status).toBe(400);
    expect((await request(app).post('/api/tts').send({ text: '   ' })).status).toBe(400);
    expect((await request(app).post('/api/tts').send({ text: ['a'] })).status).toBe(400);
  });

  it('refuses text longer than the cap before it reaches ElevenLabs', async () => {
    const res = await request(app).post('/api/tts').send({ text: 'a'.repeat(TTS_MAX_CHARS + 1) });
    expect(res.status).toBe(413);
  });

  it('accepts a long pose cue, and says when no voice is configured', async () => {
    const cue = 'Entering posture: Warrior Two. <break time="1.2s" /> ' + 'Breathe and settle. <break time="1.4s" /> '.repeat(40);
    expect(cue.length).toBeLessThan(TTS_MAX_CHARS);
    const res = await request(app).post('/api/tts').send({ text: cue });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ unavailable: true });
  });
});
