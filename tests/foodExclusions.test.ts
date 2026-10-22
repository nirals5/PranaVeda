import 'dotenv/config';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_FOOD_RULES,
  FOOD_LEFT_OUT,
  SentenceGate,
  confirmedHits,
  exclusionHits,
  foodHitsIn,
  foodRulesFrom,
  getFoodRules,
  resetFoodRulesCache,
} from '../api/_lib/exclusions.js';
import { BUILT_IN_CATALOG, buildSystemPrompt, fallbacks, practiceNames, registerChatRoute } from '../api/index.js';

// G9: any food, recipe or lifestyle suggestion must pass the Food Library's
// Exclusions tab, synonyms included.

const rules = BUILT_IN_FOOD_RULES;
const ids = (text: string, ignore: string[] = []) => exclusionHits(text, rules, ignore).map((h) => h.id);

describe('the food check', () => {
  it.each([
    ['Add a clove of garlic to your soup.', 'garlic'],
    ['A spoon of shahad in warm water helps.', 'honey'],
    ['Warm Madhū with ginger.', 'honey'],
    ['Sauté the onions gently.', 'onion'],
    ['Try a mushroom broth.', 'mushrooms'],
    ['Ashwagandha with a little datura.', 'toxic_or_practitioner_only_plants'],
    ['Skip coffee and have honey water.', 'honey'],
    ["Don't forget the garlic.", 'garlic'],
    ['Honey water is lovely, and do not add sugar.', 'honey'],
    ['A pinch of kasturi.', 'animal_products_non_dairy'],
    ['Turkey bacon on toast.', 'meat_fish_egg'],
    ['A little grilled salmon.', 'meat_fish_egg'],
    ['Spread some butter on warm roti.', 'butter'],
    ['A bowl of mung sprouts.', 'sprouts_and_shoots'],
    ['A lovely swap would be a warm sauté of grated beetroot or turnip.', 'root_vegetables_and_tubers_anantkaya'],
    ['Replace the rice with potatoes.', 'potato'],
    ['Swap in mushrooms tonight.', 'mushrooms'],
  ])('blocks "%s"', (text, id) => {
    expect(ids(text)).toContain(id);
  });

  it.each([
    'Skip garlic and onion tonight.',
    'Instead of honey, try maple syrup.',
    'Garlic, onion and mushrooms are best avoided.',
    'Keep the soup onion-free.',
    'Prefer ghee over butter.',
    'Swap honey for maple syrup.',
    'Replace the onion with ginger.',
    'Honey can be swapped for date syrup.',
    'Swap out the garlic and add cumin.',
    'Honey is not part of sattvik eating.',
    'Favor madhura rasa, the sweet taste.',
    'A bowl of berries and pomegranate.', // allowed by exception
    'Warm milk with a squeeze of lemon.', // a combination rule: in the prompt only
    'Figure out a gentle rhythm.',
    'Kitchari with ghee, cumin and fresh ginger.',
    // The sheet's "not when" phrases.
    'This practice will lift your spirits.',
    'Rest in Fish Pose for five breaths.',
    'Warm water supports the liver.',
    'Toast with peanut butter and banana.',
    'Roasted Brussels sprouts with cumin.',
  ])('lets "%s" through', (text) => {
    expect(ids(text)).toEqual([]);
  });

  it('never reads a practice name as food', () => {
    expect(ids('Hold the chicken stretch for five breaths.')).toEqual(['meat_fish_egg']);
    expect(ids('Hold the chicken stretch for five breaths.', ['chicken stretch'])).toEqual([]);
    expect(practiceNames(BUILT_IN_CATALOG)).toContain("Child's Pose");
  });

  it('ignores the "not when" phrases of an exclusion', () => {
    const withNotWhen = foodRulesFrom(
      {
        exclusions: [{ id: 'alcohol', item: 'Alcohol', status: 'excluded', notes: null, notWhen: ['lift your spirits'] }],
        terms: [{ exclusionId: 'alcohol', term: 'spirits' }],
        substitutions: [],
      },
      'built-in'
    );
    expect(exclusionHits('This will lift your spirits.', withNotWhen)).toEqual([]);
    expect(exclusionHits('A small glass of spirits.', withNotWhen).map((h) => h.id)).toEqual(['alcohol']);
  });

  it('reads both names in a term like "kanda (onion)"', () => {
    const onion = rules.exclusions.find((e) => e.id === 'onion')!;
    expect(onion.terms).toEqual(expect.arrayContaining(['kanda', 'onion']));
    expect(rules.exclusions.find((e) => e.id === 'animal_products_non_dairy')!.terms).toEqual(
      expect.arrayContaining(['musk', 'kasturi', 'cow urine', 'gomutra'])
    );
  });

  it('checks every string inside a card', () => {
    const card = { ayurvedic: { dietaryTips: ['Warm mung soup', 'Garlic toast'], recommendedHerbs: ['Tulsi'] } };
    expect(foodHitsIn(card, rules).map((h) => h.id)).toEqual(['garlic']);
  });

  it('keeps the built-in fallbacks clean', () => {
    expect(foodHitsIn(fallbacks, rules)).toEqual([]);
  });
});

