import { asc } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { BUILT_IN_FOOD_ROWS } from './foodRules.builtIn.js';

// The sattvik rule (G9 in the Practice Library's Rules tab): any food, recipe
// or lifestyle suggestion must pass the Food Library's Exclusions tab,
// synonyms included. The rows come from the database (imported from the
// sheet); with no database, or when it fails, the copy in foodRules.builtIn.ts
// is used, so the rule never switches off.

type ExclusionRow = Pick<typeof schema.exclusions.$inferSelect, 'id' | 'item' | 'status' | 'notes' | 'notWhen'>;
type TermRow = Pick<typeof schema.exclusionTerms.$inferSelect, 'exclusionId' | 'term'>;
type SwapRow = Pick<typeof schema.foodSubstitutions.$inferSelect, 'replaces' | 'swap'>;
export interface FoodRows {
  exclusions: ExclusionRow[];
  terms: TermRow[];
  substitutions: SwapRow[];
}

// Something never suggested: an excluded food or an unsafe plant.
export interface FoodExclusion {
  id: string;
  item: string;
  unsafe: boolean;
  terms: string[];
  notWhen: string[]; // phrases where a term means something else ("lift your spirits")
}

export interface FoodRules {
  exclusions: FoodExclusion[];
  combinations: { item: string; rule: string }[]; // in the prompt only: too fuzzy to block on
  allowed: { item: string; terms: string[]; note: string | null }[];
  swaps: { replaces: string; swap: string }[];
  source: 'database' | 'built-in';
}

export interface ExclusionHit {
  id: string;
  item: string;
  term: string;
}

const TTL_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;

// "kanda (onion)" → kanda and onion; "musk (kasturi)" → musk and kasturi.
function expandTerm(term: string): string[] {
  const m = term.match(/^(.*?)\s*\((.*?)\)\s*$/);
  return (m ? [m[1], m[2]] : [term]).map((t) => t.trim()).filter(Boolean);
}

export function foodRulesFrom(rows: FoodRows, source: FoodRules['source']): FoodRules {
  const termsOf = (id: string) => [...new Set(rows.terms.filter((t) => t.exclusionId === id).flatMap((t) => expandTerm(t.term)))];
  const rules: FoodRules = { exclusions: [], combinations: [], allowed: [], swaps: rows.substitutions.map(({ replaces, swap }) => ({ replaces, swap })), source };
  for (const e of [...rows.exclusions].sort((a, b) => a.id.localeCompare(b.id))) {
    if (e.status === 'excluded' || e.status === 'unsafe') {
      rules.exclusions.push({ id: e.id, item: e.item, unsafe: e.status === 'unsafe', terms: termsOf(e.id), notWhen: e.notWhen ?? [] });
    } else if (e.status === 'combination_rule') {
      if (e.notes) rules.combinations.push({ item: e.item, rule: e.notes });
    } else {
      rules.allowed.push({ item: e.item, terms: termsOf(e.id), note: e.notes });
    }
  }
  return rules;
}

export const BUILT_IN_FOOD_RULES = foodRulesFrom(BUILT_IN_FOOD_ROWS, 'built-in');

// ---------------------------------------------------------------------------
// Matching

