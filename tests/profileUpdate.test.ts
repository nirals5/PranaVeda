import { describe, expect, it } from 'vitest';
import { applyProfileUpdate, normalizeProfileList } from '../api/index.js';

describe('normalizeProfileList', () => {
  it('passes clean arrays through', () => {
    expect(normalizeProfileList(['prefers evening practice', 'dislikes fast flows'])).toEqual([
      'prefers evening practice',
      'dislikes fast flows',
    ]);
  });

  it('strips JSON fragments the model leaves on a value', () => {
    expect(normalizeProfileList('foo"]')).toEqual(['foo']);
    expect(normalizeProfileList(['foo"]'])).toEqual(['foo']);
    expect(normalizeProfileList('["foo')).toEqual(['foo']);
    expect(normalizeProfileList('"foo"')).toEqual(['foo']);
    expect(normalizeProfileList('uses alternate nostril breathing (nadi shodhana) independently"]')).toEqual([
      'uses alternate nostril breathing (nadi shodhana) independently',
    ]);
  });

  it('parses a JSON-encoded array sent as a string', () => {
    expect(normalizeProfileList('["foo"]')).toEqual(['foo']);
    expect(normalizeProfileList('["foo", "bar"]')).toEqual(['foo', 'bar']);
    // Truncated JSON still splits into its items.
    expect(normalizeProfileList('["foo", "bar')).toEqual(['foo', 'bar']);
  });

  it('keeps quotes that belong to the text', () => {
    expect(normalizeProfileList('"Om" chanting before practice')).toEqual(['"Om" chanting before practice']);
  });

  it('drops empty and non-string values', () => {
    expect(normalizeProfileList(undefined)).toEqual([]);
    expect(normalizeProfileList('  ')).toEqual([]);
    expect(normalizeProfileList('[]')).toEqual([]);
    expect(normalizeProfileList(['"]', 3, null, 'foo'])).toEqual(['foo']);
  });
});

describe('applyProfileUpdate', () => {
  it('stores clean preferences, goals and conditions from JSON-ish tool input', () => {
    const next = applyProfileUpdate(
      { preferences: ['prefers evening practice'] },
      { addPreferences: 'foo"]', addGoals: '["ease lower-back stiffness"]', addConditions: ['lower_back_injury"]'] }
    );
    expect(next.preferences).toEqual(['prefers evening practice', 'foo']);
    expect(next.goals).toEqual(['ease lower-back stiffness']);
    expect(next.conditions).toEqual(['lower_back_injury']);
  });

  it('removes entries even when the removal arrives JSON-encoded', () => {
    const next = applyProfileUpdate({ preferences: ['foo', 'bar'] }, { removePreferences: '["Foo"]' });
    expect(next.preferences).toEqual(['bar']);
  });

  it('cleans observations too', () => {
    const next = applyProfileUpdate({}, { addObservation: 'slept poorly three nights running"]' });
    expect(next.observations?.map((o) => o.note)).toEqual(['slept poorly three nights running']);
  });
});
