import 'dotenv/config';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { catalogOf, resetCatalogCache } from '../api/_lib/catalog.js';
import { BREATHWORK, BUILT_IN_CONDITIONS, POSES, buildBreathworkCard, buildRitual, registerChatRoute } from '../api/index.js';

// G13: when the user's condition is one a practice is adapted for (a
// caution, not an avoid), the card carries the practice's note on how.

const KEEP_ARMS_DOWN = 'High blood pressure: keep arms down.';
const poses = POSES.map((p) =>
  p.id === 'warrior_1' ? { ...p, contraindications: ['knee_injury'], cautions: ['hypertension'], safetyNote: KEEP_ARMS_DOWN } : p
);
const breathwork = BREATHWORK.map((b) =>
  b.id === 'sama_vritti' ? { ...b, cautions: ['asthma'], safetyNote: 'Asthma: keep the holds short.' } : b
);
const catalog = catalogOf(poses, breathwork, BUILT_IN_CONDITIONS, 'database');

const ritual = (breathworkId = 'sama_vritti') => ({
  title: 'Steady',
  description: 'x',
  summary: 'x',
  doshaTendency: 'Vata',
  primaryEnergy: 'calm',
  poses: [
    { poseId: 'warrior_1', durationMinutes: 2 },
    { poseId: 'tadasana', durationMinutes: 2 },
  ],
  breathworkId,
  ayurvedic: { assessment: 'x', doshaPrimary: 'Vata', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
  lifestyleTips: [],
});

describe('caution notes on cards', () => {
  it.each([['hypertension'], ['High blood pressure'], ['high BP since last year']])('shows the note for a profile that says "%s"', (said) => {
    const { card } = buildRitual(ritual(), { conditions: [said] }, catalog, '');
    const [warrior, mountain] = card.result.yogaPractice.poses;
    expect(warrior.caution).toBe(KEEP_ARMS_DOWN);
    expect(mountain).not.toHaveProperty('caution');
  });

  it('leaves cards unchanged when no condition matches', () => {
    for (const profile of [{}, { conditions: [] }, { conditions: ['stiff neck'] }]) {
      const { card } = buildRitual(ritual(), profile, catalog, '');
      expect(card.result.yogaPractice.poses.some((p: any) => 'caution' in p)).toBe(false);
      expect(card.result.breathwork).not.toHaveProperty('caution');
    }
  });

  it('still rejects a practice the condition rules out', () => {
    const { error } = buildRitual(ritual(), { conditions: ['bad knee', 'high BP'] }, catalog, '');
    expect(error).toContain('warrior_1 (contraindicated for knee_injury)');
  });

  it('carries a breath practice’s note, in a ritual and on its own', () => {
    const profile = { conditions: ['asthma'] };
    expect(buildRitual(ritual(), profile, catalog, '').card.result.breathwork.caution).toBe('Asthma: keep the holds short.');
    expect(buildBreathworkCard({ breathworkId: 'sama_vritti' }, profile, catalog).card.pattern.caution).toBe('Asthma: keep the holds short.');
    expect(buildBreathworkCard({ breathworkId: 'sama_vritti' }, {}, catalog).card.pattern).not.toHaveProperty('caution');
  });
});

// Through the chat route, against the configured database (which has the
// Practice Library's cautions): the card shows the note, and Amrita is told.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('caution notes in chat', () => {
  it('reach the card and Amrita', async () => {
    resetCatalogCache();
    const calls: any[] = [];
    const turns = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'create_ritual', input: ritual('nadi_shodhana') }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Enjoy.' }] },
    ];
    const fake = {
      messages: {
        stream: (params: any) => {
          calls.push(structuredClone(params.messages));
          const m = turns.shift();
          return { on: () => {}, finalMessage: async () => m };
        },
      },
    } as any;
    const app = express();
    app.use(express.json());
    registerChatRoute(app, fake, 'test-key');
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'A standing practice please' }], profile: { conditions: ['high BP'] }, localDate: '2026-10-23' });
    const card = res.text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)))
      .find((e) => e.type === 'card')?.card;
    expect(card.result.yogaPractice.poses[0]).toMatchObject({ poseId: 'warrior_1', caution: KEEP_ARMS_DOWN });
    expect(calls[1].at(-1).content[0].content).toContain(`Warrior I: ${KEEP_ARMS_DOWN}`);
  });
});