// Lower case, accents and apostrophes gone ("Madhū" → "madhu", "don't" →
// "dont"), commas kept as their own token, everything else a space; padded
// with spaces so a phrase matches only as whole words.
function normalize(s: string): string {
  const text = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/,/g, ' , ')
    .replace(/[^a-z0-9,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ` ${text} `;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Words that make a mention advice against the item: "skip garlic", "instead
// of honey", "garlic is best avoided", "onion-free".
const CUES = new Set(
  (
    'avoid avoids avoiding avoided skip skips skipping skipped without instead rather than not no never nor neither ' +
    'dont doesnt isnt arent wasnt werent shouldnt cant cannot wont exclude excludes excluding excluded omit omits omitting omitted ' +
    'refrain abstain eliminate eliminating free minus except'
  ).split(' ')
);
// Words that rule out only what they take: "swap honey for maple syrup", "replace
// the onion with ginger". What comes after "for" or "with" is the swap itself,
// and "a good swap would be beetroot" suggests beetroot.
const SWAPS = new Set('replace replaces replacing replaced swap swaps swapping swapped substitute substitutes substituting'.split(' '));
const SWAP_ENDS = new Set('for with by be is are in into to'.split(' '));
const SWAP_REACH = 3;
const CUE_PAIRS: [string, string][] = [
  ['leave', 'out'],
  ['leaving', 'out'],
  ['cut', 'out'],
  ['cutting', 'out'],
  ['steer', 'clear'],
  ['stay', 'away'],
];
// Words that make a mention a suggestion again: "skip coffee and have honey water".
const POSITIVE = new Set(
  (
    'add adds adding use uses using try trying have having eat eating drink drinking sip sipping enjoy enjoying include including ' +
    'take taking make making cook cooking stir mix blend top sprinkle pour prepare favor favour choose prefer pick forget miss'
  ).split(' ')
);
const PREFERS = new Set(['prefer', 'favor', 'favour', 'choose', 'pick']);
// What may follow a comma inside one thought: more items of a list.
const CLAUSE_JOINERS = new Set(['and', 'but', 'then', 'so', 'or', 'yet']);

function isCue(tokens: string[], i: number, earlier: string[]): boolean {
  const t = tokens[i];
  if (CUES.has(t)) return true;
  if (CUE_PAIRS.some(([a, b]) => t === b && tokens[i - 1] === a)) return true;
  // "prefer ghee over butter"
  return t === 'over' && earlier.some((w) => PREFERS.has(w));
}

// Whether the mention at `start..end` of a normalized clause advises against the item.
function advisesAgainst(clause: string, start: number, end: number): boolean {
  const before = clause.slice(0, start).trim().split(' ').filter((t) => t && t !== ',');
  const after = clause.slice(end).trim().split(' ').filter(Boolean);
  let lastCue = -1;
  let lastPositive = -1;
  before.forEach((t, i) => {
    if (isCue(before, i, before.slice(0, i))) lastCue = i;
    if (POSITIVE.has(t)) lastPositive = i;
    // "swap (out) the honey": only the next few words, and never past "for"/"with".
    if (SWAPS.has(t)) {
      const between = before.slice(i + 1);
      if (between.length <= SWAP_REACH && !between.some((w) => SWAP_ENDS.has(w))) lastCue = i;
      else lastPositive = Math.max(lastPositive, i);
    }
  });
  if (lastCue > lastPositive) return true;
  if (lastPositive >= 0) return false;
  // "Garlic, onion and mushrooms are best avoided" — until the thought ends.
  for (let i = 0; i < after.length; i++) {
    const t = after[i];
    if (t === ',' && CLAUSE_JOINERS.has(after[i + 1])) return false;
    if (POSITIVE.has(t)) return false;
    if (isCue(after, i, [...before, ...after.slice(0, i)])) return true;
    // "honey can be swapped for maple syrup"
    if (SWAPS.has(t)) return true;
  }
  return false;
}

// Clauses: sentences, split again at ";", ":" and "but"-like turns.
const CLAUSE_BREAK = /[.!?;:\n]+|\s[—–]\s|\s-\s|\b(?:but|however|though|although|whereas|while)\b/i;

// The exclusions a text suggests. `ignore` holds phrases that are never food,
// such as the catalog's practice names ("Fish Pose").
export function exclusionHits(text: string, rules: FoodRules, ignore: string[] = []): ExclusionHit[] {
  const hits: ExclusionHit[] = [];
  const ignored = ignore.map(normalize);
  for (const raw of text.split(CLAUSE_BREAK)) {
    if (!raw?.trim()) continue;
    const base = normalize(raw);
    for (const e of rules.exclusions) {
      if (hits.some((h) => h.id === e.id)) continue;
      let clause = base;
      for (const phrase of [...ignored, ...e.notWhen.map(normalize)]) {
        if (phrase.trim()) clause = clause.split(phrase).join(' '.repeat(phrase.length));
      }
      for (const term of e.terms) {
        const t = normalize(term).trim();
        if (!t) continue;
        const re = new RegExp(` ${escape(t)}(?:es|s)?(?= )`, 'g');
        let found: RegExpExecArray | null;
        let hit = false;
        while ((found = re.exec(clause))) {
          if (!advisesAgainst(clause, found.index, found.index + found[0].length)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          hits.push({ id: e.id, item: e.item, term });
          break;
        }
      }
    }
  }
  return hits;
}

// Every string inside a value (a card, a structured answer), checked as text.
export function foodHitsIn(value: unknown, rules: FoodRules, ignore: string[] = []): ExclusionHit[] {
  const texts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  const hits: ExclusionHit[] = [];
  for (const text of texts) {
    for (const h of exclusionHits(text, rules, ignore)) if (!hits.some((x) => x.id === h.id)) hits.push(h);
  }
  return hits;
}

const named = (hits: ExclusionHit[]) => hits.map((h) => `${h.item} ("${h.term}")`).join(', ');

// What Amrita is told when a card or an answer fails the check.
export function foodRejection(hits: ExclusionHit[]): string | undefined {
  if (!hits.length) return undefined;
  return `Rejected — PranaVeda's food guidance is sattvik and excludes ${named(hits)}. Rewrite it without suggesting ${hits.length === 1 ? 'that' : 'those'}; you may name an excluded item only to advise against it or to offer a swap.`;
}

// What Amrita is told when a reply was stopped before a failing sentence.
export function foodRewriteNote(hits: ExclusionHit[], alreadySaid: boolean): string {
  const why = `PranaVeda's food guidance is sattvik and excludes ${named(hits)}. Check every food you name against the whole Excluded list in your instructions: a swap must not be another excluded item.`;
  return alreadySaid
    ? `(Your reply above was stopped before a sentence that suggested something excluded. ${why} They have already read your words above. Continue from exactly where you stopped, suggesting nothing excluded. Do not repeat yourself, apologise, or mention this note.)`
    : `(Your reply was stopped before it was shown, because it suggested something excluded. ${why} Reply again, suggesting nothing excluded. Do not apologise or mention this note.)`;
}

// Said in place of a reply that failed the check twice.
export const FOOD_LEFT_OUT = "I've left out a food suggestion that isn't part of PranaVeda's sattvik guidance.";

// ---------------------------------------------------------------------------
// A second opinion. The word check cannot tell "potatoes and onions sit
// outside sattvik guidance" from "try potatoes and onions"; for chat, a
// sentence it flags is put to a small model, which decides whether the
// sentence suggests the food. Any failure keeps the sentence blocked.

// Whether `sentence` (after `context`, what was already said) suggests any of `hits`.
export type FoodJudge = (sentence: string, context: string, hits: ExclusionHit[]) => Promise<boolean>;

export const JUDGE_SYSTEM = `You check one sentence written by a wellness app's assistant. The app's food guidance is sattvik and leaves out certain foods.
Answer YES if the sentence suggests, recommends, offers or encourages eating, drinking or using one of the listed foods: as a dish, an ingredient, a snack, a remedy, a drink or an option to choose.
Answer NO if it only mentions them: acknowledging what the person said, likes or craves; describing or praising them; explaining that they are left out or why; warning against them; or naming them as the thing to replace. Praise is not a suggestion unless the sentence also tells them to have it.
Reply with exactly one word: YES or NO.`;

export function judgePrompt(sentence: string, context: string, hits: ExclusionHit[]): string {
  const foods = hits.map((h) => `${h.item} (written as "${h.term}")`).join('; ');
  const before = context.trim() ? `What the assistant said just before (for context only):\n${context.trim().slice(-600)}\n\n` : '';
  return `Left-out foods found in the sentence: ${foods}.\n\n${before}Sentence to check:\n${sentence.trim()}`;
}

// The exclusions a chat sentence suggests: the word check, confirmed by the judge.
export async function confirmedHits(
  sentence: string,
  context: string,
  rules: FoodRules,
  ignore: string[],
  judge?: FoodJudge
): Promise<ExclusionHit[]> {
  const hits = exclusionHits(sentence, rules, ignore);
  if (!hits.length || !judge) return hits;
  try {
    return (await judge(sentence, context, hits)) ? hits : [];
  } catch (err: any) {
    console.error('[food] the second opinion failed; keeping the sentence blocked:', err?.message || err);
    return hits;
  }
}

// ---------------------------------------------------------------------------
// Streaming: a reply is released one sentence at a time, each checked before
// it is sent. A failing sentence is never sent; the gate stops there.

const SENTENCE_END = /[.!?…]+["'”’)\]]*\s+|\n+/g;

export class SentenceGate {
  private pending = '';
  private work: Promise<void> = Promise.resolve();
  released = '';
  blocked: ExclusionHit[] | null = null;
  blockedText = '';

  // `check` gets each sentence and what was released before it; `release`
  // sends a sentence that passed; `onBlock` runs once, when one fails.
  constructor(
    private check: (sentence: string, before: string) => ExclusionHit[] | Promise<ExclusionHit[]>,
    private release: (text: string) => void,
    private onBlock: () => void = () => {}
  ) {}

  push(text: string) {
    if (this.blocked) return;
    this.pending += text;
    this.work = this.work.then(() => this.drain(false));
  }

  // At the end of a model call: checks the rest, and resolves once every
  // sentence is sent or the gate has stopped.
  finish(): Promise<void> {
    this.work = this.work.then(() => this.drain(true));
    return this.work;
  }

  private async drain(all: boolean) {
    while (!this.blocked) {
      SENTENCE_END.lastIndex = 0;
      const m = SENTENCE_END.exec(this.pending);
      const end = m ? m.index + m[0].length : all && this.pending ? this.pending.length : 0;
      if (!end) return;
      const sentence = this.pending.slice(0, end);
      this.pending = this.pending.slice(end);
      const hits = await this.check(sentence, this.released);
      if (hits.length) {
        this.blocked = hits;
        this.blockedText = sentence;
        this.pending = '';
        this.onBlock();
        return;
      }
      this.released += sentence;
      this.release(sentence);
    }
  }
}

// ---------------------------------------------------------------------------
// The prompt: prevention. The checks above are the guard.

export function foodRulesPrompt(rules: FoodRules): string {
  const line = (e: FoodExclusion) => `- ${e.item}: ${e.terms.join(', ')}`;
  const excluded = rules.exclusions.filter((e) => !e.unsafe);
  const unsafe = rules.exclusions.filter((e) => e.unsafe);
  const parts = [
    `# Food — sattvik rules (a hard rule)

PranaVeda's food guidance is sattvik. In any food, drink, recipe, herb, remedy or lifestyle suggestion, never suggest anything below, in any language or spelling. You may name one only to advise against it or to offer a swap. If they ask about one, explain kindly that PranaVeda's guidance leaves it out, and offer a swap.

Excluded:
${excluded.map(line).join('\n')}`,
  ];
  if (unsafe.length) parts.push(`Never suggest, even in small amounts (unsafe or for practitioners only):\n${unsafe.map(line).join('\n')}`);
  if (rules.allowed.length) {
    parts.push(`Allowed:\n${rules.allowed.map((a) => `- ${a.item}${a.terms.length ? ` (${a.terms.join(', ')})` : ''}${a.note ? `: ${a.note}` : ''}`).join('\n')}`);
  }
  if (rules.combinations.length) {
    parts.push(`Never combine in one meal or recipe:\n${rules.combinations.map((c) => `- ${c.item}: ${c.rule}`).join('\n')}`);
  }
  if (rules.swaps.length) parts.push(`Swaps:\n${rules.swaps.map((s) => `- ${s.replaces} → ${s.swap}`).join('\n')}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Serving: read from the database, cached per instance.

async function readFoodRules(): Promise<FoodRules> {
  const db = getDb();
  const [exclusions, terms, substitutions] = await Promise.all([
    db
      .select({
        id: schema.exclusions.id,
        item: schema.exclusions.item,
        status: schema.exclusions.status,
        notes: schema.exclusions.notes,
        notWhen: schema.exclusions.notWhen,
      })
      .from(schema.exclusions),
    db.select({ exclusionId: schema.exclusionTerms.exclusionId, term: schema.exclusionTerms.term }).from(schema.exclusionTerms),
    db
      .select({ replaces: schema.foodSubstitutions.replaces, swap: schema.foodSubstitutions.swap })
      .from(schema.foodSubstitutions)
      .orderBy(asc(schema.foodSubstitutions.position)),
  ]);
  const rules = foodRulesFrom({ exclusions, terms, substitutions }, 'database');
  // No exclusions means the tables are not loaded yet, not that nothing is excluded.
  if (!rules.exclusions.length) throw new Error('the exclusions table is empty');
  return rules;
}

let cached: { rules: FoodRules; until: number } | undefined;
let inflight: Promise<FoodRules> | undefined;

export async function getFoodRules(now = Date.now()): Promise<FoodRules> {
  if (cached && now < cached.until) return cached.rules;
  if (!(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)) return BUILT_IN_FOOD_RULES;
  inflight ??= readFoodRules()
    .then((rules) => {
      cached = { rules, until: now + TTL_MS };
      return rules;
    })
    .catch((err) => {
      console.error('[food] using the built-in exclusions; the database read failed:', err?.message || err);
      cached = { rules: BUILT_IN_FOOD_RULES, until: now + RETRY_MS };
      return BUILT_IN_FOOD_RULES;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

// For tests: forget the cached rules.
export function resetFoodRulesCache() {
  cached = undefined;
  inflight = undefined;
}
