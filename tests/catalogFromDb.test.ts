import 'dotenv/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { schema } from '../api/_lib/db.js';

// The practice catalog read from the practices tables: how rows become the
// catalog clients already know, and the fallback to the built-in catalog.

const dbMock = vi.hoisted(() => ({ fail: false, calls: 0 }));
vi.mock('../api/_lib/db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/_lib/db.js')>();
  return {
    ...real,
    getDb: () => {
      dbMock.calls += 1;
      if (dbMock.fail) throw new Error('database unreachable');
      return real.getDb();
    },
  };
});

const { catalogFromRows, describeTimes, getCatalog, resetCatalogCache } = await import('../api/_lib/catalog.js');
const { BUILT_IN_CATALOG, BUILT_IN_CONDITIONS, POSES, BREATHWORK, catalogPromptSummary, publicCatalog } = await import('../api/index.js');

const configured = { url: process.env.DATABASE_URL, pooled: process.env.DATABASE_URL_POOLED };
const hasDb = !!(configured.url || configured.pooled);

type Row = typeof schema.practices.$inferSelect;
const row = (overrides: Partial<Row>): Row => ({
  id: 'P09',
  appId: 'childs_pose',
  type: 'asana',
  nameSanskrit: 'Balasana',
  nameEnglish: "Child's Pose",
  sourceLevel: 'Beginner',
  sourceBodyArea: 'Back / Restorative / Hips',
  whereShown: 'right_now',
  mergedInto: null,
  minExperience: 'any',
  intensity: 'gentle',
  settings: ['floor'],
  settingNote: null,
  durationMin: 1.5,
  effects: ['calming'],
  vata: 'balances',
  pitta: 'balances',
  kapha: 'neutral',
  doshaVata: 'Deeply grounding',
  doshaPitta: null,
  doshaKapha: null,
  bestTimes: ['evening', 'any'],
  timingNote: null,
  bestWeather: [],
  counterPoseId: null,
  avoidNotes: 'Late pregnancy: widen knees.',
  avoidWeather: [],
  avoidAfterMeal: false,
  plainBenefit: 'A gentle rest.',
  image: 'childs_pose.jpg',
  cues: ['Sink hips toward heels'],
  commonMistakes: ['Forcing'],
  modifications: 'Use a cushion.',
  breathDescription: null,
  inhaleSec: null,
  holdInSec: null,
  exhaleSec: null,
  holdOutSec: null,
  cycles: null,
  ayurvedicNote: null,
  sourceCaution: null,
  dataFlag: null,
  basis: 'AI-drafted',
  status: 'draft',
  reviewedBy: null,
  reviewedOn: null,
  iyengarRef: null,
  classicalRef: null,
  classicalSourceId: null,
  retiredAt: null,
  ...overrides,
});
const breathRow = (overrides: Partial<Row> = {}) =>
  row({
    id: 'B01',
    appId: 'nadi_shodhana',
    type: 'pranayama',
    nameSanskrit: 'Nadi Shodhana',
    nameEnglish: 'Alternate Nostril Breathing',
    sourceLevel: null,
    image: null,
    cues: [],
    commonMistakes: [],
    avoidNotes: null,
    breathDescription: 'Balance left and right.',
    inhaleSec: 4,
    holdInSec: 4,
    exhaleSec: 6,
    holdOutSec: 0,
    cycles: 10,
    ayurvedicNote: 'Tridoshic.',
    bestTimes: ['any'],
    ...overrides,
  });
const builtIn = { poses: POSES, breathwork: BREATHWORK, conditions: BUILT_IN_CONDITIONS };

