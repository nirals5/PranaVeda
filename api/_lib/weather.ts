import type { Request } from 'express';

// G14, weather. The weather where someone is now, so that practices the
// Practice Library marks avoid_weather (Cooling and Hissing Breath in the
// cold, Sun-Piercing Breath in the heat) are not offered.
//
// Free services only for now: where they are comes from the approximate
// location Vercel adds to every request (from the network address, city
// level, no permission prompt), and the weather from Open-Meteo, which needs
// no key and is free for non-commercial use. Coordinates are rounded to a
// tenth of a degree (about 10 km) before they leave the server, and are never
// stored. What the person says about their weather wins over the forecast.

export type WeatherFeel = 'hot' | 'cold';

export interface Weather {
  temperatureC: number;
  feelsLikeC: number;
  description: string;
  windy: boolean;
  feel: WeatherFeel | null;
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

// WMO weather codes, as Open-Meteo reports them, in a few words.
export function describeCode(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorms';
  return 'unsettled';
}

export function weatherFromForecast(body: any): Weather | null {
  const c = body?.current;
  const temperatureC = Number(c?.temperature_2m);
  const feelsLikeC = Number(c?.apparent_temperature ?? c?.temperature_2m);
  if (!Number.isFinite(temperatureC) || !Number.isFinite(feelsLikeC)) return null;
  return {
    temperatureC: Math.round(temperatureC),
    feelsLikeC: Math.round(feelsLikeC),
    description: describeCode(Number(c?.weather_code)),
    windy: Number(c?.wind_speed_10m) >= 30,
    feel: feelOf(feelsLikeC),
  };
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
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${at.lat}&longitude=${at.lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m';
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    weather = weatherFromForecast(await res.json());
  } catch (err: any) {
    console.error('[weather] lookup failed:', err?.message || err);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, { weather, until: now + (weather ? CACHE_MS : FAILED_MS) });
  return weather;
}

export async function weatherFor(req: Pick<Request, 'headers'>): Promise<Weather | null> {
  const at = approximateLocation(req);
  return at ? currentWeather(at) : null;
}

export const clearWeatherCache = () => cache.clear();

// The weather a card is checked against: what they said (Amrita's weatherNow:
// hot, cold or mild), else the forecast.
export function weatherFeel(input: any, weather: Weather | null): WeatherFeel | null {
  const said = input?.weatherNow;
  if (said === 'hot' || said === 'cold') return said;
  if (said === 'mild') return null;
  return weather?.feel ?? null;
}
