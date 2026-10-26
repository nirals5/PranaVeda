import 'dotenv/config';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '../api/_lib/db.js';
import { OFFER_GAP_DAYS, moveUpFor, moveUpPrompt, recentPracticeDates } from '../api/_lib/moveUp.js';
import { parseProfile } from '../api/_lib/profileSchema.js';
import { saveProfile } from '../api/_lib/profiles.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { applyProfileUpdate, buildSystemPrompt, registerChatRoute } from '../api/index.js';
import { SECRET_A, useSecrets } from './helpers.js';

// After G2: when someone signed in has practised steadily, Amrita may offer —
// once, at most every OFFER_GAP_DAYS — to move their experience up.

const TODAY = '2026-10-24';
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
// `perWeek` practices in each of the last `weeks` weeks.
const steady = (weeks: number, perWeek: number) =>
  Array.from({ length: weeks }, (_, w) => Array.from({ length: perWeek }, (_, i) => ago(w * 7 + i))).flat();

describe('when to offer a move up', () => {
  it('beginner → regular after 10 practices in 3+ different weeks of the last 6', () => {
    expect(moveUpFor('beginner', steady(3, 4), TODAY)).toMatchObject({ from: 'beginner', to: 'regular', practices: 12, activeWeeks: 3, window: 6 });
    expect(moveUpFor('beginner', steady(3, 3), TODAY)).toBeNull(); // 9 practices
    expect(moveUpFor('beginner', steady(2, 6), TODAY)).toBeNull(); // 12, but only 2 weeks
  });

  it('regular → experienced after 24 practices in 6+ different weeks of the last 8', () => {
    expect(moveUpFor('regular', steady(6, 4), TODAY)).toMatchObject({ to: 'experienced', practices: 24, days: 24 });
    expect(moveUpFor('regular', steady(5, 5), TODAY)).toBeNull(); // 25, but only 5 weeks
    expect(moveUpFor('regular', steady(6, 3), TODAY)).toBeNull(); // 18 practices
  });

  it('counts only the window, and several practices on one day each count', () => {
    const old = Array.from({ length: 20 }, () => ago(60));
    expect(moveUpFor('beginner', [...old, ...steady(2, 4)], TODAY)).toBeNull();
    const sameDays = [ago(1), ago(1), ago(1), ago(8), ago(8), ago(8), ago(15), ago(15), ago(15), ago(15)];
    expect(moveUpFor('beginner', sameDays, TODAY)).toMatchObject({ practices: 10, days: 3 });
  });

  it('never for "Not set" or "experienced", and not again within the gap', () => {
    expect(moveUpFor(undefined, steady(6, 5), TODAY)).toBeNull();
    expect(moveUpFor('experienced', steady(8, 5), TODAY)).toBeNull();
    expect(moveUpFor('beginner', steady(3, 4), TODAY, ago(OFFER_GAP_DAYS - 1))).toBeNull();
    expect(moveUpFor('beginner', steady(3, 4), TODAY, ago(OFFER_GAP_DAYS))).not.toBeNull();
  });
});

describe('telling Amrita', () => {
  it('describes the practice and asks her to offer once, change only on a yes, and mark the offer', () => {
    const text = moveUpPrompt({ from: 'regular', to: 'experienced', practices: 26, days: 22, activeWeeks: 7, window: 8 });
    expect(text).toContain('In the last 8 weeks they have completed 26 practices, on 22 different days in 7 different weeks');
    expect(moveUpPrompt({ from: 'beginner', to: 'regular', practices: 12, days: 9, activeWeeks: 3, window: 6 })).toContain('opens nothing new');
    expect(text).toContain('"experienced"');
    expect(text).toContain('only if they say yes');
    expect(text).toContain('markExperienceOffered: true');
    expect(buildSystemPrompt({}, 'now', 'text', undefined, undefined, undefined, undefined, undefined, undefined, null)).not.toContain('# Moving up');
  });

  it('records the offer date through her profile tool', () => {
    expect(applyProfileUpdate({ experience: 'beginner' }, { markExperienceOffered: true }, TODAY)).toMatchObject({
      experience: 'beginner',
      experienceOfferedOn: TODAY,
    });
    expect(applyProfileUpdate({}, { markExperienceOffered: false }, TODAY)).not.toHaveProperty('experienceOfferedOn');
    expect(parseProfile({ experienceOfferedOn: TODAY })).toEqual({ experienceOfferedOn: TODAY });
  });
});

// End to end against the configured database: practices logged for a test
// account reach Amrita's instructions in a signed-in chat.
const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
describe.skipIf(!hasDb)('move-up in a signed-in chat', () => {
  const { users, practiceLogEntries } = schema;
  const created: string[] = [];
  beforeAll(() => useSecrets(SECRET_A));
  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  const userWith = async (profile: object, dates: string[]) => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest move-up' }).returning({ id: users.id });
    created.push(user.id);
    await saveProfile(user.id, profile as any, 0);
    if (dates.length) {
      await getDb()
        .insert(practiceLogEntries)
        .values(dates.map((d, i) => ({ userId: user.id, entryId: `e${i}`, completedAt: new Date(`${d}T12:00:00Z`), localDate: d, kind: 'ritual' as const, data: {} })));
    }
    const token = await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app');
    return { id: user.id, auth: `Bearer ${token}` };
  };

  const systemFor = async (auth: string) => {
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
    await request(app).post('/api/chat').set('Authorization', auth).send({ messages: [{ role: 'user', content: 'Hi' }], localDate: TODAY });
    return system;
  };

  it('reads the practice log', async () => {
    const user = await userWith({}, [ago(2), ago(3), ago(70)]);
    expect((await recentPracticeDates(user.id, TODAY)).sort()).toEqual([ago(3), ago(2)]);
  });

  it('tells Amrita when a beginner has practised steadily, and not once she has offered', async () => {
    const steadyBeginner = await userWith({ experience: 'beginner' }, steady(3, 4));
    expect(await systemFor(steadyBeginner.auth)).toContain('# Moving up');

    const offered = await userWith({ experience: 'beginner', experienceOfferedOn: ago(3) }, steady(3, 4));
    expect(await systemFor(offered.auth)).not.toContain('# Moving up');

    const notYet = await userWith({ experience: 'beginner' }, steady(1, 3));
    expect(await systemFor(notYet.auth)).not.toContain('# Moving up');
  });
});
