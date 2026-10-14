import { createHash } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppleTokenError, appleClientSecret, exchangeAppleCode, useAppleFetch, useAppleKeys, verifyAppleIdToken } from '../api/_lib/apple.js';
import { later } from './helpers.js';

const SERVICES_ID = 'com.pranaveda.web';
const BUNDLE_ID = 'com.pranaveda.app';
const now = new Date('2026-10-13T12:00:00Z');

// Stand-ins for Apple: a key pair whose public half the verifier trusts, one
// it does not, and an ES256 key playing our downloaded .p8 signing key.
let apple: CryptoKey;
let impostor: CryptoKey;
let ourKeyPublic: CryptoKey;

async function appleToken(claims: Record<string, unknown> = {}, key: CryptoKey = apple, at: Date = now) {
  const { iss = 'https://appleid.apple.com', aud = SERVICES_ID, ...rest } = claims;
  const issuedAt = Math.floor(at.getTime() / 1000);
  return new SignJWT({ sub: '001234.abcd.1234', email: 'Person@Example.com', email_verified: 'true', ...rest })
    .setProtectedHeader({ alg: 'RS256', kid: 'apple-test' })
    .setIssuer(iss as string)
    .setAudience(aud as string)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 600)
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  apple = pair.privateKey;
  impostor = (await generateKeyPair('RS256')).privateKey;
  useAppleKeys(createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'apple-test', alg: 'RS256' }] }));

  const ours = await generateKeyPair('ES256', { extractable: true });
  ourKeyPublic = ours.publicKey;
  process.env.APPLE_PRIVATE_KEY = (await exportPKCS8(ours.privateKey)).replace(/\n/g, '\\n'); // as an env editor stores it
});

afterAll(() => {
  useAppleKeys(undefined);
  useAppleFetch(undefined);
});

beforeEach(() => {
  process.env.APPLE_SERVICES_ID = SERVICES_ID;
  process.env.APPLE_BUNDLE_ID = BUNDLE_ID;
  process.env.APPLE_TEAM_ID = 'TEAM123456';
  process.env.APPLE_KEY_ID = 'KEY1234567';
});

const rejected = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(AppleTokenError);

describe('verifyAppleIdToken', () => {
  it('accepts a web token with our nonce as given', async () => {
    expect(await verifyAppleIdToken(await appleToken({ nonce: 'n1' }), 'n1', now)).toEqual({
      subject: '001234.abcd.1234',
      email: 'person@example.com',
      emailVerified: true,
      emailIsRelay: false,
      clientId: SERVICES_ID,
    });
  });

  it('accepts an iOS token carrying the SHA-256 of our nonce, for the bundle id', async () => {
    const hashed = createHash('sha256').update('n1').digest('hex');
    const identity = await verifyAppleIdToken(await appleToken({ nonce: hashed, aud: BUNDLE_ID }), 'n1', now);
    expect(identity.clientId).toBe(BUNDLE_ID);
  });

  it('flags a Hide My Email address', async () => {
    const identity = await verifyAppleIdToken(
      await appleToken({ nonce: 'n1', email: 'x7y8z9@privaterelay.appleid.com', is_private_email: 'true' }),
      'n1',
      now
    );
    expect(identity.emailIsRelay).toBe(true);
  });

  it('rejects the wrong nonce, the wrong app, a forged signature, another issuer, and an expired token', async () => {
    await rejected(verifyAppleIdToken(await appleToken({ nonce: 'other' }), 'n1', now));
    await rejected(verifyAppleIdToken(await appleToken({ nonce: 'n1', aud: 'com.someone.else' }), 'n1', now));
    await rejected(verifyAppleIdToken(await appleToken({ nonce: 'n1' }, impostor), 'n1', now));
    await rejected(verifyAppleIdToken(await appleToken({ nonce: 'n1', iss: 'https://accounts.google.com' }), 'n1', now));
    await rejected(verifyAppleIdToken(await appleToken({ nonce: 'n1' }), 'n1', later(now, 3600_000)));
  });

  it('refuses everything when no Apple id is configured', async () => {
    delete process.env.APPLE_SERVICES_ID;
    delete process.env.APPLE_BUNDLE_ID;
    await rejected(verifyAppleIdToken(await appleToken({ nonce: 'n1' }), 'n1', now));
  });
});

describe('Apple client secret and code exchange', () => {
  it('signs a short-lived client secret Apple can verify with our public key', async () => {
    const secret = await appleClientSecret(SERVICES_ID, now);
    const { payload, protectedHeader } = await jwtVerify(secret, ourKeyPublic, { currentDate: now });
    expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    expect(payload).toMatchObject({ iss: 'TEAM123456', sub: SERVICES_ID, aud: 'https://appleid.apple.com' });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
  });

  it('exchanges a code for Apple’s refresh token', async () => {
    let sent: URLSearchParams | undefined;
    useAppleFetch(async (_url, init) => {
      sent = new URLSearchParams(init?.body as URLSearchParams);
      return new Response(JSON.stringify({ refresh_token: 'apple-refresh', id_token: 'x' }), { status: 200 });
    });
    expect(await exchangeAppleCode('the-code', SERVICES_ID)).toBe('apple-refresh');
    expect(sent?.get('code')).toBe('the-code');
    expect(sent?.get('client_id')).toBe(SERVICES_ID);
    expect(sent?.get('grant_type')).toBe('authorization_code');
    expect(sent?.get('client_secret')).toMatch(/^ey/);
  });

  it('returns null, without throwing, when Apple refuses or cannot be reached', async () => {
    useAppleFetch(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    expect(await exchangeAppleCode('used-code', SERVICES_ID)).toBeNull();
    useAppleFetch(async () => {
      throw new Error('offline');
    });
    expect(await exchangeAppleCode('the-code', SERVICES_ID)).toBeNull();
    delete process.env.APPLE_KEY_ID;
    useAppleFetch(async () => new Response('{}'));
    expect(await exchangeAppleCode('the-code', SERVICES_ID)).toBeNull();
  });
});
