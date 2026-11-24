import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';
import { fcmConfig, fcmMessage, fcmOutcome, fcmSender, googleAccessToken, parseFcmToken, serviceAssertion, type FcmConfig, type Fetcher } from '../api/_lib/fcm.js';

// Push nudges to the Android app through Firebase Cloud Messaging (KAN-31).

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const account = { type: 'service_account', project_id: 'pranaveda-test', client_email: 'push@pranaveda-test.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' };
const config: FcmConfig = { projectId: 'pranaveda-test', clientEmail: account.client_email, privateKey, tokenUri: account.token_uri };
const NOW = Date.parse('2026-11-23T22:00:00Z');
const TOKEN = `dQw4w9WgXcQ:APA91b${'Ab_9-'.repeat(30)}`;
const nudge = { title: 'Amrita', body: 'You have 60 open minutes, until 3:00 PM. A good moment to practice.', url: '/?nudge=1' };

const reply = (status: number, body: unknown) => ({ status, json: async () => body });

describe('FCM settings', () => {
  it('come from the service account file, and are off without it', () => {
    expect(fcmConfig({})).toBeNull();
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT: 'not json' })).toBeNull();
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'x' }) })).toBeNull();
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT: JSON.stringify(account) })).toEqual(config);
  });

  it('accept a key whose line breaks were stored as \\n', () => {
    const flat = JSON.stringify({ ...account, private_key: privateKey.replace(/\n/g, '\\n') });
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT: flat })?.privateKey).toBe(privateKey);
  });
});

describe('the token an Android phone sends', () => {
  it("has FCM's own shape", () => {
    expect(parseFcmToken(TOKEN)).toBe(TOKEN);
    expect(parseFcmToken('short')).toBeNull();
    expect(parseFcmToken(`${TOKEN} spaces`)).toBeNull();
    expect(parseFcmToken(42)).toBeNull();
  });
});

describe('signing in to Google', () => {
  it('asks for messaging only, as the service account, for an hour', async () => {
    const jwt = await serviceAssertion(config, NOW);
    expect(decodeProtectedHeader(jwt)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decodeJwt(jwt)).toEqual({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
  });

  it('reuses the access token until shortly before it expires', async () => {
    const asked: string[] = [];
    const fetcher: Fetcher = async (_url, init) => {
      asked.push(String(init.body));
      return reply(200, { access_token: `token-${asked.length}`, expires_in: 3599 });
    };
    const first = { ...config, clientEmail: `reuse-${Math.random()}@x.iam.gserviceaccount.com` };
    expect(await googleAccessToken(first, NOW, fetcher)).toBe('token-1');
    expect(asked[0]).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    expect(await googleAccessToken(first, NOW + 30 * 60 * 1000, fetcher)).toBe('token-1');
    expect(await googleAccessToken(first, NOW + 58 * 60 * 1000, fetcher)).toBe('token-2');
  });
});

describe('the message', () => {
  it('carries the nudge as data, urgent enough to arrive, gone after 15 minutes, one at a time', () => {
    const { url, body } = fcmMessage(config, TOKEN, nudge);
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/pranaveda-test/messages:send');
    expect(JSON.parse(body)).toEqual({
      message: {
        token: TOKEN,
        data: { title: 'Amrita', body: nudge.body, url: '/?nudge=1' },
        android: { priority: 'HIGH', ttl: '900s', collapse_key: 'pranaveda-nudge' },
      },
    });
  });
});

describe("Google's answer", () => {
  it('drops a token Google no longer knows, or one from another project', () => {
    expect(fcmOutcome(200)).toBe('ok');
    expect(fcmOutcome(404, 'UNREGISTERED')).toBe('gone');
    expect(fcmOutcome(400, 'UNREGISTERED')).toBe('gone');
    expect(fcmOutcome(403, 'SENDER_ID_MISMATCH')).toBe('gone');
    expect(fcmOutcome(400, 'INVALID_ARGUMENT')).toBe('failed');
    expect(fcmOutcome(401, 'THIRD_PARTY_AUTH_ERROR')).toBe('failed');
    expect(fcmOutcome(429, 'QUOTA_EXCEEDED')).toBe('failed');
    expect(fcmOutcome(503, 'UNAVAILABLE')).toBe('failed');
  });

  it('is what the sender reports; nothing is sent without the secret or when the network fails', async () => {
    const own = { ...config, clientEmail: `sender-${Math.random()}@x.iam.gserviceaccount.com` };
    const sent: { url: string; auth?: string }[] = [];
    const fetcher: Fetcher = async (url, init) => {
      if (url.includes('oauth2')) return reply(200, { access_token: 'access', expires_in: 3599 });
      sent.push({ url, auth: init.headers?.authorization });
      return reply(404, { error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } });
    };
    expect(await fcmSender(own, fetcher)(TOKEN, nudge, NOW)).toBe('gone');
    expect(sent).toEqual([{ url: 'https://fcm.googleapis.com/v1/projects/pranaveda-test/messages:send', auth: 'Bearer access' }]);

    expect(await fcmSender(null, async () => { throw new Error('should not be called'); })(TOKEN, nudge, NOW)).toBe('failed');
    expect(await fcmSender({ ...own, clientEmail: 'offline@x' }, async () => { throw new Error('ECONNRESET'); })(TOKEN, nudge, NOW)).toBe('failed');
  });
});
