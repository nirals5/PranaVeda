import { describe, expect, it } from 'vitest';
import { exploreNotFor } from '../api/_lib/explore.js';
import type { ExplorePose } from '../api/_lib/explore.js';

// The website's Explore tab says "Not for you" the way the apps do; these are
// the iOS and Android ExploreTests cases.
const HEADSTAND: ExplorePose = {
  id: 'P33',
  nameSanskrit: 'Sirsasana',
  nameEnglish: 'Headstand',
  bodyFocus: 'Full-Body / Inversion / Core',
  benefits: 'A full inversion that builds focus.',
  cues: ['Learn it with a teacher'],
  commonMistakes: ['Kicking up'],
  modifications: 'Dolphin Pose first.',
  avoidWith: [
    { code: 'neck_injury', label: 'Neck injury', words: ['stiff neck', 'whiplash'] },
    { code: 'hypertension', label: 'High blood pressure', words: ['high bp'] },
  ],
  followWith: "Child's Pose",
  avoidAfterMeal: true,
};

describe('Explore: not for you', () => {
  it.each([
    [['Whiplash last year'], ['Neck injury']],
    [['high BP', 'neck injury'], ['Neck injury', 'High blood pressure']],
    [['hypertension'], ['High blood pressure']],
    [['neck_injury'], ['Neck injury']],
  ])('%j → %j', (said, labels) => {
    expect(exploreNotFor(HEADSTAND, said)).toEqual(labels);
  });

  it('matches whole words only, and nothing when no conditions are given', () => {
    expect(exploreNotFor(HEADSTAND, ['sore knee'])).toEqual([]);
    expect(exploreNotFor(HEADSTAND, ['allergic to my necklace'])).toEqual([]);
    expect(exploreNotFor(HEADSTAND, [])).toEqual([]);
    expect(exploreNotFor(HEADSTAND, undefined)).toEqual([]);
  });
});
