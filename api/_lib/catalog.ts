import { asc, isNull } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import type { CatalogBreathwork, CatalogPose } from '../index.js';

// The practice catalog, read from the practices tables (imported from the
// Practice Library sheet), in the same shape and with the same ids as the
// built-in catalog in api/index.ts. That built-in catalog is the fallback: with
// no database, or when the database fails, the app serves it unchanged.

// A health condition practices can be avoided or adapted for: its code (what
// contraindications and cautions list), and the label and everyday words it is
// recognised by in a user's profile.
export interface CatalogCondition {
  code: string;
  label: string;
  userWords: string[];
}

// A principle from the Practice Library's Principles tab (PR1…), which Amrita
// may cite on a card (G12). Only the database has them: with the built-in
// catalog there is nothing to cite, so no citation is shown.
export interface CatalogPrinciple {
  id: string;
  statement: string;
}

export interface Catalog {
  poses: CatalogPose[];
  breathwork: CatalogBreathwork[];
  conditions: CatalogCondition[];
  principles: CatalogPrinciple[];
  poseById: Map<string, CatalogPose>;
  breathworkById: Map<string, CatalogBreathwork>;
  principleById: Map<string, CatalogPrinciple>;
  source: 'database' | 'built-in';
}

type PracticeRow = typeof schema.practices.$inferSelect;
type ConditionRow = Pick<typeof schema.practiceConditions.$inferSelect, 'practiceId' | 'conditionCode' | 'level'>;
export type BuiltIn = { poses: CatalogPose[]; breathwork: CatalogBreathwork[]; conditions: CatalogCondition[] };

// Rows are read at most this often per server instance. After a failed read
// the built-in catalog is served, and the database is tried again sooner.
const TTL_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;

const TIME_LABELS: Record<string, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  after_meals: 'After meals',
  any: 'Any time',
};
const DOSHA_WORDS: Record<string, string> = {
  balances: 'Balancing',
  neutral: 'Neutral',
  aggravates: 'Can aggravate — use with care',
};

export function catalogOf(
  poses: CatalogPose[],
  breathwork: CatalogBreathwork[],
  conditions: CatalogCondition[],
  source: Catalog['source'],
  principles: CatalogPrinciple[] = []
): Catalog {
  return {
    poses,
    breathwork,
    conditions,
    principles,
    poseById: new Map(poses.map((p) => [p.id, p])),
    breathworkById: new Map(breathwork.map((b) => [b.id, b])),
    principleById: new Map(principles.map((p) => [p.id, p])),
    source,
  };
}

// "Bad Knee!" → " bad knee " (spaces at both ends, so a phrase matches only as
// whole words: "knee" is found in "bad knee", "knee" is not found in "kneel").
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

// The condition codes a user's profile conditions refer to, by code, label or
// any of the condition's everyday words: "bad knee" → knee_injury, "high BP" →
// hypertension, "vertigo" → balance_issues.
export function profileConditionCodes(profileConditions: string[] | undefined, conditions: CatalogCondition[]): Set<string> {
  const codes = new Set<string>();
  for (const said of profileConditions ?? []) {
    const text = words(said);
    for (const c of conditions) {
      const terms = [c.code, c.label, ...c.userWords].map(words).filter((t) => t.trim());
      if (terms.some((t) => text.includes(t))) codes.add(c.code);
    }
  }
  return codes;
}

// The contraindications a user's conditions rule out. Matching by code, label
// and everyday words only ever adds to the older text match it keeps, so it is
// never stricter than before.
export function conditionConflicts(
  contraindications: string[],
  profileConditions: string[] | undefined,
  conditions: CatalogCondition[]
): string[] {
  if (!profileConditions?.length) return [];
  const codes = profileConditionCodes(profileConditions, conditions);
  const older = profileConditions.map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  return contraindications.filter((tag) => codes.has(tag) || older.some((c) => c.includes(tag) || tag.includes(c)));
}

// ["evening", "any"] + "On an empty stomach." → "Evening (also any time). On an empty stomach."
export function describeTimes(times: string[], note: string | null): string {
  const [first, ...rest] = times.map((t) => TIME_LABELS[t] ?? t);
  const when = first ? `${first}${rest.length ? ` (also ${rest.join(', ').toLowerCase()})` : ''}` : 'Any time';
  return note ? `${when}. ${note}` : when;
}

