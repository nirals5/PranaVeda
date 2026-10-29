import type { Weather } from './weather.js';

// Hints H1–H12 from the Practice Library's Rules tab: gentle leanings
// for the time of day, the season, the weather, last night's sleep, the
// person's dosha and how past practices left them (H11, api/_lib/feedback.ts).
// Unlike the guardrails (G…), a hint never refuses a card; it only tells Amrita which way to lean between
// practices that are already safe and suitable. The windows below are the
// Rules tab's "when"; what to lean toward is its "then", read with the catalog
// (the wording here is the fallback for the built-in catalog).

export type HintId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11' | 'H12';
export type Season = 'autumn_winter' | 'spring' | 'summer';
export type Sleep = { lastNightMinutes: number; usualMinutes: number };
export type Dosha = 'Vata' | 'Pitta' | 'Kapha';

// The hints that apply now, with what H10, H11 and H12 need to be worded.
export interface RightNow {
  hints: HintId[];
  sleep?: Sleep; // a short night, from their wearable (H10)
  feedback?: { less: string[]; more: string[] }; // practice names, from their ratings (H11)
  dosha?: { dosha: Dosha; from: 'imbalance' | 'constitution' }; // H12
}

const WHEN: Record<HintId, string> = {
  H1: 'Early morning (Kapha time)',
  H2: 'Midday (Pitta time)',
  H3: 'Late afternoon (Vata time), if they are scattered or anxious',
  H4: 'Evening',
  H5: 'Autumn and early winter',
  H6: 'Late winter and spring',
  H7: 'Summer',
  H8: 'Cold or windy weather',
  H9: 'Hot weather',
  H10: 'If they say they slept badly or too little',
  H11: "A practice that left them 'less settled' twice",
  H12: 'Their dosha',
};

const BUILT_IN_THEN: Record<HintId, string> = {
  H1: 'Lean toward N3 Energize unless the check-in says scattered or anxious',
  H2: 'If irritable or hot → N2 Cool. Suggest the main meal at midday',
  H3: 'Lean toward N1 Ground',
  H4: 'Lighter practices; lean toward N6 Wind down',
  H5: 'Bias toward grounding and warming',
  H6: 'Bias toward energizing',
  H7: 'Bias toward cooling',
  H8: 'Bias toward grounding and warming',
  H9: 'Bias toward cooling; avoid heating breaths',
  H10: "Avoid strong practices; favour N4 Restore or N1 Ground",
  H11: 'Lower its weight for that user',
  H12: "When choosing between equally good options, prefer ones that balance the user's dominant dosha",
};

// A short night: under 6 hours, or an hour or more below their usual.
export const SHORT_SLEEP_MINUTES = 6 * 60;
export const SHORT_OF_USUAL_MINUTES = 60;
export const shortSleep = (s: Sleep) => s.lastNightMinutes < SHORT_SLEEP_MINUTES || s.usualMinutes - s.lastNightMinutes >= SHORT_OF_USUAL_MINUTES;

// The dosha H12 leans with: their current imbalance (vikriti) when Amrita has
// recorded one, else their constitution (prakriti) unless she recorded it with
// low confidence. "Vata-Pitta" → Vata; none for "tridoshic" or an unclear one.
export function leadingDosha(profile: { vikriti?: string; prakriti?: string; prakritiConfidence?: string } | undefined): RightNow['dosha'] {
  const first = (text?: string) => {
    const m = text?.match(/vata|pitta|kapha/i)?.[0].toLowerCase();
    return m ? ((m[0].toUpperCase() + m.slice(1)) as Dosha) : undefined;
  };
  const imbalance = first(profile?.vikriti);
  if (imbalance) return { dosha: imbalance, from: 'imbalance' };
  const constitution = profile?.prakritiConfidence === 'low' ? undefined : first(profile?.prakriti);
  return constitution ? { dosha: constitution, from: 'constitution' } : undefined;
}

// The hour (0–23) in the time a client sends: the website's toLocaleString
// ("10/27/2026, 1:20:00 PM", or "27/10/2026, 13:20:00" elsewhere), iOS's
// formatted date (with a narrow space before PM) and Android's "M/d/yyyy,
// h:mm:ss a". Null when there is no time to read.
export function localHour(localTime: unknown): number | null {
  if (typeof localTime !== 'string') return null;
  const m = localTime.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s*m\b\.?)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const half = m[3]?.toLowerCase();
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'p' ? 12 : 0);
  }
  return hour <= 23 ? hour : null;
}

// Within about 23° of the equator there is no autumn or winter to speak of
// (and Ayurveda's own calendar there differs), so no season hint is given.
export const TROPICS_DEGREES = 23.5;

