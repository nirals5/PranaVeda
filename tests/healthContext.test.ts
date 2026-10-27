import { describe, expect, it } from 'vitest';
import { healthPromptLines, sanitizeHealthContext } from '../api/index.js';

// Wearable readings sent with a chat: the website's from Google Health, the
// apps' from Apple Health (HRV as SDNN) and Health Connect (HRV as RMSSD).

describe('wearable readings', () => {
  it('keep the kind of HRV the apps name, and tell Amrita which it is', () => {
    const health = sanitizeHealthContext({
      hrv: { latest: 39, usual: 48, metric: 'sdnn' },
      sleep: { lastNightMinutes: 310, usualMinutes: 435 },
      restingHeartRate: { latest: 66, usual: 60 },
    })!;
    expect(health.hrv).toEqual({ latest: 39, usual: 48, metric: 'sdnn' });
    expect(healthPromptLines(health)).toEqual([
      'Resting heart rate: 66 bpm (their usual: 60)',
      'Overnight HRV (SDNN): 39 ms (their usual: 48)',
      'Sleep last night: 5h 10m (their usual: 7h 15m)',
    ]);
  });

  it('read as before without a kind, and drop one that is not known', () => {
    expect(healthPromptLines(sanitizeHealthContext({ hrv: { latest: 40, usual: 45 } })!)).toEqual(['Overnight HRV: 40 ms (their usual: 45)']);
    expect(sanitizeHealthContext({ hrv: { latest: 40, usual: 45, metric: '<b>x</b>' } })!.hrv).toEqual({ latest: 40, usual: 45 });
  });
});