// The rows the app may serve: linked to the app's catalog by app_id, current,
// not merged away, and with what a client needs to show them. G3: only
// practices shown "right now" are offered — never explore_only ones (a
// handstand, say) or hidden ones. G4: a practice missing any tag the engine
// needs (the Practice Library's required tags, needs served included) is
// skipped. `needsServed` holds the practices that serve at least one need.
function servable(p: PracticeRow, needsServed?: ReadonlySet<string>): boolean {
  if (!p.appId || p.retiredAt || p.mergedInto || p.whereShown !== 'right_now') return false;
  if (!fullyTagged(p) || (needsServed && !needsServed.has(p.id))) return false;
  if (p.type === 'asana') return p.cues.length > 0 && !!p.plainBenefit;
  return p.inhaleSec !== null && p.exhaleSec !== null && p.cycles !== null;
}

// The weathers (hot, cold) a practice is not offered in (G14); "any" names none.
const weathers = (list: string[] | null) => (list ?? []).filter((w): w is 'hot' | 'cold' => w === 'hot' || w === 'cold');

const fullyTagged = (p: PracticeRow) =>
  !!(p.minExperience && p.intensity && p.vata && p.pitta && p.kapha) &&
  p.settings.length > 0 &&
  p.effects.length > 0 &&
  p.bestTimes.length > 0;

export function catalogFromRows(
  rows: PracticeRow[],
  conditions: ConditionRow[],
  builtIn: BuiltIn,
  conditionList: CatalogCondition[] = builtIn.conditions,
  principles: CatalogPrinciple[] = [],
  needsServed?: ReadonlySet<string>
): Catalog {
  const avoid = new Map<string, string[]>();
  const caution = new Map<string, string[]>();
  for (const c of conditions) {
    const into = c.level === 'avoid' ? avoid : caution;
    into.set(c.practiceId, [...(into.get(c.practiceId) ?? []), c.conditionCode]);
  }
  const appIdOf = new Map(rows.filter((r) => r.appId).map((r) => [r.id, r.appId!]));
  const builtInPose = new Map(builtIn.poses.map((p) => [p.id, p]));
  // Keep the built-in order the clients show today; new practices follow, by id.
  const order = new Map([...builtIn.poses, ...builtIn.breathwork].map((x, i) => [x.id, i]));
  const rank = (r: PracticeRow) => order.get(r.appId!) ?? Number.MAX_SAFE_INTEGER;
  const sorted = rows.filter((r) => servable(r, needsServed)).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  // A practice linked to the app but not served is most likely a sheet edit to
  // look at (made explore_only, or a required tag cleared), so say which.
  const skipped = rows.filter((r) => r.appId && !r.retiredAt && !r.mergedInto && !servable(r, needsServed)).map((r) => `${r.id} (${r.appId})`);
  if (skipped.length) console.warn(`[catalog] not served (G3/G4: not right_now, untagged or incomplete): ${skipped.join(', ')}`);

  const safety = (r: PracticeRow) => {
    const cautions = caution.get(r.id) ?? [];
    return {
      contraindications: avoid.get(r.id) ?? [],
      ...(cautions.length ? { cautions } : {}),
      ...(r.avoidNotes ? { safetyNote: r.avoidNotes } : {}),
      ...(r.minExperience === 'experienced' ? { minExperience: 'experienced' as const } : {}),
      ...(r.avoidAfterMeal ? { avoidAfterMeal: true as const } : {}),
      ...(weathers(r.avoidWeather).length ? { avoidWeather: weathers(r.avoidWeather) } : {}),
    };
  };

  const poses: CatalogPose[] = sorted
    .filter((r) => r.type === 'asana')
    .map((r) => {
      const fallback = builtInPose.get(r.appId!);
      const counter = r.counterPoseId ? appIdOf.get(r.counterPoseId) : undefined;
      return {
        id: r.appId!,
        nameSanskrit: r.nameSanskrit,
        nameEnglish: r.nameEnglish,
        level: r.sourceLevel ?? fallback?.level ?? 'Beginner',
        bodyFocus: r.sourceBodyArea ?? fallback?.bodyFocus ?? '',
        cues: r.cues,
        commonMistakes: r.commonMistakes,
        benefits: r.plainBenefit ?? '',
        modifications: r.modifications ?? '',
        ...safety(r),
        dosha: {
          vata: r.doshaVata ?? DOSHA_WORDS[r.vata ?? ''] ?? 'Neutral',
          pitta: r.doshaPitta ?? DOSHA_WORDS[r.pitta ?? ''] ?? 'Neutral',
          kapha: r.doshaKapha ?? DOSHA_WORDS[r.kapha ?? ''] ?? 'Neutral',
        },
        bestTime: describeTimes(r.bestTimes, r.timingNote),
        ...(counter ? { counterPoseId: counter } : {}),
        defaultDurationMin: r.durationMin ?? fallback?.defaultDurationMin ?? 2,
        // The sheet names a photo in public/poses/; without one, keep today's picture.
        poseImageUrl: r.image ? `/poses/${r.image}` : (fallback?.poseImageUrl ?? ''),
        ...(fallback?.videoUrl ? { videoUrl: fallback.videoUrl } : {}),
      };
    });

  const breathwork: CatalogBreathwork[] = sorted
    .filter((r) => r.type === 'pranayama')
    .map((r) => ({
      id: r.appId!,
      name: r.nameEnglish,
      sanskritName: r.nameSanskrit,
      description: r.breathDescription ?? r.plainBenefit ?? '',
      inhale: r.inhaleSec!,
      holdActive: r.holdInSec ?? 0,
      exhale: r.exhaleSec!,
      holdEmpty: r.holdOutSec ?? 0,
      cycles: r.cycles!,
      benefits: r.plainBenefit ?? '',
      doshaSuitability: r.ayurvedicNote ?? 'Neutral',
      ...safety(r),
      bestTime: describeTimes(r.bestTimes, r.timingNote),
    }));

  return catalogOf(poses, breathwork, conditionList, 'database', principles);
}