describe('catalog from the practices tables', () => {
  it('builds poses and breath practices in the shape clients know', () => {
    const catalog = catalogFromRows(
      [row({ counterPoseId: 'P35' }), row({ id: 'P35', appId: 'tadasana', nameEnglish: 'Mountain Pose', image: null }), breathRow()],
      [
        { practiceId: 'P09', conditionCode: 'knee_injury', level: 'avoid' },
        { practiceId: 'P09', conditionCode: 'pregnancy', level: 'caution' },
        { practiceId: 'B01', conditionCode: 'nasal_congestion', level: 'avoid' },
      ],
      builtIn
    );
    expect(catalog.source).toBe('database');
    expect(catalog.poseById.get('childs_pose')).toMatchObject({
      nameEnglish: "Child's Pose",
      level: 'Beginner',
      contraindications: ['knee_injury'],
      cautions: ['pregnancy'],
      safetyNote: 'Late pregnancy: widen knees.',
      dosha: { vata: 'Deeply grounding', pitta: 'Balancing', kapha: 'Neutral' },
      bestTime: 'Evening (also any time)',
      counterPoseId: 'tadasana',
      defaultDurationMin: 1.5,
      poseImageUrl: '/poses/childs_pose.jpg',
    });
    // No photo in the sheet: keep the picture the built-in catalog shows.
    expect(catalog.poseById.get('tadasana')!.poseImageUrl).toBe(POSES.find((p) => p.id === 'tadasana')!.poseImageUrl);
    expect(catalog.breathworkById.get('nadi_shodhana')).toMatchObject({
      name: 'Alternate Nostril Breathing',
      inhale: 4,
      holdActive: 4,
      exhale: 6,
      holdEmpty: 0,
      cycles: 10,
      doshaSuitability: 'Tridoshic.',
      contraindications: ['nasal_congestion'],
    });
  });

  it('keeps the built-in order, with new practices after it', () => {
    const catalog = catalogFromRows(
      [row({ id: 'P99', appId: 'new_pose' }), row({}), row({ id: 'P35', appId: 'tadasana' }), breathRow()],
      [],
      builtIn
    );
    expect(catalog.poses.map((p) => p.id)).toEqual(['tadasana', 'childs_pose', 'new_pose']);
  });

  it('serves only linked, current, shown practices with something to show', () => {
    const catalog = catalogFromRows(
      [
        row({}),
        row({ id: 'P02', appId: null }),
        row({ id: 'P03', appId: 'retired', retiredAt: new Date() }),
        row({ id: 'P08', appId: 'merged', mergedInto: 'P09', whereShown: 'hidden' }),
        row({ id: 'P04', appId: 'no_cues', cues: [] }),
        breathRow({ id: 'B05', appId: 'no_counts', inhaleSec: null }),
        breathRow(),
      ],
      [],
      builtIn
    );
    expect(catalog.poses.map((p) => p.id)).toEqual(['childs_pose']);
    expect(catalog.breathwork.map((b) => b.id)).toEqual(['nadi_shodhana']);
  });

  it('never serves an explore-only or hidden practice, even one linked to the app (G3)', () => {
    const catalog = catalogFromRows(
      [
        row({}),
        row({ id: 'P02', appId: 'handstand', nameEnglish: 'Handstand', whereShown: 'explore_only' }),
        row({ id: 'P05', appId: 'hidden_pose', whereShown: 'hidden' }),
        row({ id: 'P06', appId: 'not_placed', whereShown: null }),
        breathRow(),
      ],
      [],
      builtIn
    );
    expect(catalog.poses.map((p) => p.id)).toEqual(['childs_pose']);
  });

  it('lists explore-only poses for the apps\' Explore, with what to avoid them with (G3)', () => {
    const headstand = row({
      id: 'P33',
      appId: null,
      nameSanskrit: 'Sirsasana',
      nameEnglish: 'Headstand',
      sourceBodyArea: 'Full-Body / Inversion / Core',
      whereShown: 'explore_only',
      minExperience: 'experienced',
      intensity: 'strong',
      counterPoseId: 'P09',
      avoidAfterMeal: true,
      plainBenefit: 'A full inversion that builds focus.',
      cues: ['Learn it with a teacher'],
      sourceCaution: 'Demanding.',
    });
    const catalog = catalogFromRows(
      [
        row({}),
        headstand,
        row({ id: 'P38', appId: null, nameEnglish: 'Camel Pose', whereShown: 'explore_only', cues: [] }), // nothing to show yet
        row({ id: 'P16', appId: null, nameEnglish: 'Plow Pose', whereShown: 'explore_only', retiredAt: new Date() }),
        breathRow(),
      ],
      [{ practiceId: 'P33', conditionCode: 'neck_injury', level: 'avoid' }, { practiceId: 'P33', conditionCode: 'glaucoma', level: 'caution' }],
      builtIn,
      [{ code: 'neck_injury', label: 'Neck injury', userWords: ['stiff neck'] }]
    );
    expect(catalog.poses.map((p) => p.id)).toEqual(['childs_pose']);
    expect(catalog.explore).toEqual([
      {
        id: 'P33',
        nameSanskrit: 'Sirsasana',
        nameEnglish: 'Headstand',
        bodyFocus: 'Full-Body / Inversion / Core',
        benefits: 'A full inversion that builds focus.',
        cues: ['Learn it with a teacher'],
        commonMistakes: ['Forcing'],
        modifications: 'Use a cushion.',
        avoidWith: [{ code: 'neck_injury', label: 'Neck injury', words: ['stiff neck'] }],
        sourceCaution: 'Demanding.',
        followWith: "Child's Pose",
        avoidAfterMeal: true,
      },
    ]);
    expect(catalogPromptSummary(catalog)).toContain('## Explore only (G3: NEVER recommend, guide or put in a card)\nHeadstand.');
    expect(publicCatalog('https://x', catalog).explore).toHaveLength(1);
    expect(BUILT_IN_CATALOG.explore).toEqual([]);
    expect(catalogPromptSummary(BUILT_IN_CATALOG)).not.toContain('Explore only');
  });

  it('skips a practice missing any tag the engine needs (G4)', () => {
    const untagged: Partial<Row>[] = [
      { minExperience: null },
      { intensity: null },
      { vata: null },
      { pitta: null },
      { kapha: null },
      { settings: [] },
      { effects: [] },
      { bestTimes: [] },
    ];
    const catalog = catalogFromRows(
      [row({}), ...untagged.map((missing, i) => row({ id: `P7${i}`, appId: `untagged_${i}`, ...missing })), breathRow({ effects: [] })],
      [],
      builtIn
    );
    expect(catalog.poses.map((p) => p.id)).toEqual(['childs_pose']);
    expect(catalog.breathwork).toEqual([]);
  });

  it('skips a practice that serves no need, when needs are known (G4)', () => {
    const rows = [row({}), row({ id: 'P35', appId: 'tadasana' }), breathRow()];
    const catalog = catalogFromRows(rows, [], builtIn, BUILT_IN_CONDITIONS, [], new Set(['P09', 'B01']));
    expect(catalog.poses.map((p) => p.id)).toEqual(['childs_pose']);
    expect(catalog.breathwork.map((b) => b.id)).toEqual(['nadi_shodhana']);
  });

  it('describes best times with the preferred one first', () => {
    expect(describeTimes(['morning'], 'On an empty stomach.')).toBe('Morning. On an empty stomach.');
    expect(describeTimes(['evening', 'any'], null)).toBe('Evening (also any time)');
    expect(describeTimes([], null)).toBe('Any time');
  });
});