describe('the sentence gate', () => {
  const gateFor = () => {
    const sent: string[] = [];
    let stopped = 0;
    const gate = new SentenceGate((t) => exclusionHits(t, rules), (t) => sent.push(t), () => stopped++);
    return { gate, sent, stopped: () => stopped };
  };

  it('releases whole sentences only, and stops before one that fails', async () => {
    const { gate, sent, stopped } = gateFor();
    gate.push('Rest well ');
    gate.push('tonight. Add gar');
    gate.push('lic to the soup. Sleep deep.');
    await gate.finish();
    expect(sent).toEqual(['Rest well tonight. ']);
    expect(gate.blocked?.map((h) => h.id)).toEqual(['garlic']);
    expect(gate.blockedText).toBe('Add garlic to the soup. ');
    expect(stopped()).toBe(1);
  });

  it('checks the unfinished last sentence at the end', async () => {
    const { gate, sent } = gateFor();
    gate.push('Sip warm water.\nThen honey');
    await gate.finish();
    expect(sent).toEqual(['Sip warm water.\n']);
    expect(gate.blocked?.[0].id).toBe('honey');
  });

  it('keeps sentences in order while a check is pending', async () => {
    const sent: string[] = [];
    const slow = (t: string) => new Promise<[]>((r) => setTimeout(() => r([]), t.startsWith('One') ? 20 : 0));
    const gate = new SentenceGate(slow, (t) => sent.push(t));
    gate.push('One. ');
    gate.push('Two. ');
    gate.push('Three.');
    await gate.finish();
    expect(sent).toEqual(['One. ', 'Two. ', 'Three.']);
  });
});

describe('the second opinion', () => {
  it('is asked only about sentences the word check flags', async () => {
    let asked = 0;
    const judge = async () => (asked++, true);
    expect(await confirmedHits('Warm mung soup with cumin.', '', rules, [], judge)).toEqual([]);
    expect(asked).toBe(0);
  });

  it('lets a mention through and keeps a suggestion blocked', async () => {
    const mention = 'Potatoes and onions sit outside our sattvik guidance.';
    expect(await confirmedHits(mention, '', rules, [], async () => false)).toEqual([]);
    expect((await confirmedHits('Try roast potatoes.', '', rules, [], async () => true)).map((h) => h.id)).toEqual(['potato']);
  });

  it('keeps the sentence blocked when it fails', async () => {
    const broken = async () => {
      throw new Error('timeout');
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      expect((await confirmedHits('Try roast potatoes.', '', rules, [], broken)).map((h) => h.id)).toEqual(['potato']);
    } finally {
      console.error = quiet;
    }
  });
});

// The chat route, with a stand-in for the Anthropic client that plays
// scripted turns and records what each call was sent.
type Turn = { texts: string[]; message: any };
// `judge` answers the second opinion; without it the call fails, which keeps
// every flagged sentence blocked.
function fakeClaude(turns: Turn[], calls: any[], judge?: (prompt: string) => string, judged: string[] = []) {
  return {
    messages: {
      create: async (params: any) => {
        const prompt = params.messages[0].content;
        judged.push(prompt);
        if (!judge) throw new Error('no judge in this test');
        return { content: [{ type: 'text', text: judge(prompt) }] };
      },
      stream: (params: any) => {
        calls.push(structuredClone(params.messages));
        const turn = turns.shift()!;
        return {
          on: (event: string, cb: (delta: string) => void) => {
            if (event === 'text') turn.texts.forEach((d) => cb(d));
          },
          finalMessage: async () => turn.message,
        };
      },
    },
  } as any;
}
const endTurn = (text: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

async function chat(turns: Turn[], judge?: (prompt: string) => string) {
  const calls: any[] = [];
  const judged: string[] = [];
  const app = express();
  app.use(express.json());
  registerChatRoute(app, fakeClaude(turns, calls, judge, judged), 'test-key');
  const res = await request(app)
    .post('/api/chat')
    .send({ messages: [{ role: 'user', content: 'What should I eat tonight?' }], profile: {}, localTime: 'now', localDate: '2026-10-22' });
  const events = res.text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)));
  return { text: events.filter((e) => e.type === 'text').map((e) => e.delta).join(''), events, calls, judged };
}

