import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACCESS_TTL_SECONDS,
  AccessTokenError,
  AuthConfigError,
  hashToken,
  newOpaqueToken,
  seal,
  signAccessToken,
  unseal,
  verifyAccessToken,
} from '../api/_lib/tokens.js';
import { SECRET_A, SECRET_B, later, useSecrets } from './helpers.js';

const claims = { userId: 'user-1', sessionId: 'family-1', scope: ['profile', 'sync'] };
const now = new Date('2026-10-13T12:00:00Z');

const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'accepted';
  } catch (err) {
    return err instanceof AccessTokenError ? err.reason : `unexpected: ${err}`;
  }
};

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

beforeEach(() => useSecrets(SECRET_A));

describe('access tokens', () => {
  it('round-trips the claims', async () => {
    const token = await signAccessToken(claims, 'app', now);
    expect(await verifyAccessToken(token, 'app', now)).toEqual(claims);
  });

  it('round-trips an empty scope', async () => {
    const token = await signAccessToken({ ...claims, scope: [] }, 'app', now);
    expect((await verifyAccessToken(token, 'app', now)).scope).toEqual([]);
  });

  it('is valid until it expires, then reports "expired"', async () => {
    const token = await signAccessToken(claims, 'app', now);
    const justBefore = later(now, (ACCESS_TTL_SECONDS - 1) * 1000);
    const justAfter = later(now, (ACCESS_TTL_SECONDS + 1) * 1000);
    expect(await reasonOf(verifyAccessToken(token, 'app', justBefore))).toBe('accepted');
    expect(await reasonOf(verifyAccessToken(token, 'app', justAfter))).toBe('expired');
  });

  it('rejects a token issued for another audience', async () => {
    const speakerToken = await signAccessToken(claims, 'alexa', now);
    expect(await reasonOf(verifyAccessToken(speakerToken, 'app', now))).toBe('invalid');
    expect(await reasonOf(verifyAccessToken(speakerToken, 'alexa', now))).toBe('accepted');
  });

  it('rejects a tampered payload', async () => {
    const [header, , signature] = (await signAccessToken(claims, 'app', now)).split('.');
    const forged = b64({ iss: 'pranaveda', aud: 'app', sub: 'someone-else', sid: 'x', exp: 9999999999 });
    expect(await reasonOf(verifyAccessToken(`${header}.${forged}.${signature}`, 'app', now))).toBe('invalid');
  });

  it('rejects an unsigned ("alg: none") token carrying a known key id', async () => {
    const [header] = (await signAccessToken(claims, 'app', now)).split('.');
    const { kid } = JSON.parse(Buffer.from(header, 'base64url').toString());
    const payload = b64({ iss: 'pranaveda', aud: 'app', sub: 'user-1', sid: 'x', exp: 9999999999 });
    expect(await reasonOf(verifyAccessToken(`${b64({ alg: 'none', kid })}.${payload}.`, 'app', now))).toBe('invalid');
  });

  it('rejects garbage', async () => {
    for (const junk of ['', 'not-a-token', 'a.b.c']) {
      expect(await reasonOf(verifyAccessToken(junk, 'app', now))).toBe('invalid');
    }
  });

  it('rejects a token signed with an unknown secret', async () => {
    const token = await signAccessToken(claims, 'app', now);
    useSecrets(SECRET_B);
    expect(await reasonOf(verifyAccessToken(token, 'app', now))).toBe('invalid');
  });

  it('keeps accepting the previous secret after a rotation, and signs with the new one', async () => {
    const oldToken = await signAccessToken(claims, 'app', now);
    useSecrets(SECRET_B, SECRET_A);
    expect(await reasonOf(verifyAccessToken(oldToken, 'app', now))).toBe('accepted');

    const newToken = await signAccessToken(claims, 'app', now);
    useSecrets(SECRET_B); // previous secret retired
    expect(await reasonOf(verifyAccessToken(newToken, 'app', now))).toBe('accepted');
    expect(await reasonOf(verifyAccessToken(oldToken, 'app', now))).toBe('invalid');
  });

  it('refuses to sign without a secret, or with a short one', async () => {
    useSecrets(undefined);
    await expect(signAccessToken(claims, 'app', now)).rejects.toBeInstanceOf(AuthConfigError);
    useSecrets('too-short');
    await expect(signAccessToken(claims, 'app', now)).rejects.toBeInstanceOf(AuthConfigError);
  });
});

describe('refresh-token primitives', () => {
  it('generates distinct high-entropy tokens', () => {
    const a = newOpaqueToken();
    const b = newOpaqueToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
  });

  it('hashes deterministically and never returns the token itself', () => {
    const token = newOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it('seals and unseals, and returns null for anything it cannot open', () => {
    const sealed = seal('successor-token');
    expect(sealed).not.toContain('successor-token');
    expect(unseal(sealed)).toBe('successor-token');
    expect(unseal(sealed.slice(0, -2) + 'AA')).toBeNull();
    expect(unseal('garbage')).toBeNull();
    useSecrets(SECRET_B);
    expect(unseal(sealed)).toBeNull();
  });
});
