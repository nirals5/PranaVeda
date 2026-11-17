import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';
import { apnsConfig, apnsRequest, apnsSender, outcomeOf, parseDeviceToken, providerToken, type ApnsConfig } from '../api/_lib/apns.js';

// Push nudges to the iPhone app through Apple's push service (KAN-31).

const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const config: ApnsConfig = { keyId: 'ABC123DEFG', teamId: '3X6SHS8KP7', key, topic: 'com.pranaveda.app' };
const NOW = Date.parse('2026-11-17T22:00:00Z');
const TOKEN = 'a1'.repeat(32);
const nudge = { title: 'Amrita', body: 'You have 60 open minutes, until 3:00 PM. A good moment to practice.', url: '/?nudge=1' };

describe('APNs settings', () => {
  it('are off until all three secrets are set', () => {
    expect(apnsConfig({})).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: '3X6SHS8KP7' })).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: '3X6SHS8KP7', APNS_KEY: key })).toEqual(config);
  });

  it('accept the key with its line breaks written as \\n, as some dashboards store it', () => {
    const flat = key.replace(/\n/g, '\\n');
    expect(apnsConfig({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: '3X6SHS8KP7', APNS_KEY: flat })?.key).toBe(key);
  });
});

describe('the device token an app sends', () => {
  it('is hex, with the environment its build talks to', () => {
    expect(parseDeviceToken({ token: TOKEN, environment: 'sandbox' })).toEqual({ token: TOKEN, environment: 'sandbox' });
    expect(parseDeviceToken({ token: TOKEN.toUpperCase(), environment: 'production' })).toEqual({ token: TOKEN, environment: 'production' });
    expect(parseDeviceToken({ token: 'not hex!', environment: 'sandbox' })).toBeNull();
    expect(parseDeviceToken({ token: 'ab', environment: 'sandbox' })).toBeNull();
    expect(parseDeviceToken({ token: TOKEN, environment: 'staging' })).toBeNull();
    expect(parseDeviceToken({ token: TOKEN })).toBeNull();
  });
});

describe('the request to Apple', () => {
  it('signs a provider token with the key, its id and the team', async () => {
    const jwt = await providerToken(config, NOW);
    expect(decodeProtectedHeader(jwt)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(decodeJwt(jwt)).toEqual({ iss: '3X6SHS8KP7', iat: NOW / 1000 });
    // Apple refuses tokens refreshed more often than every 20 minutes.
    expect(await providerToken(config, NOW + 10 * 60 * 1000)).toBe(jwt);
    expect(await providerToken(config, NOW + 50 * 60 * 1000)).not.toBe(jwt);
  });

  it('goes to the sandbox or the live service, one nudge at a time, gone after 15 minutes', async () => {
    const live = await apnsRequest(config, { token: TOKEN, environment: 'production' }, nudge, NOW);
    expect(live.url).toBe(`https://api.push.apple.com/3/device/${TOKEN}`);
    expect(live.headers).toMatchObject({
      'apns-topic': 'com.pranaveda.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(NOW / 1000 + 15 * 60),
      'apns-collapse-id': 'pranaveda-nudge',
    });
    expect(live.headers.authorization).toMatch(/^bearer ey/);
    expect(JSON.parse(live.body)).toEqual({
      aps: { alert: { title: 'Amrita', body: nudge.body }, sound: 'default', 'thread-id': 'pranaveda-nudge' },
      url: '/?nudge=1',
    });
    const test = await apnsRequest(config, { token: TOKEN, environment: 'sandbox' }, nudge, NOW);
    expect(test.url).toBe(`https://api.sandbox.push.apple.com/3/device/${TOKEN}`);
  });
});

describe("Apple's answer", () => {
  it('drops a token Apple no longer knows, and only then', () => {
    expect(outcomeOf(200)).toBe('ok');
    expect(outcomeOf(410, 'Unregistered')).toBe('gone');
    expect(outcomeOf(400, 'BadDeviceToken')).toBe('gone');
    expect(outcomeOf(400, 'DeviceTokenNotForTopic')).toBe('gone');
    expect(outcomeOf(403, 'InvalidProviderToken')).toBe('failed');
    expect(outcomeOf(429, 'TooManyRequests')).toBe('failed');
    expect(outcomeOf(500, 'InternalServerError')).toBe('failed');
  });

  it('is what the sender reports; nothing is sent without the secrets or when the network fails', async () => {
    const calls: string[] = [];
    const send = apnsSender(config, async (url) => {
      calls.push(url);
      return { status: 410, reason: 'Unregistered' };
    });
    expect(await send({ token: TOKEN, environment: 'production' }, nudge, NOW)).toBe('gone');
    expect(calls).toHaveLength(1);

    const unset = apnsSender(null, async () => {
      throw new Error('should not be called');
    });
    expect(await unset({ token: TOKEN, environment: 'production' }, nudge, NOW)).toBe('failed');

    const offline = apnsSender(config, async () => {
      throw new Error('ECONNRESET');
    });
    expect(await offline({ token: TOKEN, environment: 'production' }, nudge, NOW)).toBe('failed');
  });
});
