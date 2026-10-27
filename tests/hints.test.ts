import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { catalogFromRows, getCatalog, resetCatalogCache } from '../api/_lib/catalog.js';
import { hintsNow, localHour, rightNowPrompt, seasonOf } from '../api/_lib/rightNow.js';
import type { Weather } from '../api/_lib/weather.js';
import { BUILT_IN_CATALOG, buildSystemPrompt, catalogPromptSummary } from '../api/index.js';

// Hints H1–H9 from the Rules tab: leanings for the time of day, the season and
// the weather, told to Amrita in a "Right now" section. They never refuse a card.

const weather = (feel: Weather['feel'], windy = false): Weather => ({
  temperatureC: 15, feelsLikeC: 15, description: 'clear', windy, feel, unit: 'C',
});

describe('the hour they sent', () => {
  it('is read from the website, iOS and Android times', () => {
    expect(localHour('10/27/2026, 1:20:00 PM')).toBe(13);
    expect(localHour('10/27/2026, 1:20:00 PM')).toBe(13); // iOS: a narrow space before PM
    expect(localHour('10/27/2026, 12:05:00 AM')).toBe(0);
    expect(localHour('10/27/2026, 12:05:00 PM')).toBe(12);
    expect(localHour('Tuesday 7:30 am')).toBe(7);
    expect(localHour('27/10/2026, 21:15:00')).toBe(21);
    expect(localHour('2026-10-27 06:00')).toBe(6);
  });

  it('is unknown when there is no time to read', () => {
    for (const t of ['now', '', undefined, 42, '13:00 PM', '25:00']) expect(localHour(t)).toBeNull();
  });
});

describe('the season', () => {
  it('follows the proposed dates in the north, and where they are is unknown', () => {
    const at = (day: string) => seasonOf(day, 47.6);
    expect([at('2026-09-22'), at('2026-09-23'), at('2026-12-31'), at('2027-01-15')]).toEqual(['summer', 'autumn_winter', 'autumn_winter', 'autumn_winter']);
    expect([at('2027-01-16'), at('2027-06-20'), at('2027-06-21')]).toEqual(['spring', 'spring', 'summer']);
    expect(seasonOf('2026-10-27', null)).toBe('autumn_winter');
  });

  it('is six months on south of the tropics', () => {
    expect(seasonOf('2026-10-27', -33.9)).toBe('spring'); // Sydney in October
    expect(seasonOf('2026-04-10', -33.9)).toBe('autumn_winter');
    expect(seasonOf('2027-01-10', -37.8)).toBe('summer');
  });

  it('is not given in the tropics', () => {
    expect(seasonOf('2026-10-27', 19.1)).toBeNull(); // Mumbai
    expect(seasonOf('2026-10-27', -6.2)).toBeNull(); // Jakarta
    expect(seasonOf('2026-10-27', 23.6)).toBe('autumn_winter');
  });
});

describe('which hints apply', () => {
  const at = (hour: number | null) => hintsNow({ hour, season: null, weather: null });

  it('take the time of day from the Rules tab’s windows', () => {
    expect([5, 6, 9, 10, 13, 14, 17, 18, 19, 20, 23, 0, 3, 4].map((h) => at(h).join() || '-')).toEqual(
      ['-', 'H1', 'H1', 'H2', 'H2', 'H3', 'H3', '-', '-', 'H4', 'H4', 'H4', 'H4', '-']
    );
    expect(at(null)).toEqual([]);
  });

  it('add the season and the weather', () => {
    expect(hintsNow({ hour: 7, season: 'autumn_winter', weather: weather('cold') })).toEqual(['H1', 'H5', 'H8']);
    expect(hintsNow({ hour: null, season: 'spring', weather: weather(null, true) })).toEqual(['H6', 'H8']);
    expect(hintsNow({ hour: null, season: 'summer', weather: weather('hot') })).toEqual(['H7', 'H9']);
    expect(hintsNow({ hour: null, season: null, weather: weather(null) })).toEqual([]);
  });
});

describe('telling Amrita', () => {
  it('gives only the hints that apply, in the Rules tab’s words when it has them', () => {
    const text = rightNowPrompt(['H1', 'H5'], new Map([['H1', 'Lean toward N3 Energize, gently']]));
    expect(text).toContain('# Right now');
    expect(text).toContain('- Early morning (Kapha time): Lean toward N3 Energize, gently.');
    expect(text).toContain('- Autumn and early winter: Bias toward grounding and warming.');
    expect(text).not.toContain('Evening');
    expect(text).toContain('What they tell you comes first, and every safety rule above always does.');
  });

  it('says nothing when no hint applies', () => {
    expect(rightNowPrompt([], new Map())).toBe('');
  });

  it('is part of her prompt', () => {
    const prompt = (hints: any[]) =>
      buildSystemPrompt({}, 'now', 'text', undefined, undefined, undefined, undefined, BUILT_IN_CATALOG, undefined, null, new Date(), new Map(), null, hints);
    expect(prompt(['H4'])).toContain('- Evening: Lighter practices; lean toward N6 Wind down.');
    expect(prompt([])).not.toContain('# Right now');
  });
});

describe('the needs each practice serves', () => {
  it('are shown in Amrita’s catalog, with the Rules tab’s hints', () => {
    const base: any = {
      type: 'pranayama', nameSanskrit: 'x', nameEnglish: 'x', whereShown: 'right_now', minExperience: 'any', intensity: 'gentle',
      settings: ['seated'], effects: ['calming'], vata: 'balances', pitta: 'neutral', kapha: 'neutral', bestTimes: ['any'],
      cues: [], commonMistakes: [], inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0, cycles: 8, avoidWeather: [],
    };
    const catalog = catalogFromRows(
      [{ ...base, id: 'B1', appId: 'nadi_shodhana' }, { ...base, id: 'B2', appId: 'sama_vritti' }],
      [],
      BUILT_IN_CATALOG,
      BUILT_IN_CATALOG.conditions,
      [],
      new Set(['B1', 'B2']),
      new Map([['B1', ['N1 Ground', 'N6 Wind down']]]),
      new Map([['H1', 'Lean toward N3 Energize']])
    );
    const summary = catalogPromptSummary(catalog);
    expect(summary).toMatch(/- nadi_shodhana \(.* Serves: N1 Ground, N6 Wind down\./);
    expect(summary).not.toMatch(/- sama_vritti \(.*Serves/);
    expect(catalog.hints.get('H1')).toBe('Lean toward N3 Energize');
  });
});

// Against the configured database: needs and hints are read with the catalog.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('needs and hints in the database', () => {
  it('give every served practice its needs, and H1–H9 their wording', async () => {
    resetCatalogCache();
    const catalog = await getCatalog(BUILT_IN_CATALOG);
    expect(catalog.source).toBe('database');
    for (const x of [...catalog.poses, ...catalog.breathwork]) expect(x.needs?.length, x.id).toBeGreaterThan(0);
    for (const id of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9']) expect(catalog.hints.get(id), id).toBeTruthy();
  });
});
