import type { Request } from 'express';
import { SignJWT, importPKCS8 } from 'jose';

// G14, weather. The weather where someone is now, so that practices the
// Practice Library marks avoid_weather (Cooling and Hissing Breath in the
// cold, Sun-Piercing Breath in the heat) are not offered.
//
// Where someone is comes from the approximate location Vercel adds to every
// request (from the network address, city level, no permission prompt). The
// weather comes from Apple's WeatherKit REST API when it is configured
// (WEATHERKIT_* and APPLE_TEAM_ID; included with the Apple Developer Program,
// commercial use allowed). If WeatherKit fails, or is not configured (as in
// local development), MET Norway's Locationforecast stands in: free, no key,
// commercial use allowed under CC BY 4.0 with credit. Coordinates are
// rounded to a tenth of a degree (about 10 km) before they leave the server,
// and are never stored. What the person says about their weather wins over the
// forecast.

export type WeatherFeel = 'hot' | 'cold';

export interface Weather {
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  windy: boolean;
  feel: WeatherFeel | null;
  // The unit people use where they are, which Amrita leads with.
  unit: TemperatureUnit;
}

export type TemperatureUnit = 'C' | 'F';

// Where Fahrenheit is the everyday unit: the United States and its
// territories, Liberia, Myanmar, the Bahamas, the Cayman Islands, Palau,
// Micronesia and the Marshall Islands.
const FAHRENHEIT_COUNTRIES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'LR', 'MM', 'BS', 'KY', 'PW', 'FM', 'MH']);

// From Vercel's country header for the request; Celsius when it is unknown.
export function unitFor(req: Pick<Request, 'headers'>): TemperatureUnit {
  const country = String(first(req.headers['x-vercel-ip-country']) ?? '').trim().toUpperCase();
  return FAHRENHEIT_COUNTRIES.has(country) ? 'F' : 'C';
}

export const fahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

// "59 °F / 15 °C", the local unit first.
export function temperatures(celsius: number, unit: TemperatureUnit): string {
  const c = `${celsius} °C`;
  const f = `${fahrenheit(celsius)} °F`;
  return unit === 'F' ? `${f} / ${c}` : `${c} / ${f}`;
}

// Feels-like temperatures at or past these count as cold or hot weather.
export const COLD_AT_C = 10;
export const HOT_AT_C = 30;

const CACHE_MS = 30 * 60 * 1000;
const FAILED_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 1500;

