import { describe, expect, it } from 'vitest';
import { FEEDBACK_DAYS, feedbackFrom } from '../api/_lib/feedback.js';
import { hintsNow, rightNowPrompt } from '../api/_lib/rightNow.js';
import { BUILT_IN_CATALOG } from '../api/index.js';

// H11: a practice that left them "less settled" twice weighs less in what
// Amrita chooses; one that settled them twice weighs more. Never a refusal.

const TODAY = '2026-10-28';
const breathIdByName = new Map(BUILT_IN_CATALOG.breathwork.map((b) => [b.name.toLowerCase(), b.id]));
const bellows = BUILT_IN_CATALOG.breathwork.find((b) => b.id === 'bhastrika')!.name;
const nadi = BUILT_IN_CATALOG.breathwork.find((b) => b.id === 'nadi_shodhana')!.name;

const ritual = (localDate: string, feeling: string | undefined, poseIds: string[], breathName = nadi) => ({
  localDate,
  kind: 'ritual',
  data: { kind: 'ritual', feeling, result: { yogaPractice: { poses: poseIds.map((poseId) => ({ poseId })) }, breathwork: { name: breathName } } },
});
const breath = (localDate: string, feeling: string | undefined, title: string) => ({ localDate, kind: 'breathwork', data: { kind: 'breathwork', title, feeling } });

describe('counting ratings', () => {
  it('lists a practice rated less settled twice, and one rated more settled twice', () => {
    const fb = feedbackFrom(
      [
        breath('2026-10-20', 'less', bellows),
        breath('2026-10-27', 'less', bellows),
        ritual('2026-10-21', 'more', ['cobra', 'childs_pose']),
        ritual('2026-10-25', 'more', ['cobra', 'triangle']),
      ],
      breathIdByName,
      TODAY
    );
    expect(fb).toEqual({ less: ['bhastrika'], more: ['cobra', 'nadi_shodhana'] });
  });

  it('needs two ratings, and lets a better session cancel a worse one', () => {
    expect(feedbackFrom([breath(TODAY, 'less', bellows)], breathIdByName, TODAY).less).toEqual([]);
    const evened = feedbackFrom(
      [breath('2026-10-01', 'less', bellows), breath('2026-10-02', 'less', bellows), breath('2026-10-03', 'more', bellows), breath('2026-10-04', 'more', bellows)],
      breathIdByName,
      TODAY
    );
    expect(evened).toEqual({ less: [], more: [] });
  });

  it('ignores "about the same", unrated sessions, anchors, and ratings older than 90 days', () => {
    const before = new Date(Date.parse(`${TODAY}T00:00:00Z`) - FEEDBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const fb = feedbackFrom(
      [
        ritual(before, 'less', ['camel']),
        ritual('2026-10-26', 'less', ['camel', 'childs_pose', 'corpse_pose'], 'Three-Part Breath'),
        ritual('2026-10-27', 'same', ['camel']),
        ritual('2026-10-27', undefined, ['camel']),
        ritual('2026-10-28', 'less', ['childs_pose']),
      ],
      breathIdByName,
      TODAY
    );
    expect(fb.less).toEqual([]);
  });

  it('counts a pose once per session, and puts the strongest signal first', () => {
    const fb = feedbackFrom(
      [
        ritual('2026-10-10', 'less', ['camel', 'camel', 'bow']),
        ritual('2026-10-11', 'less', ['camel', 'bow']),
        ritual('2026-10-12', 'less', ['camel']),
      ],
      breathIdByName,
      TODAY
    );
    expect(fb.less.slice(0, 2)).toEqual(['camel', 'nadi_shodhana']);
    expect(fb.less).toContain('bow');
  });
});

describe('what Amrita is told', () => {
  const base = { hour: null, season: null, weather: null };

  it('says nothing without ratings', () => {
    expect(hintsNow(base).hints).not.toContain('H11');
    expect(hintsNow({ ...base, feedback: { less: [], more: [] } }).hints).not.toContain('H11');
  });

  it('names the practices to weigh less, and the ones to lean toward', () => {
    const prompt = rightNowPrompt(hintsNow({ ...base, feedback: { less: ['Bellows Breath'], more: ['Cobra Pose'] } }), new Map());
    expect(prompt).toContain('- These left them less settled more than once lately: Bellows Breath: Lower its weight for that user: choose others that serve the same need, unless they ask for one by name.');
    expect(prompt).toContain('These left them more settled more than once: Cobra Pose; when one suits the moment, lean toward it.');
  });

  it('uses the Rules tab wording, and handles only good ratings', () => {
    const texts = new Map([['H11', 'Lower its weight.']]);
    expect(rightNowPrompt(hintsNow({ ...base, feedback: { less: ['Camel Pose'], more: [] } }), texts)).toContain('Camel Pose: Lower its weight: choose others');
    expect(rightNowPrompt(hintsNow({ ...base, feedback: { less: [], more: ['Cobra Pose'] } }), texts)).toContain(
      '- These left them more settled more than once lately: Cobra Pose: When one suits the moment, lean toward it.'
    );
  });
});
