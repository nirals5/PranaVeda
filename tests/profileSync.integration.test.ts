import 'dotenv/config';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import syncApp from '../api/sync.js';
import authApp from '../api/auth.js';
import { registerChatRoute, userToday } from '../api/index.js';
import { getDb, schema } from '../api/_lib/db.js';
import { saveProfile } from '../api/_lib/profiles.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, later, useSecrets } from './helpers.js';

// Profile sync and the chat's signed-in path, end to end against the real
// database. Claude is replaced by a scripted stand-in, so no API calls are
// made. Skipped when no database is configured; every account created here is
// deleted afterwards.

const hasDb = !!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);
const { users, wellnessProfiles } = schema;

type Scripted = { text?: string; message: any; during?: () => Promise<void> };

// A stand-in for the Anthropic client: each call to messages.stream plays the
// next scripted turn.
function fakeClaude(turns: Scripted[]) {
  return {
    messages: {
      stream: () => {
        const turn = turns.shift()!;
        return {
          on: (event: string, cb: (delta: string) => void) => {
            if (event === 'text' && turn.text) cb(turn.text);
          },
          finalMessage: async () => {
            await turn.during?.();
            return turn.message;
          },
        };
      },
    },
  } as any;
}

const toolTurn = (name: string, input: object) => ({
  message: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `t_${Math.random()}`, name, input }] },
});
const endTurn = { text: 'Noted.', message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Noted.' }] } };

function chatApp(turns: Scripted[]) {
  const app = express();
  app.use(express.json());
  registerChatRoute(app, fakeClaude(turns), 'test-key');
  return app;
}

const events = (body: string) =>
  body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));

const sse = (res: request.Response) => events(res.text);

// Amrita's profile tool always writes its three lists, even when empty.
const lists = { goals: [], conditions: [], preferences: [] };