export function feelOf(feelsLikeC: number): WeatherFeel | null {
  if (feelsLikeC <= COLD_AT_C) return 'cold';
  if (feelsLikeC >= HOT_AT_C) return 'hot';
  return null;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const round = (n: number) => Math.round(n * 10) / 10;

// Where the request came from, rounded. On Vercel, its IP geolocation headers;
// locally there are none, so WEATHER_TEST_LOCATION="47.6,-122.3" stands in.
// WEATHER=off turns the lookup off.
export function approximateLocation(req: Pick<Request, 'headers'>): { lat: number; lon: number } | null {
  if (process.env.WEATHER === 'off') return null;
  let lat = Number(first(req.headers['x-vercel-ip-latitude']) ?? NaN);
  let lon = Number(first(req.headers['x-vercel-ip-longitude']) ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    [lat, lon] = (process.env.WEATHER_TEST_LOCATION ?? '').split(',').map((s) => (s.trim() ? Number(s) : NaN));
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: round(lat), lon: round(lon) };
}

// Apple's WeatherKit condition codes, in the same few words.
const CONDITIONS: Record<string, string> = {
  Clear: 'clear', MostlyClear: 'clear', Hot: 'clear', Frigid: 'clear',
  PartlyCloudy: 'partly cloudy', MostlyCloudy: 'partly cloudy',
  Cloudy: 'overcast',
  Foggy: 'foggy', Haze: 'foggy', Smoky: 'foggy',
  Drizzle: 'drizzle', FreezingDrizzle: 'drizzle',
  Rain: 'rain', HeavyRain: 'rain', SunShowers: 'rain', FreezingRain: 'rain', Sleet: 'rain', MixedRainAndSleet: 'rain',
  MixedRainAndSnow: 'snow', MixedSnowAndSleet: 'snow', Flurries: 'snow', SunFlurries: 'snow', Snow: 'snow',
  HeavySnow: 'snow', BlowingSnow: 'snow', Blizzard: 'snow', Hail: 'snow',
  Thunderstorms: 'thunderstorms', IsolatedThunderstorms: 'thunderstorms', ScatteredThunderstorms: 'thunderstorms',
  StrongStorms: 'thunderstorms', TropicalStorm: 'thunderstorms', Hurricane: 'thunderstorms',
  Breezy: 'clear', Windy: 'clear', BlowingDust: 'unsettled',
};

export const describeCondition = (code: unknown) => CONDITIONS[String(code)] ?? 'unsettled';

// WeatherKit's current conditions (metric: °C and km/h).
export function weatherFromWeatherKit(body: any): Weather | null {
  const c = body?.currentWeather;
  const temperatureC = Number(c?.temperature);
  const feelsLikeC = Number(c?.temperatureApparent ?? c?.temperature);
  if (!Number.isFinite(temperatureC) || !Number.isFinite(feelsLikeC)) return null;
  return {
    temperatureC: Math.round(temperatureC),
    feelsLikeC: Math.round(feelsLikeC),
    description: describeCondition(c?.conditionCode),
    windy: Number(c?.windSpeed) >= 30 || c?.conditionCode === 'Windy',
    feel: feelOf(feelsLikeC),
    unit: 'C',
  };
}

const weatherKitConfig = () => {
  const { APPLE_TEAM_ID, WEATHERKIT_SERVICE_ID, WEATHERKIT_KEY_ID, WEATHERKIT_PRIVATE_KEY } = process.env;
  return APPLE_TEAM_ID && WEATHERKIT_SERVICE_ID && WEATHERKIT_KEY_ID && WEATHERKIT_PRIVATE_KEY
    ? { teamId: APPLE_TEAM_ID, serviceId: WEATHERKIT_SERVICE_ID, keyId: WEATHERKIT_KEY_ID, privateKey: WEATHERKIT_PRIVATE_KEY }
    : null;
};

export const weatherProvider = (): 'weatherkit' | 'met-norway' => (weatherKitConfig() ? 'weatherkit' : 'met-norway');

// WeatherKit authenticates our server with a JWT signed by the WeatherKit key
// from the Apple Developer portal. One token serves for 50 minutes of its hour.
let token: { value: string; until: number } | null = null;

export async function weatherKitToken(now = Date.now()): Promise<string> {
  if (token && token.until > now) return token.value;
  const cfg = weatherKitConfig();
  if (!cfg) throw new Error('WeatherKit is not configured');
  // Env editors often store the .p8 file's line breaks as literal "\n".
  const key = await importPKCS8(cfg.privateKey.replace(/\\n/g, '\n'), 'ES256');
  const issuedAt = Math.floor(now / 1000);
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId, id: `${cfg.teamId}.${cfg.serviceId}` })
    .setIssuer(cfg.teamId)
    .setSubject(cfg.serviceId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 60 * 60)
    .sign(key);
  token = { value, until: now + 50 * 60 * 1000 };
  return value;
}

