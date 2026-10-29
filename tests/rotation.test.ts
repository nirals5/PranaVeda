import 'dotenv/config';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '../api/_lib/db.js';
import { practiceIdsIn, recentMainFrom, recentMainPractices } from '../api/_lib/rotation.js';
import { saveProfile } from '../api/_lib/profiles.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { BUILT_IN_CATALOG, buildBreathworkCard, buildRitual, buildSystemPrompt, registerChatRoute } from '../api/index.js';
import { SECRET_A, useSecrets } from './helpers.js';

// G6: a main practice someone signed in completed in the last three days is
// not offered again (unless they ask for it); anchors may repeat.

const TODAY = '2026-10-26';
const breathIdByName = new Map(BUILT_IN_CATALOG.breathwork.map((b) => [b.name.toLowerCase(), b.id]));
const bellows = BUILT_IN_CATALOG.breathwork.find((b) => b.id === 'bhastrika')!.name;
const nadi = BUILT_IN_CATALOG.breathwork.find((b) => b.id === 'nadi_shodhana')!.name;

const ritualEntry = (localDate: string, poseIds: string[], breathName = nadi) => ({
  localDate,
  kind: 'ritual',
  data: { kind: 'ritual', title: 'Flow', result: { yogaPractice: { poses: poseIds.map((poseId) => ({ poseId })) }, breathwork: { name: breathName } } },
});
const breathEntry = (localDate: string, title: string) => ({ localDate, kind: 'breathwork', data: { kind: 'breathwork', title } });