// The season on a day (YYYY-MM-DD, their own date). Northern: autumn and early
// winter Sep 23 – Jan 15, late winter and spring Jan 16 – Jun 20, summer
// Jun 21 – Sep 22. South of the tropics, six months on. Where they are is
// unknown: northern.
export function seasonOf(day: string, latitude: number | null): Season | null {
  if (latitude !== null && Math.abs(latitude) < TROPICS_DEGREES) return null;
  const [, m, d] = day.split('-').map(Number);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  const month = latitude !== null && latitude < 0 ? ((m + 5) % 12) + 1 : m;
  const monthDay = month * 100 + d;
  if (monthDay >= 923 || monthDay <= 115) return 'autumn_winter';
  if (monthDay <= 620) return 'spring';
  return 'summer';
}

export function hintsNow(now: {
  hour: number | null;
  season: Season | null;
  weather: Weather | null;
  sleep?: Sleep;
  profile?: Parameters<typeof leadingDosha>[0];
  feedback?: RightNow['feedback'];
}): RightNow {
  const hints: HintId[] = [];
  const { hour, season, weather } = now;
  if (hour !== null) {
    if (hour >= 6 && hour < 10) hints.push('H1');
    else if (hour >= 10 && hour < 14) hints.push('H2');
    else if (hour >= 14 && hour < 18) hints.push('H3');
    else if (hour >= 20 || hour < 4) hints.push('H4');
  }
  if (season === 'autumn_winter') hints.push('H5');
  if (season === 'spring') hints.push('H6');
  if (season === 'summer') hints.push('H7');
  if (weather?.feel === 'cold' || weather?.windy) hints.push('H8');
  if (weather?.feel === 'hot') hints.push('H9');
  // H10 always applies: from a short night on their wearable, else from what they say.
  hints.push('H10');
  const sleep = now.sleep && shortSleep(now.sleep) ? now.sleep : undefined;
  const feedback = now.feedback?.less.length || now.feedback?.more.length ? now.feedback : undefined;
  if (feedback) hints.push('H11');
  const dosha = leadingDosha(now.profile);
  if (dosha) hints.push('H12');
  return { hints, ...(sleep ? { sleep } : {}), ...(feedback ? { feedback } : {}), ...(dosha ? { dosha } : {}) };
}

const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

function when(id: HintId, now: RightNow): string {
  if (id === 'H10' && now.sleep) return `Short sleep last night (${hm(now.sleep.lastNightMinutes)}; their usual ${hm(now.sleep.usualMinutes)})`;
  if (id === 'H11' && now.feedback) {
    const { less, more } = now.feedback;
    return less.length
      ? `These left them less settled more than once lately: ${less.join(', ')}`
      : `These left them more settled more than once lately: ${more.join(', ')}`;
  }
  if (id === 'H12' && now.dosha) return `Their ${now.dosha.from === 'imbalance' ? 'current imbalance' : 'constitution'} is mainly ${now.dosha.dosha}`;
  return WHEN[id];
}

function then(id: HintId, now: RightNow, texts: ReadonlyMap<string, string>): string {
  const text = (texts.get(id) ?? BUILT_IN_THEN[id]).trim().replace(/\.?$/, '');
  if (id === 'H11' && now.feedback) {
    const { less, more } = now.feedback;
    const lean = 'when one suits the moment, lean toward it.';
    if (!less.length) return `${lean[0].toUpperCase()}${lean.slice(1)}`;
    const lower = `${text}: choose others that serve the same need, unless they ask for one by name.`;
    return more.length ? `${lower} These left them more settled more than once: ${more.join(', ')}; ${lean}` : lower;
  }
  return id === 'H12' && now.dosha
    ? `${text}: here, practices that balance ${now.dosha.dosha}, not ones that can aggravate it.`
    : `${text}.`;
}

// The "Right now" section of Amrita's prompt, or nothing when no hint applies.
export function rightNowPrompt(now: RightNow, texts: ReadonlyMap<string, string>): string {
  if (!now.hints.length) return '';
  const lines = now.hints.map((id) => `- ${when(id, now)}: ${then(id, now, texts)}`);
  return `\n# Right now\n\nGentle leanings for this moment. Needs (N1 Ground, N2 Cool…) are the ones listed as "Serves" in the catalog, and "the check-in" means what they have told you about how they feel.\n${lines.join('\n')}\nThese only tip the balance between practices that already suit them. What they tell you comes first, and every safety rule above always does. Don't mention the leanings themselves; let them shape your choice, and say why in their terms if it helps.\n`;
}