async function readCatalog(builtIn: BuiltIn): Promise<Catalog> {
  const db = getDb();
  const [rows, conditions, conditionList, principleRows, needRows] = await Promise.all([
    db.select().from(schema.practices).where(isNull(schema.practices.retiredAt)),
    db
      .select({
        practiceId: schema.practiceConditions.practiceId,
        conditionCode: schema.practiceConditions.conditionCode,
        level: schema.practiceConditions.level,
      })
      .from(schema.practiceConditions)
      .orderBy(asc(schema.practiceConditions.conditionCode)),
    db
      .select({ code: schema.conditions.code, label: schema.conditions.label, userWords: schema.conditions.userWords })
      .from(schema.conditions)
      .orderBy(asc(schema.conditions.code)),
    db.select({ id: schema.practicePrinciples.id, statement: schema.practicePrinciples.statement }).from(schema.practicePrinciples),
    db.selectDistinct({ practiceId: schema.practiceNeeds.practiceId }).from(schema.practiceNeeds),
  ]);
  // PR1, PR2 … PR10, in number order.
  const principles = principleRows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const needsServed = new Set(needRows.map((n) => n.practiceId));
  const catalog = catalogFromRows(rows, conditions, builtIn, conditionList, principles, needsServed);
  // An empty result means the tables are not loaded yet, not that the app has no practices.
  if (!catalog.poses.length || !catalog.breathwork.length) throw new Error('the practices tables are empty');
  return catalog;
}

let cached: { catalog: Catalog; until: number } | undefined;
let inflight: Promise<Catalog> | undefined;

// The catalog to serve now: from the database, cached per instance, or the
// built-in one when there is no database or it cannot be read.
export async function getCatalog(builtIn: BuiltIn, now = Date.now()): Promise<Catalog> {
  if (cached && now < cached.until) return cached.catalog;
  if (!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)) {
    return catalogOf(builtIn.poses, builtIn.breathwork, builtIn.conditions, 'built-in');
  }
  inflight ??= readCatalog(builtIn)
    .then((catalog) => {
      cached = { catalog, until: now + TTL_MS };
      return catalog;
    })
    .catch((err) => {
      console.error('[catalog] serving the built-in catalog; the database read failed:', err?.message || err);
      const catalog = catalogOf(builtIn.poses, builtIn.breathwork, builtIn.conditions, 'built-in');
      cached = { catalog, until: now + RETRY_MS };
      return catalog;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

// For tests: forget the cached catalog.
export function resetCatalogCache() {
  cached = undefined;
  inflight = undefined;
}