describe('getCatalog', () => {
  beforeEach(() => {
    resetCatalogCache();
    dbMock.fail = false;
    dbMock.calls = 0;
  });
  afterEach(() => {
    process.env.DATABASE_URL = configured.url ?? '';
    process.env.DATABASE_URL_POOLED = configured.pooled ?? '';
    resetCatalogCache();
    vi.restoreAllMocks();
  });

  it('serves the built-in catalog when there is no database', async () => {
    process.env.DATABASE_URL = '';
    process.env.DATABASE_URL_POOLED = '';
    const catalog = await getCatalog(builtIn);
    expect(catalog.source).toBe('built-in');
    expect(catalog.poses).toBe(POSES);
    expect(dbMock.calls).toBe(0);
  });

  it('falls back to the built-in catalog when the database fails, and retries later', async () => {
    process.env.DATABASE_URL = 'postgres://example.invalid/db';
    dbMock.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = 1_000_000;
    expect((await getCatalog(builtIn, t)).source).toBe('built-in');
    await getCatalog(builtIn, t + 30_000); // within the retry window: not tried again
    expect(dbMock.calls).toBe(1);
    await getCatalog(builtIn, t + 61_000);
    expect(dbMock.calls).toBe(2);
  });
});

// Against the real database, when one is configured: the served catalog keeps
// every id the built-in catalog has, in the same order, so saved rituals still
// resolve (practices added in the sheet follow them), and every safety tag the
// built-in catalog enforces is still there.
// The sheet turns these few into cautions (offered with an adaptation, G13);
// any other loosening fails here.
const NOW_CAUTIONS = [
  'childs_pose: pregnancy',
  'standing_forward_fold: hypertension',
  'tree_pose: balance_issues',
  'triangle: neck_injury',
  'warrior_1: hypertension',
];

