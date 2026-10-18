import { describe, expect, it } from 'vitest';
import { timeOfDay } from '../src/lib/greeting';

describe('timeOfDay', () => {
  it('wishes a good evening after midnight, and a good morning from 5', () => {
    expect([0, 1, 4].map(timeOfDay)).toEqual(['evening', 'evening', 'evening']);
    expect([5, 9, 11].map(timeOfDay)).toEqual(['morning', 'morning', 'morning']);
    expect([12, 16].map(timeOfDay)).toEqual(['afternoon', 'afternoon']);
    expect([17, 23].map(timeOfDay)).toEqual(['evening', 'evening']);
  });
});