describe.skipIf(!hasDb)('profile sync and signed-in chat', () => {
  const created: string[] = [];

  const newUser = async () => {
    const [user] = await getDb().insert(users).values({ displayName: 'vitest profile' }).returning({ id: users.id });
    created.push(user.id);
    const token = await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app');
    return { id: user.id, auth: `Bearer ${token}` };
  };

  const stored = async (userId: string) =>
    (await getDb().select().from(wellnessProfiles).where(eq(wellnessProfiles.userId, userId)))[0];

  beforeAll(() => useSecrets(SECRET_A));

  afterAll(async () => {
    for (const id of created) await getDb().delete(users).where(eq(users.id, id));
  });

  describe('/api/sync/profile', () => {
    it('starts empty at version 0, then saves and versions each write', async () => {
      const user = await newUser();
      expect((await request(syncApp).get('/api/sync/profile').set('Authorization', user.auth)).body).toEqual({ profile: {}, version: 0 });

      const first = await request(syncApp).put('/api/sync/profile').set('Authorization', user.auth).send({ profile: { name: 'Asha' }, baseVersion: 0 });
      expect(first.body).toEqual({ profile: { name: 'Asha' }, version: 1 });
      const second = await request(syncApp).put('/api/sync/profile').set('Authorization', user.auth).send({ profile: { name: 'Asha', goals: ['rest'] }, baseVersion: 1 });
      expect(second.body.version).toBe(2);
      expect((await request(syncApp).get('/api/sync/profile').set('Authorization', user.auth)).body).toEqual({ profile: { name: 'Asha', goals: ['rest'] }, version: 2 });
    });

    it('refuses a write based on an old version and returns what is stored now', async () => {
      const user = await newUser();
      await request(syncApp).put('/api/sync/profile').set('Authorization', user.auth).send({ profile: { name: 'Phone' }, baseVersion: 0 });
      const stale = await request(syncApp).put('/api/sync/profile').set('Authorization', user.auth).send({ profile: { name: 'Laptop' }, baseVersion: 0 });
      expect(stale.status).toBe(409);
      expect(stale.body).toEqual({ error: 'version_conflict', profile: { name: 'Phone' }, version: 1 });
      expect((await stored(user.id)).data).toEqual({ name: 'Phone' });
    });

    it('refuses malformed profiles, guests, other sites, and a missing base version', async () => {
      const user = await newUser();
      const put = (body: object) => request(syncApp).put('/api/sync/profile').set('Authorization', user.auth).send(body);
      expect((await put({ profile: { goals: 'not a list' }, baseVersion: 0 })).body).toEqual({ error: 'invalid_profile' });
      expect((await put({ profile: { name: 'Asha' } })).body).toEqual({ error: 'base_version_required' });
      expect((await request(syncApp).get('/api/sync/profile')).status).toBe(401);
      expect((await put({ profile: {}, baseVersion: 0 }).set('Origin', 'https://evil.example')).status).toBe(403);
      expect(await stored(user.id)).toBeUndefined();
    });

    it('is removed when the account is deleted', async () => {
      const user = await newUser();
      await request(syncApp).put('/api/sync/profile').set('Authorization', user.auth).send({ profile: { name: 'Asha' }, baseVersion: 0 });
      const res = await request(authApp).delete('/api/me').set('Authorization', user.auth).send({ confirm: true });
      expect(res.status).toBe(204);
      expect(await stored(user.id)).toBeUndefined();
    });
  });

  describe('/api/chat', () => {
    const say = (app: express.Express, auth?: string, profile: object = {}) => {
      const req = request(app).post('/api/chat');
      if (auth) req.set('Authorization', auth);
      return req.send({ messages: [{ role: 'user', content: 'I want to sleep better' }], profile });
    };

    it('signed out: works exactly as before — the device’s profile in, the updated one out, nothing stored', async () => {
      const app = chatApp([toolTurn('update_wellness_profile', { addGoals: ['sleep better'] }), endTurn]);
      const res = await say(app, undefined, { name: 'Guest Asha' });
      expect(res.status).toBe(200);
      const profile = sse(res).find((e) => e.type === 'profile');
      expect(profile.profile).toEqual({ ...lists, name: 'Guest Asha', goals: ['sleep better'] });
      expect(sse(res).at(-1)).toEqual({ type: 'done' });
    });

    it('signed in: uses the account’s profile, ignores the one sent, and saves Amrita’s changes', async () => {
      const user = await newUser();
      await saveProfile(user.id, { name: 'Asha' }, 0);
      const app = chatApp([toolTurn('update_wellness_profile', { addGoals: ['sleep better'] }), endTurn]);

      const res = await say(app, user.auth, { name: 'Somebody else entirely' });
      const expected = { ...lists, name: 'Asha', goals: ['sleep better'] };
      expect(sse(res).find((e) => e.type === 'profile').profile).toEqual(expected);
      const row = await stored(user.id);
      expect(row.data).toEqual(expected);
      expect(row.version).toBe(2);
    });

    it('signed in with no profile yet: creates one from Amrita’s changes', async () => {
      const user = await newUser();
      const app = chatApp([toolTurn('update_wellness_profile', { set: { name: 'Ravi' } }), endTurn]);
      await say(app, user.auth, { name: 'ignored' });
      expect((await stored(user.id)).data).toEqual({ ...lists, name: 'Ravi' });
    });

    it('keeps a change saved elsewhere while the reply was being written', async () => {
      const user = await newUser();
      await saveProfile(user.id, { name: 'Asha' }, 0);
      const app = chatApp([
        {
          ...toolTurn('update_wellness_profile', { addGoals: ['sleep better'] }),
          // Another device saves while Amrita is still replying.
          during: async () => {
            await saveProfile(user.id, { name: 'Asha', preferences: ['evening practice'] }, 1);
          },
        },
        endTurn,
      ]);
      const res = await say(app, user.auth);
      const expected = { ...lists, name: 'Asha', preferences: ['evening practice'], goals: ['sleep better'] };
      expect(sse(res).find((e) => e.type === 'profile').profile).toEqual(expected);
      expect((await stored(user.id)).data).toEqual(expected);
      expect((await stored(user.id)).version).toBe(3);
    });

    it('answers an expired sign-in with 401 before streaming, so the client can refresh and retry', async () => {
      const user = await newUser();
      const stale = await signAccessToken({ userId: user.id, sessionId: 'test', scope: [] }, 'app', later(new Date(), -3600_000));
      const res = await say(chatApp([endTurn]), `Bearer ${stale}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'token_expired' });
    });

    it('answers a token for a deleted account with 401', async () => {
      const user = await newUser();
      await getDb().delete(users).where(eq(users.id, user.id));
      const res = await say(chatApp([endTurn]), user.auth);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'not_signed_in' });
    });

    describe('dates in the user’s own day', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(UTC_15TH_PDT_14TH);
      });
      afterEach(() => vi.useRealTimers());

      it('signed in without localDate: uses the account’s timezone', async () => {
        const user = await newUser();
        await getDb().update(users).set({ timezone: 'America/Los_Angeles' }).where(eq(users.id, user.id));
        await ritualChat(user.auth);
        expect(((await stored(user.id)).data as any).practiceHistory).toEqual([{ date: '2026-10-14', title: 'Evening wind-down', kind: 'ritual' }]);
      });

      it('signed in: localDate wins over the account’s timezone', async () => {
        const user = await newUser();
        await getDb().update(users).set({ timezone: 'Asia/Tokyo' }).where(eq(users.id, user.id));
        await ritualChat(user.auth, { localDate: '2026-10-14' });
        expect(((await stored(user.id)).data as any).practiceHistory[0].date).toBe('2026-10-14');
      });
    });
  });
});

// 7 pm on 2026-10-14 in California is already the 15th in UTC.
const UTC_15TH_PDT_14TH = new Date('2026-10-15T02:00:00Z');

const ritualInput = {
  title: 'Evening wind-down',
  description: 'Slow and grounding',
  summary: 'For a restless evening',
  doshaTendency: 'Vata',
  primaryEnergy: 'Scattered Wind',
  poses: [{ poseId: 'tadasana', durationMinutes: 2 }],
  breathworkId: 'sama_vritti',
  ayurvedic: { assessment: 'x', doshaPrimary: 'Vata', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
  lifestyleTips: [],
};

const ritualChat = async (auth?: string, extra: object = {}) => {
  const req = request(chatApp([toolTurn('create_ritual', ritualInput), endTurn])).post('/api/chat');
  if (auth) req.set('Authorization', auth);
  const res = await req.send({ messages: [{ role: 'user', content: 'Something for tonight' }], profile: {}, ...extra });
  return sse(res).find((e) => e.type === 'profile')?.profile;
};

describe('/api/chat dates what Amrita records in the user’s own day', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(UTC_15TH_PDT_14TH);
  });
  afterEach(() => vi.useRealTimers());

  it('a ritual created with localDate 2026-10-14 is recorded on the 14th, though it is the 15th in UTC', async () => {
    const profile = await ritualChat(undefined, { localDate: '2026-10-14' });
    expect(profile.practiceHistory).toEqual([{ date: '2026-10-14', title: 'Evening wind-down', kind: 'ritual' }]);
  });

  it('dates breathwork, observations and the dosha profile the same way', async () => {
    const app = chatApp([
      toolTurn('suggest_breathwork', { breathworkId: 'sama_vritti' }),
      toolTurn('update_wellness_profile', { addObservation: 'Restless after work' }),
      toolTurn('present_dosha_profile', { primary: 'Vata', balance: { vata: 50, pitta: 30, kapha: 20 }, confidence: 'medium' }),
      endTurn,
    ]);
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }], profile: {}, localDate: '2026-10-14' });
    const profile = sse(res).find((e) => e.type === 'profile').profile;
    expect(profile.practiceHistory[0].date).toBe('2026-10-14');
    expect(profile.observations).toEqual([{ date: '2026-10-14', note: 'Restless after work' }]);
    expect(profile.doshaProfile.assessedDate).toBe('2026-10-14');
  });

  it('falls back to the UTC date when localDate is missing (older clients)', async () => {
    expect((await ritualChat()).practiceHistory[0].date).toBe('2026-10-15');
  });

  it.each([
    ['malformed', '10/14/2026'],
    ['not a real day', '2026-02-30'],
    ['more than a day from UTC', '2026-10-12'],
    ['not a string', 20261014],
  ])('falls back to the UTC date when localDate is %s', async (_, localDate) => {
    expect((await ritualChat(undefined, { localDate })).practiceHistory[0].date).toBe('2026-10-15');
  });
});

describe('userToday', () => {
  const now = UTC_15TH_PDT_14TH;
  it('accepts a localDate within a day either side of the UTC date', () => {
    expect(userToday('2026-10-14', null, now)).toBe('2026-10-14');
    expect(userToday('2026-10-16', null, now)).toBe('2026-10-16');
    expect(userToday('2026-10-17', null, now)).toBe('2026-10-15');
  });
  it('uses the timezone when localDate is unusable, and UTC for an unknown timezone', () => {
    expect(userToday(undefined, 'America/Los_Angeles', now)).toBe('2026-10-14');
    expect(userToday('nope', 'Asia/Tokyo', now)).toBe('2026-10-15');
    expect(userToday(undefined, 'Not/AZone', now)).toBe('2026-10-15');
  });
});
