import 'dotenv/config';
import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogFromRows, getCatalog, resetCatalogCache } from '../api/_lib/catalog.js';
import {
  approximateLocation,
  temperatures,
  unitFor,
  clearWeatherCache,
  currentWeather,
  describeCode,
  describeCondition,
  feelOf,
  weatherFeel,
  weatherFromForecast,
  weatherFromWeatherKit,
  weatherKitToken,
  weatherProvider,
} from '../api/_lib/weather.js';
import type { Weather } from '../api/_lib/weather.js';
import { BUILT_IN_CATALOG, buildBreathworkCard, buildRitual, buildSystemPrompt, catalogPromptSummary } from '../api/index.js';

// G14: practices the Practice Library marks avoid_weather are not offered in
// that weather where they are: what they said, else the forecast for their
// approximate location (Vercel's IP geolocation, then Open-Meteo).

const weather = (feelsLikeC: number, temperatureC = feelsLikeC): Weather => ({
  temperatureC,
  feelsLikeC,
  description: 'clear',
  windy: false,
  feel: feelOf(feelsLikeC),
  unit: 'C',
});
const COLD = weather(2, 5);
const HOT = weather(34);
const MILD = weather(20);

const ritual = (breathworkId: string) => ({
  title: 'Steady',
  description: 'x',
  summary: 'x',
  doshaTendency: 'Pitta',
  primaryEnergy: 'warm',
  poses: [{ poseId: 'tadasana', durationMinutes: 2 }],
  breathworkId,
  ayurvedic: { assessment: 'x', doshaPrimary: 'Pitta', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
  lifestyleTips: [],
});
const NOW = new Date('2026-10-27T13:00:00Z');
const card = (input: object, w: Weather | null) => buildBreathworkCard(input, {}, BUILT_IN_CATALOG, NOW, new Map(), w);

describe('what counts as hot or cold', () => {
  it('goes by the feels-like temperature, at 10 °C and 30 °C', () => {
    expect([feelOf(-5), feelOf(10), feelOf(11), feelOf(29), feelOf(30)]).toEqual(['cold', 'cold', null, null, 'hot']);
  });
});

describe('weather practices', () => {
  it('refuse Cooling Breath in the cold, saying why and what suits instead', () => {
    const { error } = card({ breathworkId: 'sheetali' }, COLD);
    expect(error).toContain('sheetali is not for cold weather; it feels like 2 °C / 36 °F where they are');
    expect(error).toContain('warming breath in the cold');
    expect(buildRitual(ritual('sheetali'), {}, BUILT_IN_CATALOG, '', NOW, new Map(), COLD).error).toContain('sheetali (not for cold weather');
  });

  it('offer it in mild or hot weather, or with no weather known', () => {
    for (const w of [MILD, HOT, null]) expect(card({ breathworkId: 'sheetali' }, w).card).toBeDefined();
    expect(buildRitual(ritual('sheetali'), {}, BUILT_IN_CATALOG, '', NOW, new Map(), HOT).card).toBeDefined();
  });

  it('go by what they said over the forecast', () => {
    expect(card({ breathworkId: 'sheetali', weatherNow: 'mild' }, COLD).card).toBeDefined();
    expect(card({ breathworkId: 'sheetali', weatherNow: 'cold' }, HOT).error).toContain('not for cold weather; they said it is');
    expect(card({ breathworkId: 'sheetali', weatherNow: 'cold' }, null).error).toContain('they said it is');
  });

  it('leave practices with no weather mark alone', () => {
    expect(card({ breathworkId: 'nadi_shodhana' }, COLD).card).toBeDefined();
    expect(weatherFeel({ weatherNow: 'stormy' }, MILD)).toBeNull();
  });

  it('are marked in Amrita’s catalog', () => {
    expect(catalogPromptSummary(BUILT_IN_CATALOG)).toMatch(/- sheetali \(.*Not in cold weather\./);
  });

  it('come from the Practice Library’s avoid_weather, leaving out "any"', () => {
    const base: any = {
      type: 'pranayama', nameSanskrit: 'x', nameEnglish: 'x', whereShown: 'right_now', minExperience: 'any', intensity: 'gentle',
      settings: ['seated'], effects: ['cooling'], vata: 'neutral', pitta: 'balances', kapha: 'neutral', bestTimes: ['any'],
      cues: [], commonMistakes: [], inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0, cycles: 8,
    };
    const catalog = catalogFromRows(
      [
        { ...base, id: 'B1', appId: 'sheetali', avoidWeather: ['cold'] },
        { ...base, id: 'B2', appId: 'nadi_shodhana', avoidWeather: ['any'] },
      ],
      [],
      BUILT_IN_CATALOG
    );
    expect(catalog.breathworkById.get('sheetali')?.avoidWeather).toEqual(['cold']);
    expect(catalog.breathworkById.get('nadi_shodhana')).not.toHaveProperty('avoidWeather');
  });
});

describe('telling Amrita', () => {
  const prompt = (w: Weather | null) =>
    buildSystemPrompt({}, 'now', 'text', undefined, undefined, undefined, undefined, undefined, undefined, null, NOW, new Map(), w);

  it('gives the weather, and what it rules out', () => {
    const text = prompt(COLD);
    expect(text).toContain('# Weather where they are');
    expect(text).toContain('About 5 °C / 41 °F (feels like 2 °C / 36 °F), clear.');
    expect(text).toContain('lead with °C, which is what people use there, and give °F after it ("5 °C (41 °F)")');
    expect(text).toContain('That counts as cold weather: do not offer practices marked "Not in cold weather"');
  });

  it('gives mild weather without a rule, and says nothing when the weather is unknown', () => {
    expect(prompt(MILD)).toContain('About 20 °C / 68 °F, clear.');
    expect(prompt(MILD)).not.toContain('That counts as');
    expect(prompt(null)).not.toContain('# Weather where they are');
  });

  it('leads with °F where people use it, and follows the unit they use', () => {
    const text = prompt({ ...COLD, unit: 'F' });
    expect(text).toContain('About 41 °F / 5 °C (feels like 36 °F / 2 °C), clear.');
    expect(text).toContain('lead with °F, which is what people use there, and give °C after it ("41 °F (5 °C)")');
    expect(text).toContain('If they use one unit themselves, lead with theirs instead');
  });

  it('always asks her to pass on what they say about their weather', () => {
    expect(prompt(null)).toContain('pass it as weatherNow on the card');
  });
});

describe('where they are', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.WEATHER;
    delete process.env.WEATHER_TEST_LOCATION;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('comes from Vercel’s location headers, rounded to about 10 km', () => {
    expect(approximateLocation({ headers: { 'x-vercel-ip-latitude': '47.6062', 'x-vercel-ip-longitude': '-122.3321' } })).toEqual({ lat: 47.6, lon: -122.3 });
  });

  it('falls back to WEATHER_TEST_LOCATION, and is unknown without either', () => {
    process.env.WEATHER_TEST_LOCATION = '19.076, 72.8777';
    expect(approximateLocation({ headers: {} })).toEqual({ lat: 19.1, lon: 72.9 });
    delete process.env.WEATHER_TEST_LOCATION;
    expect(approximateLocation({ headers: {} })).toBeNull();
    expect(approximateLocation({ headers: { 'x-vercel-ip-latitude': 'x', 'x-vercel-ip-longitude': '2' } })).toBeNull();
  });

  it('is not looked up with WEATHER=off', () => {
    process.env.WEATHER = 'off';
    expect(approximateLocation({ headers: { 'x-vercel-ip-latitude': '47.6', 'x-vercel-ip-longitude': '-122.3' } })).toBeNull();
  });
});

describe('the unit', () => {
  it('is °F in the United States and the few other places that use it, °C elsewhere or when unknown', () => {
    const from = (country?: string) => unitFor({ headers: country ? { 'x-vercel-ip-country': country } : {} });
    expect([from('US'), from('PR'), from('LR'), from('IN'), from('GB'), from()]).toEqual(['F', 'F', 'F', 'C', 'C', 'C']);
  });

  it('shows both, the local one first', () => {
    expect(temperatures(15, 'F')).toBe('59 °F / 15 °C');
    expect(temperatures(-40, 'C')).toBe('-40 °C / -40 °F');
  });
});

describe('the forecast', () => {
  beforeEach(() => {
    clearWeatherCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const forecast = { current: { temperature_2m: 4.6, apparent_temperature: 1.2, weather_code: 61, wind_speed_10m: 35 } };
  const ok = () => vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(forecast)));
  const T = Date.parse('2026-10-27T13:00:00Z');

  it('reads Open-Meteo’s current conditions', () => {
    expect(weatherFromForecast(forecast)).toEqual({ temperatureC: 5, feelsLikeC: 1, description: 'rain', windy: true, feel: 'cold', unit: 'C' });
    expect(weatherFromForecast({})).toBeNull();
    expect([describeCode(0), describeCode(3), describeCode(73), describeCode(95)]).toEqual(['clear', 'overcast', 'snow', 'thunderstorms']);
  });

  it('is asked for the rounded coordinates, once per area per half hour', async () => {
    const fetcher = ok();
    const at = { lat: 47.6, lon: -122.3 };
    expect((await currentWeather(at, fetcher as any, T))?.feel).toBe('cold');
    await currentWeather(at, fetcher as any, T + 29 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('latitude=47.6&longitude=-122.3');
    await currentWeather(at, fetcher as any, T + 31 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('gives nothing when the service fails, and waits five minutes before asking again', async () => {
    const failing = vi.fn(async () => new Response('busy', { status: 429 }));
    const at = { lat: 1, lon: 2 };
    expect(await currentWeather(at, failing as any, T)).toBeNull();
    expect(await currentWeather(at, failing as any, T + 4 * 60_000)).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await currentWeather(at, ok() as any, T + 6 * 60_000)).not.toBeNull();
  });
});

describe('Apple WeatherKit', () => {
  const ENV = ['APPLE_TEAM_ID', 'WEATHERKIT_SERVICE_ID', 'WEATHERKIT_KEY_ID', 'WEATHERKIT_PRIVATE_KEY'] as const;
  const saved: Record<string, string | undefined> = {};
  const T = Date.parse('2026-11-04T09:00:00Z');
  const body = { currentWeather: { temperature: 3.4, temperatureApparent: -0.6, conditionCode: 'Snow', windSpeed: 12 } };
  let publicKey: CryptoKey;

  beforeEach(async () => {
    clearWeatherCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const k of ENV) saved[k] = process.env[k];
    const pair = await generateKeyPair('ES256', { extractable: true });
    publicKey = pair.publicKey as CryptoKey;
    Object.assign(process.env, {
      APPLE_TEAM_ID: 'TEAM123456',
      WEATHERKIT_SERVICE_ID: 'app.pranaveda.weatherkit',
      WEATHERKIT_KEY_ID: 'KEY1234567',
      // As stored in an env editor: line breaks as literal "\n".
      WEATHERKIT_PRIVATE_KEY: (await exportPKCS8(pair.privateKey)).replace(/\n/g, '\\n'),
    });
  });
  afterEach(() => {
    for (const k of ENV) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
    clearWeatherCache();
    vi.restoreAllMocks();
  });

  it('reads current conditions in the same few words', () => {
    expect(weatherFromWeatherKit(body)).toEqual({ temperatureC: 3, feelsLikeC: -1, description: 'snow', windy: false, feel: 'cold', unit: 'C' });
    expect(weatherFromWeatherKit({ currentWeather: { temperature: 33, temperatureApparent: 36, conditionCode: 'MostlyClear', windSpeed: 40 } }))
      .toMatchObject({ description: 'clear', windy: true, feel: 'hot' });
    expect(weatherFromWeatherKit({})).toBeNull();
    expect([describeCondition('Cloudy'), describeCondition('HeavyRain'), describeCondition('ScatteredThunderstorms'), describeCondition('Unknown')])
      .toEqual(['overcast', 'rain', 'thunderstorms', 'unsettled']);
  });

  it('asks Apple with a signed token for the rounded coordinates', async () => {
    expect(weatherProvider()).toBe('weatherkit');
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body)));
    expect((await currentWeather({ lat: 47.6, lon: -122.3 }, fetcher as any, T))?.description).toBe('snow');

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://weatherkit.apple.com/api/v1/weather/en/47.6/-122.3?dataSets=currentWeather');
    const jwt = String((init?.headers as Record<string, string>).Authorization).replace(/^Bearer /, '');
    const header = decodeProtectedHeader(jwt);
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEY1234567', id: 'TEAM123456.app.pranaveda.weatherkit' });
    const { payload } = await jwtVerify(jwt, publicKey, { currentDate: new Date(T) });
    expect(payload).toMatchObject({ iss: 'TEAM123456', sub: 'app.pranaveda.weatherkit' });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(3600);
  });

  it('reuses one token for 50 minutes', async () => {
    const first = await weatherKitToken(T);
    expect(await weatherKitToken(T + 49 * 60_000)).toBe(first);
    expect(await weatherKitToken(T + 51 * 60_000)).not.toBe(first);
  });

  it('gives nothing when Apple refuses, without falling back to Open-Meteo', async () => {
    const refused = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    expect(await currentWeather({ lat: 1, lon: 2 }, refused as any, T)).toBeNull();
    expect(refused).toHaveBeenCalledTimes(1);
    expect(String((refused.mock.calls[0] as unknown[])[0])).toContain('weatherkit.apple.com');
  });

  it('uses Open-Meteo when WeatherKit is not configured, as in local development', async () => {
    delete process.env.WEATHERKIT_PRIVATE_KEY;
    expect(weatherProvider()).toBe('open-meteo');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ current: { temperature_2m: 20, apparent_temperature: 20, weather_code: 0, wind_speed_10m: 5 } })));
    await currentWeather({ lat: 1, lon: 2 }, fetcher as any, T);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('api.open-meteo.com');
  });
});

// Against the configured database: the practices the Practice Library marks.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('weather practices in the database', () => {
  it('are Cooling and Hissing Breath in the cold, Sun-Piercing Breath in the heat', async () => {
    resetCatalogCache();
    const catalog = await getCatalog(BUILT_IN_CATALOG);
    const marked = [...catalog.poses, ...catalog.breathwork].filter((x) => x.avoidWeather).map((x) => `${x.id}:${x.avoidWeather}`);
    expect(marked.sort()).toEqual(['sheetali:cold', 'sheetkari:cold', 'surya_bhedana:hot']);
  });
});