describe('chat replies', () => {
  it('keeps a sentence that only mentions an excluded food, when the second opinion says so', async () => {
    const { text, calls, judged } = await chat(
      [{ texts: ['Potatoes and onions sit outside our sattvik guidance. ', 'Try warm mung soup instead.'], message: endTurn('…') }],
      (prompt) => (prompt.includes('sit outside') ? 'NO' : 'YES')
    );
    expect(text).toBe('Potatoes and onions sit outside our sattvik guidance. Try warm mung soup instead.');
    expect(calls).toHaveLength(1);
    expect(judged).toHaveLength(1);
    expect(judged[0]).toContain('Onion (written as "onion")');
  });

  it('blocks a sentence the second opinion reads as a suggestion', async () => {
    const { text, calls } = await chat(
      [
        { texts: ['Rest well tonight. ', 'Roast potatoes would be cosy. '], message: endTurn('…') },
        { texts: ['Warm mung soup would be cosy.'], message: endTurn('…') },
      ],
      () => 'YES'
    );
    expect(text).toBe('Rest well tonight. Warm mung soup would be cosy.');
    expect(calls).toHaveLength(2);
  });

  it('never sends a failing sentence, and Amrita continues once without it', async () => {
    const { text, calls } = await chat([
      { texts: ['Rest well tonight. ', 'Add garlic to warm soup. ', 'Sleep deep.'], message: endTurn('…') },
      { texts: ['Try warm mung soup with cumin.'], message: endTurn('Try warm mung soup with cumin.') },
    ]);
    expect(text).toBe('Rest well tonight. Try warm mung soup with cumin.');
    const retry = calls[1];
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: 'Rest well tonight.' });
    expect(retry.at(-1).content).toContain('Garlic ("garlic")');
  });

  it('asks again from the start when nothing was sent yet', async () => {
    const { text, calls } = await chat([
      { texts: ['Honey in warm water is soothing.'], message: endTurn('…') },
      { texts: ['Warm water with a slice of ginger is soothing.'], message: endTurn('…') },
    ]);
    expect(text).toBe('Warm water with a slice of ginger is soothing.');
    const lastUser = calls[1].at(-1);
    expect(lastUser.role).toBe('user');
    expect(lastUser.content.map((b: any) => b.text).join(' ')).toContain('What should I eat tonight?');
    expect(lastUser.content.at(-1).text).toContain('Reply again');
  });

  it('ends with a plain note when the rewrite fails too', async () => {
    const { text, calls } = await chat([
      { texts: ['Rest well. ', 'Add garlic. '], message: endTurn('…') },
      { texts: ['Then onion soup.'], message: endTurn('…') },
    ]);
    expect(calls).toHaveLength(2);
    expect(text).toBe(`Rest well. ${FOOD_LEFT_OUT}`);
  });

  it('rejects a card that suggests something excluded, so Amrita redoes it', async () => {
    const ritual = {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't1',
          name: 'create_ritual',
          input: {
            title: 'Evening calm',
            description: 'x',
            summary: 'x',
            doshaTendency: 'Vata',
            primaryEnergy: 'calm',
            poses: [{ poseId: 'childs_pose', durationMinutes: 2 }, { poseId: 'tadasana', durationMinutes: 2 }],
            breathworkId: 'sama_vritti',
            ayurvedic: { assessment: 'x', doshaPrimary: 'Vata', dietaryTips: ['Garlic and ghee toast'], lifestyleTips: [], recommendedHerbs: [] },
            lifestyleTips: [],
          },
        },
      ],
    };
    const { events, calls } = await chat([
      { texts: [], message: ritual },
      { texts: ['Let me adjust that.'], message: endTurn('…') },
    ]);
    expect(events.some((e) => e.type === 'card')).toBe(false);
    const result = calls[1].at(-1).content[0];
    expect(result).toMatchObject({ type: 'tool_result', is_error: true });
    expect(result.content).toContain('Garlic');
  });
});

describe('the prompt', () => {
  it('carries the exclusions, the combination rules and the swaps', () => {
    const prompt = buildSystemPrompt({}, 'now');
    expect(prompt).toContain('# Food — sattvik rules');
    expect(prompt).toContain('- Garlic: garlic');
    expect(prompt).toContain('Never combine in one meal or recipe:');
    expect(prompt).toContain('Honey → Maple syrup');
  });
});

// Against the configured database: the app's own copy matches what was last imported.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('the built-in copy', () => {
  it('matches the exclusions in the database', async () => {
    resetFoodRulesCache();
    const db = await getFoodRules();
    expect(db.source).toBe('database');
    const comparable = (r: typeof rules) => ({
      ...r,
      source: undefined,
      exclusions: r.exclusions.map((e) => ({ ...e, terms: [...e.terms].sort() })),
      allowed: r.allowed.map((a) => ({ ...a, terms: [...a.terms].sort() })),
    });
    expect(comparable(db)).toEqual(comparable(rules));
  });
});