describe.skipIf(!hasDb)('catalog from the configured database', () => {
  it('serves every built-in id and keeps every built-in safety tag', async () => {
    resetCatalogCache();
    dbMock.fail = false;
    const catalog = await getCatalog(builtIn);
    expect(catalog.source).toBe('database');
    const builtInPoses = BUILT_IN_CATALOG.poses.map((p) => p.id);
    const builtInBreaths = BUILT_IN_CATALOG.breathwork.map((b) => b.id);
    expect(catalog.poses.map((p) => p.id).slice(0, builtInPoses.length)).toEqual(builtInPoses);
    expect(catalog.breathwork.map((b) => b.id).slice(0, builtInBreaths.length)).toEqual(builtInBreaths);
    const sameAs = (tag: string) => (tag === 'vertigo' ? 'balance_issues' : tag);
    const becameCautions: string[] = [];
    for (const x of [...BUILT_IN_CATALOG.poses, ...BUILT_IN_CATALOG.breathwork]) {
      const served = catalog.poseById.get(x.id) ?? catalog.breathworkById.get(x.id)!;
      for (const tag of x.contraindications.map(sameAs)) {
        if (served.contraindications.includes(tag)) continue;
        expect(served.cautions ?? [], `${x.id}: ${tag} is neither avoided nor a caution`).toContain(tag);
        becameCautions.push(`${x.id}: ${tag}`);
      }
    }
    expect(becameCautions.sort()).toEqual(NOW_CAUTIONS);
  });

  it('lists the explore-only poses, none of which Amrita can offer (G3)', async () => {
    resetCatalogCache();
    dbMock.fail = false;
    const catalog = await getCatalog(builtIn);
    expect(catalog.explore.map((p) => p.nameEnglish)).toContain('Headstand');
    const offered = new Set(catalog.poses.map((p) => p.nameEnglish));
    for (const p of catalog.explore) {
      expect(offered.has(p.nameEnglish), p.nameEnglish).toBe(false);
      expect(p.cues.length, p.nameEnglish).toBeGreaterThan(0);
    }
  });

  it('carries the Conditions tab, so everyday words reach the right code', async () => {
    resetCatalogCache();
    dbMock.fail = false;
    const catalog = await getCatalog(builtIn);
    const codes = catalog.conditions.map((c) => c.code);
    expect(codes).toContain('balance_issues');
    expect(codes).toContain('asthma');
    // Every code a served practice uses is one the profile tool can name.
    const used = new Set([...catalog.poses, ...catalog.breathwork].flatMap((x) => [...x.contraindications, ...(x.cautions ?? [])]));
    expect([...used].filter((code) => !codes.includes(code))).toEqual([]);
  });
});
