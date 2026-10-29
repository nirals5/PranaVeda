import { describe, expect, it } from 'vitest';
import { mergeLogs } from '../src/hooks/usePracticeLog';
import { pendingUploads } from '../src/hooks/usePracticeSync';
import type { PracticeLogEntry } from '../src/types';

const entry = (id: string, completedAt: string, extra: Partial<PracticeLogEntry> = {}): PracticeLogEntry => ({
  id,
  kind: 'breathwork',
  title: id,
  completedAt,
  localDate: completedAt.slice(0, 10),
  durationMinutes: 5,
  ...extra,
});

describe('mergeLogs', () => {
  it('adds entries from another device in time order', () => {
    const local = [entry('a', '2026-10-01T08:00:00Z'), entry('c', '2026-10-03T08:00:00Z')];
    const merged = mergeLogs(local, [entry('b', '2026-10-02T08:00:00Z'), entry('d', '2026-10-04T08:00:00Z')]);
    expect(merged.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps one of each practice when the same entry arrives again', () => {
    const local = [entry('a', '2026-10-01T08:00:00Z', { title: 'local copy' })];
    const merged = mergeLogs(local, [entry('a', '2026-10-01T08:00:00Z', { title: 'server copy' }), entry('b', '2026-10-02T08:00:00Z')]);
    expect(merged.map((e) => [e.id, e.title])).toEqual([
      ['a', 'local copy'],
      ['b', 'b'],
    ]);
  });

  it('returns the same log untouched when nothing is new', () => {
    const local = [entry('a', '2026-10-01T08:00:00Z')];
    expect(mergeLogs(local, [entry('a', '2026-10-01T08:00:00Z')])).toBe(local);
  });

  it('stays within the device’s size limits after a large merge', () => {
    const incoming = Array.from({ length: 600 }, (_, i) =>
      entry(`p${i}`, new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString(), { result: { snapshot: i } as any })
    );
    const merged = mergeLogs([], incoming);
    expect(merged).toHaveLength(500);
    expect(merged.at(-1)!.id).toBe('p599'); // the newest are the ones kept
    expect(merged.filter((e) => e.result).length).toBe(40); // snapshots only on the most recent
  });
});

describe('what goes to the account', () => {
  it('sends new practices, and a rating the account has not had (H11)', () => {
    const a = entry('a', '2026-10-01T08:00:00Z');
    const b = entry('b', '2026-10-02T08:00:00Z', { feeling: 'less' });
    const c = entry('c', '2026-10-03T08:00:00Z', { feeling: 'more' });
    const d = entry('d', '2026-10-04T08:00:00Z');
    const pending = pendingUploads([a, b, c, d], new Set(['a', 'b', 'c']), { c: 'more' });
    expect(pending.map((e) => e.id)).toEqual(['b', 'd']);
    expect(pendingUploads([c], new Set(['c']), { c: 'less' }).map((e) => e.id)).toEqual(['c']);
  });
});