// MET Norway's symbol codes ("lightrainshowers_day"), in the same few words.
export function describeSymbol(symbol: unknown): string {
  const code = String(symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (!code) return 'unsettled';
  if (code.includes('thunder')) return 'thunderstorms';
  if (code.includes('snow')) return 'snow';
  if (code.includes('rain') || code.includes('sleet')) return 'rain';
  if (code === 'fog') return 'foggy';
  if (code === 'cloudy') return 'overcast';
  if (code === 'partlycloudy') return 'partly cloudy';
  if (code === 'clearsky' || code === 'fair') return 'clear';
  return 'unsettled';
}

// The apparent ("feels like") temperature from temperature, humidity and wind,
// Steadman's formula as used by the Australian Bureau of Meteorology. MET
// Norway gives no feels-like of its own.
export function apparentTemperature(temperatureC: number, humidityPercent: number, windMs: number): number {
  const vapourPressure = (humidityPercent / 100) * 6.105 * Math.exp((17.27 * temperatureC) / (237.7 + temperatureC));
  return temperatureC + 0.33 * vapourPressure - 0.7 * windMs - 4;
}

// MET Norway's Locationforecast "compact": the first time step is now.
export function weatherFromMetNorway(body: any): Weather | null {
  const step = body?.properties?.timeseries?.[0]?.data;
  const d = step?.instant?.details;
  const temperatureC = Number(d?.air_temperature);
  if (!Number.isFinite(temperatureC)) return null;
  const windMs = Number(d?.wind_speed);
  const humidity = Number(d?.relative_humidity);
  const feelsLikeC = Number.isFinite(windMs) && Number.isFinite(humidity) ? apparentTemperature(temperatureC, humidity, windMs) : temperatureC;
  return {
    temperatureC: Math.round(temperatureC),
    feelsLikeC: Math.round(feelsLikeC),
    description: describeSymbol(step?.next_1_hours?.summary?.symbol_code ?? step?.next_6_hours?.summary?.symbol_code),
    windy: Number.isFinite(windMs) && windMs * 3.6 >= 30,
    feel: feelOf(feelsLikeC),
    unit: 'C',
  };
}

// MET Norway asks every client to identify itself with a contact.
export const MET_NORWAY_USER_AGENT = 'PranaVeda/1.0 (https://pranaveda.app; info@pranaveda.app)';

async function fromWeatherKit(at: { lat: number; lon: number }, fetcher: typeof fetch, now: number): Promise<Weather | null> {
  const res = await fetcher(`https://weatherkit.apple.com/api/v1/weather/en/${at.lat}/${at.lon}?dataSets=currentWeather`, {
    headers: { Authorization: `Bearer ${await weatherKitToken(now)}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`WeatherKit HTTP ${res.status}`);
  return weatherFromWeatherKit(await res.json());
}

async function fromMetNorway(at: { lat: number; lon: number }, fetcher: typeof fetch): Promise<Weather | null> {
  const res = await fetcher(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${at.lat}&lon=${at.lon}`, {
    headers: { 'User-Agent': MET_NORWAY_USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MET Norway HTTP ${res.status}`);
  return weatherFromMetNorway(await res.json());
}

// WeatherKit first when it is configured; MET Norway if it fails or is not.
async function lookUp(at: { lat: number; lon: number }, fetcher: typeof fetch, now: number): Promise<Weather | null> {
  if (weatherProvider() === 'weatherkit') {
    try {
      const weather = await fromWeatherKit(at, fetcher, now);
      if (weather) return weather;
      throw new Error('WeatherKit gave no current weather');
    } catch (err: any) {
      console.error('[weather] WeatherKit failed, trying MET Norway:', err?.message || err);
    }
  }
  return fromMetNorway(at, fetcher);
}

// One lookup per area every half hour, shared by everyone there; a failed
// lookup is not retried for five minutes, so a slow service costs one wait.
const cache = new Map<string, { weather: Weather | null; until: number }>();

export async function currentWeather(
  at: { lat: number; lon: number },
  fetcher: typeof fetch = fetch,
  now = Date.now()
): Promise<Weather | null> {
  const key = `${at.lat},${at.lon}`;
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.weather;
  let weather: Weather | null = null;
  try {
    weather = await lookUp(at, fetcher, now);
  } catch (err: any) {
    console.error('[weather] lookup failed:', err?.message || err);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, { weather, until: now + (weather ? CACHE_MS : FAILED_MS) });
  return weather;
}

export async function weatherFor(req: Pick<Request, 'headers'>): Promise<Weather | null> {
  const at = approximateLocation(req);
  const weather = at ? await currentWeather(at) : null;
  return weather && { ...weather, unit: unitFor(req) };
}

export const clearWeatherCache = () => {
  cache.clear();
  token = null;
};

// The weather a card is checked against: what they said (Amrita's weatherNow:
// hot, cold or mild), else the forecast.
export function weatherFeel(input: any, weather: Weather | null): WeatherFeel | null {
  const said = input?.weatherNow;
  if (said === 'hot' || said === 'cold') return said;
  if (said === 'mild') return null;
  return weather?.feel ?? null;
}
