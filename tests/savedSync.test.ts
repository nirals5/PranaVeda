import { describe, expect, it } from 'vitest';
import { reconcileSaved, savedMillis } from '../src/lib/savedSync';
import type { SavedPractice } from '../src/types';

const saved = (id: string): SavedPractice =>
  ({ id, title: id, date: 'Oct 17', query: '', category: 'Yoga', result: { yogaPractice: { title: id, poses: [] } } }) as unknown as SavedPractice;

describe('reconcileSaved', () => {
  const a = saved('save_1760000000001');
  const b = saved('save_1760000000002');
  const c = saved('save_1760000000003_ab12c');

  it('adds what was saved elsewhere and drops what was removed elsewhere', () => {
    // This device knew a and b; the account now has b and c.
    const out = reconcileSaved([a, b], [c, b], new Set([a.id, b.id]), new Set());
    expect(out.rituals.map((r) => r.id)).toEqual([c.id, b.id]);
    expect(out.synced.sort()).toEqual([b.id, c.id].sort());
  });

  it('keeps what has not reached the account yet', () => {
    const out = reconcileSaved([a, c], [b], new Set([b.id]), new Set());
    expect(out.rituals.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
  });

  it('does not bring back what this device just removed', () => {
    const out = reconcileSaved([], [b], new Set([b.id]), new Set([b.id]));
    expect(out.rituals).toEqual([]);
    expect(out.synced).toEqual([]);
  });

  it('reads when a ritual was saved from its id', () => {
    expect(savedMillis('save_1760000000003_ab12c')).toBe(1760000000003);
    expect(savedMillis('temp_1760000000004')).toBe(1760000000004);
    expect(savedMillis('something')).toBe(0);
  });
});
