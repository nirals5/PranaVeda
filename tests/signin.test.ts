import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deviceFromClient, deviceFromUserAgent } from '../api/_lib/device.js';
import { IdentityTokenError, useGoogleKeys, verifyGoogleIdToken } from '../api/_lib/google.js';
import { NONCE_TTL_MS, isValidNonce, issueNonce } from '../api/_lib/nonce.js';
import { SECRET_A, SECRET_B, later, useSecrets } from './helpers.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const now = new Date('2026-10-13T12:00:00Z');

// A stand-in for Google: a key pair made here, whose public half the verifier
// is told to trust. `impostor` is a second pair it is NOT told about.
let google: CryptoKey;
let impostor: CryptoKey;

export async function googleToken(claims: Record<string, unknown> = {}, key: CryptoKey = google, at: Date = now) {
  const { iss = 'https://accounts.google.com', aud = CLIENT_ID, ...rest } = claims;
  const issuedAt = Math.floor(at.getTime() / 1000);
  return new SignJWT({ sub: 'google-sub-1', email: 'Person@Example.com', email_verified: true, name: 'Test Person', ...rest })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss as string)
    .setAudience(aud as string)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  google = pair.privateKey;
  impostor = (await generateKeyPair('RS256')).privateKey;
  useGoogleKeys(createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' }] }));
});

afterAll(() => useGoogleKeys(undefined));

beforeEach(() => {
  useSecrets(SECRET_A);
  process.env.GOOGLE_CLIENT_ID_WEB = CLIENT_ID;
  delete process.env.VITE_GOOGLE_CLIENT_ID;
});

const rejected = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(IdentityTokenError);

describe('verifyGoogleIdToken', () => {
  it('accepts a token signed by Google for this app with the right nonce', async () => {
    expect(await verifyGoogleIdToken(await googleToken({ nonce: 'n1' }), 'n1', now)).toEqual({
      subject: 'google-sub-1',
      email: 'person@example.com',
      emailVerified: true,
      name: 'Test Person',
    });
  });

  it('rejects a token issued for a different app', async () => {
    await rejected(verifyGoogleIdToken(await googleToken({ nonce: 'n1', aud: 'someone-else.apps.googleusercontent.com' }), 'n1', now));
  });

  it('rejects a token with the wrong or missing nonce', async () => {
    await rejected(verifyGoogleIdToken(await googleToken({ nonce: 'other' }), 'n1', now));
    await rejected(verifyGoogleIdToken(await googleToken(), 'n1', now));
  });

  it('rejects a token not signed by Google', async () => {
    await rejected(verifyGoogleIdToken(await googleToken({ nonce: 'n1' }, impostor), 'n1', now));
  });

  it('rejects a token from another issuer, an expired token, and garbage', async () => {
    await rejected(verifyGoogleIdToken(await googleToken({ nonce: 'n1', iss: 'https://evil.example' }), 'n1', now));
    await rejected(verifyGoogleIdToken(await googleToken({ nonce: 'n1' }), 'n1', later(now, 2 * 3600_000)));
    await rejected(verifyGoogleIdToken('not-a-token', 'n1', now));
  });

  it('reports an unverified email as unverified', async () => {
    const identity = await verifyGoogleIdToken(await googleToken({ nonce: 'n1', email_verified: false }), 'n1', now);
    expect(identity.emailVerified).toBe(false);
  });

  it('refuses everything when no client id is configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID_WEB;
    await rejected(verifyGoogleIdToken(await googleToken({ nonce: 'n1' }), 'n1', now));
  });
});

describe('sign-in nonce', () => {
  it('is valid until it expires', () => {
    const nonce = issueNonce(now);
    expect(isValidNonce(nonce, now)).toBe(true);
    expect(isValidNonce(nonce, later(now, NONCE_TTL_MS - 1))).toBe(true);
    expect(isValidNonce(nonce, later(now, NONCE_TTL_MS))).toBe(false);
  });

  it('differs every time', () => {
    expect(issueNonce(now)).not.toBe(issueNonce(now));
  });

  it('rejects a forged, altered or foreign nonce', () => {
    const [random, expires, signature] = issueNonce(now).split('.');
    expect(isValidNonce(`${random}.${Number(expires) + 60_000}.${signature}`, now)).toBe(false);
    expect(isValidNonce(`${random}.${expires}.AAAA`, now)).toBe(false);
    expect(isValidNonce('made-up', now)).toBe(false);
    expect(isValidNonce(undefined, now)).toBe(false);
    const fromOtherServer = issueNonce(now);
    useSecrets(SECRET_B);
    expect(isValidNonce(fromOtherServer, now)).toBe(false);
  });
});

describe('device info', () => {
  const ua = (value: string) => deviceFromUserAgent({ headers: { 'user-agent': value } });

  it('reads class, OS and browser from common user agents', () => {
    expect(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')).toMatchObject({
      deviceClass: 'desktop', os: 'macOS', osVersion: '10', browser: 'Chrome',
    });
    expect(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1')).toMatchObject({
      deviceClass: 'phone', os: 'iOS', osVersion: '18', browser: 'Safari',
    });
    expect(ua('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')).toMatchObject({
      deviceClass: 'phone', os: 'Android', osVersion: '15', browser: 'Chrome',
    });
    expect(ua('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')).toMatchObject({
      deviceClass: 'tablet', os: 'Android',
    });
    expect(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toMatchObject({
      deviceClass: 'desktop', os: 'Windows', browser: 'Edge',
    });
    expect(ua('Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0')).toMatchObject({
      deviceClass: 'desktop', os: 'Linux', browser: 'Firefox',
    });
  });

  it('records nothing when there is no user agent', () => {
    expect(deviceFromUserAgent({ headers: {} })).toEqual({
      deviceClass: null, os: null, osVersion: null, browser: null, deviceModel: null, appVersion: null,
    });
  });

  it('keeps only short plain labels from a native app', () => {
    expect(deviceFromClient({ deviceClass: 'tablet', osVersion: '18.5.1', deviceModel: 'iPad14,3', appVersion: '1.2.0 (45)' }, 'ios')).toEqual({
      deviceClass: 'tablet', os: 'iOS', osVersion: '18', browser: null, deviceModel: 'iPad14,3', appVersion: '1.2.0 (45)',
    });
    expect(deviceFromClient({ deviceClass: 'toaster', deviceModel: '<script>', appVersion: 'x'.repeat(200) }, 'android')).toEqual({
      deviceClass: null, os: 'Android', osVersion: null, browser: null, deviceModel: null, appVersion: null,
    });
    expect(deviceFromClient(undefined, 'android').os).toBe('Android');
  });
});
