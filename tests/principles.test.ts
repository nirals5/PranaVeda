import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { catalogOf, getCatalog, resetCatalogCache } from '../api/_lib/catalog.js';
import {
  BREATHWORK,
  BUILT_IN_CATALOG,
  BUILT_IN_CONDITIONS,
  POSES,
  buildBreathworkCard,
  buildRitual,
  catalogPromptSummary,
  citedPrinciple,
  droppedCitationNote,
} from '../api/index.js';

// G12: a card may cite a principle only if it exists in the Practice Library's
// Principles tab; any other citation is dropped and the card keeps its plain why.

const principles = [
  { id: 'PR4', statement: 'Like increases like, and opposites bring balance.' },
  { id: 'PR12', statement: 'Cooling breaths reduce heat; heating breaths increase it.' },
];
const catalog = catalogOf(POSES, BREATHWORK, BUILT_IN_CONDITIONS, 'database', principles);

const ritual = (extra: object = {}) => ({
  title: 'Steady',
  description: 'x',
  summary: 'Your plain why.',
  doshaTendency: 'Kapha',
  primaryEnergy: 'bright',
  poses: [
    { poseId: 'triangle', durationMinutes: 2 },
    { poseId: 'tadasana', durationMinutes: 2 },
  ],
  breathworkId: 'sama_vritti',
  ayurvedic: { assessment: 'x', doshaPrimary: 'Kapha', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
  lifestyleTips: [],
  ...extra,
});

describe('citing a principle', () => {
  it('keeps a principle that exists, with its statement', () => {
    expect(citedPrinciple({ principleId: 'PR4' }, catalog)).toEqual(principles[0]);
    expect(citedPrinciple({ principleId: ' pr12 ' }, catalog)).toEqual(principles[1]);
  });

  it('drops one that does not exist, and anything that is not an id', () => {
    for (const principleId of ['PR99', 'Charaka 1.44', '', 4, null, undefined]) {
      expect(citedPrinciple({ principleId }, catalog)).toBeUndefined();
    }
  });

  it('cites nothing with the built-in catalog, which has no principles', () => {
    expect(BUILT_IN_CATALOG.principles).toEqual([]);
    expect(citedPrinciple({ principleId: 'PR4' }, BUILT_IN_CATALOG)).toBeUndefined();
  });
});

describe('cards', () => {
  it('carry the principle on a ritual, kept with the result', () => {
    const { card } = buildRitual(ritual({ principleId: 'PR4' }), {}, catalog, '');
    expect(card.result.principle).toEqual(principles[0]);
    expect(card.result.summary).toBe('Your plain why.');
  });

  it('carry it on a breathwork card', () => {
    const { card } = buildBreathworkCard({ breathworkId: 'sheetali', note: 'To cool down.', principleId: 'PR12' }, {}, catalog);
    expect(card.principle).toEqual(principles[1]);
  });

  it('are still shown, without a citation, when the principle does not exist', () => {
    const { card, error } = buildRitual(ritual({ principleId: 'PR99' }), {}, catalog, '');
    expect(error).toBeUndefined();
    expect(card.result).not.toHaveProperty('principle');
    expect(buildBreathworkCard({ breathworkId: 'sheetali', principleId: 'PR99' }, {}, catalog).card).not.toHaveProperty('principle');
  });

  it('tell Amrita when a citation was dropped, so she does not mention it', () => {
    expect(droppedCitationNote({ principleId: 'PR99' }, undefined)).toContain('"PR99" is not on the Principles list');
    expect(droppedCitationNote({ principleId: 'PR4' }, principles[0])).toBe('');
    expect(droppedCitationNote({}, undefined)).toBe('');
  });
});

describe('telling Amrita', () => {
  it('lists the principles she may cite, by id', () => {
    const summary = catalogPromptSummary(catalog);
    expect(summary).toContain('## Principles (cite at most one per card, by id, as principleId)');
    expect(summary).toContain('- PR4: Like increases like, and opposites bring balance.');
  });

  it('lists none when there are none', () => {
    expect(catalogPromptSummary(BUILT_IN_CATALOG)).not.toContain('## Principles');
  });
});

// Against the configured database: the Principles tab is read with the catalog.
const hasDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED);
describe.skipIf(!hasDb)('principles in the database', () => {
  it('are loaded with the catalog, in number order', async () => {
    resetCatalogCache();
    const served = await getCatalog(BUILT_IN_CATALOG);
    expect(served.source).toBe('database');
    expect(served.principles.length).toBeGreaterThan(0);
    const numbers = served.principles.map((p) => Number(p.id.slice(2)));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(served.principleById.get('PR4')?.statement).toMatch(/like/i);
  });
});