const ritual = (poseIds: string[], breathworkId = 'sama_vritti', extra: object = {}) => ({
  title: 'Steady',
  description: 'x',
  summary: 'x',
  doshaTendency: 'Kapha',
  primaryEnergy: 'bright',
  poses: poseIds.map((poseId) => ({ poseId, durationMinutes: 2 })),
  breathworkId,
  ayurvedic: { assessment: 'x', doshaPrimary: 'Kapha', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
  lifestyleTips: [],
  ...extra,
});

describe('what counts as recently practised', () => {
  it('reads poses by id and the breath by name from a ritual, and a breathwork entry by its title', () => {
    expect(practiceIdsIn('ritual', ritualEntry(TODAY, ['cobra', 'triangle']).data, breathIdByName)).toEqual(['cobra', 'triangle', 'nadi_shodhana']);
    expect(practiceIdsIn('breathwork', { title: bellows }, breathIdByName)).toEqual(['bhastrika']);
    expect(practiceIdsIn('breathwork', { title: 'Something else' }, breathIdByName)).toEqual([]);
    expect(practiceIdsIn('ritual', {}, breathIdByName)).toEqual([]);
  });

  it('covers today and the two days before, keeps the latest date, and leaves out anchors', () => {
    const recent = recentMainFrom(
      [
        ritualEntry('2026-10-23', ['warrior_2']), // three days before today: outside
        ritualEntry('2026-10-24', ['cobra', 'childs_pose']),
        ritualEntry('2026-10-26', ['cobra', 'tadasana'], bellows),
        breathEntry('2026-10-25', nadi),
      ],
      breathIdByName,
      TODAY
    );
    expect(Object.fromEntries(recent)).toEqual({ cobra: '2026-10-26', bhastrika: '2026-10-26', nadi_shodhana: '2026-10-25' });
  });
});

describe('cards', () => {
  const recent = new Map([
    ['cobra', '2026-10-25'],
    ['nadi_shodhana', '2026-10-26'],
  ]);

  it('refuse a main practice done in the last three days, saying when and what to do instead', () => {
    const { error } = buildRitual(ritual(['cobra', 'triangle']), {}, BUILT_IN_CATALOG, '', new Date(), recent);
    expect(error).toContain('Rejected for variety — they did cobra (on 2026-10-25) in the last 3 days');
    expect(error).toContain('serve the same need');
    expect(buildBreathworkCard({ breathworkId: 'nadi_shodhana' }, {}, BUILT_IN_CATALOG, new Date(), recent).error).toContain(
      'nadi_shodhana (on 2026-10-26)'
    );
  });

  it('allow other practices, anchors, and a repeat they asked for', () => {
    expect(buildRitual(ritual(['triangle', 'childs_pose']), {}, BUILT_IN_CATALOG, '', new Date(), recent).error).toBeUndefined();
    const asked = buildRitual(ritual(['cobra', 'triangle'], 'nadi_shodhana', { repeatRequested: true }), {}, BUILT_IN_CATALOG, '', new Date(), recent);
    expect(asked.error).toBeUndefined();
    expect(buildBreathworkCard({ breathworkId: 'nadi_shodhana', repeatRequested: true }, {}, BUILT_IN_CATALOG, new Date(), recent).card).toBeDefined();
  });

  it('change nothing for a guest (no recent practices)', () => {
    expect(buildRitual(ritual(['cobra']), {}, BUILT_IN_CATALOG, '').error).toBeUndefined();
  });

  it('still put safety first', () => {
    const { error } = buildRitual(ritual(['cobra']), { conditions: ['pregnancy'] }, BUILT_IN_CATALOG, '', new Date(), recent);
    expect(error).toContain('Rejected for safety');
  });
});

describe('telling Amrita', () => {
  const prompt = (recent: Map<string, string>) =>
    buildSystemPrompt({}, 'now', 'text', undefined, undefined, undefined, undefined, BUILT_IN_CATALOG, undefined, null, new Date(), recent);

  it('lists what they did recently, by name, and asks for variety', () => {
    const text = prompt(new Map([['cobra', '2026-10-25']]));
    expect(text).toContain('# Recently practised');
    expect(text).toContain('Cobra Pose (cobra, 2026-10-25)');
    expect(text).toContain('repeatRequested: true');
  });

  it('says nothing when there is nothing recent', () => {
    expect(prompt(new Map())).not.toContain('# Recently practised');
  });
});

// End to end against the configured database: a signed-in user's logged
// practices reach Amrita's instructions.
const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
describe.skipIf(!hasDb)('rotation in a signed-in chat', () => {
  const { users, practiceLogEntries } = schema;
  const created: string[] = [];
  beforeAll(() => useSecrets(SECRET_A));
  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  const userWith = async (entries: ReturnType<typeof ritualEntry>[]) => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest rotation' }).returning({ id: users.id });
    created.push(user.id);
    await saveProfile(user.id, {} as any, 0);
    await getDb()
      .insert(practiceLogEntries)
      .values(entries.map((e, i) => ({ userId: user.id, entryId: `e${i}`, completedAt: new Date(`${e.localDate}T12:00:00Z`), localDate: e.localDate, kind: e.kind as 'ritual', data: e.data })));
    return user.id;
  };

  it('reads the practice log', async () => {
    const id = await userWith([ritualEntry('2026-10-25', ['cobra', 'easy_pose']), ritualEntry('2026-10-20', ['triangle'])]);
    expect(Object.fromEntries(await recentMainPractices(id, TODAY, breathIdByName))).toEqual({ cobra: '2026-10-25', nadi_shodhana: '2026-10-25' });
  });

  it('tells Amrita in a signed-in chat', async () => {
    // The server trusts a date only within a day of now, so this uses today's.
    const today = new Date().toISOString().slice(0, 10);
    const id = await userWith([ritualEntry(today, ['cobra'])]);
    const token = await signAccessToken({ userId: id, sessionId: 'test', scope: [] }, 'app');
    let system = '';
    const fake = {
      messages: {
        stream: (params: any) => {
          system = params.system;
          return { on: () => {}, finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello.' }] }) };
        },
      },
    } as any;
    const app = express();
    app.use(express.json());
    registerChatRoute(app, fake, 'test-key');
    await request(app).post('/api/chat').set('Authorization', `Bearer ${token}`).send({ messages: [{ role: 'user', content: 'Hi' }], localDate: today });
    expect(system).toContain('# Recently practised');
    expect(system).toContain(`(cobra, ${today})`);
  });
});
