import { beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, authenticate } from '../api/_lib/auth.js';
import { signAccessToken } from '../api/_lib/tokens.js';
import { SECRET_A, later, minutes, useSecrets } from './helpers.js';

const claims = { userId: 'user-1', sessionId: 'family-1', scope: [] as string[] };
const now = new Date('2026-10-13T12:00:00Z');
const user = { kind: 'user', ...claims };

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
const cookie = (token: string, extra = '') => ({ headers: { cookie: `theme=dark; ${ACCESS_COOKIE}=${token}${extra}` } });

let valid: string;
let expired: string;

beforeEach(async () => {
  useSecrets(SECRET_A);
  valid = await signAccessToken(claims, 'app', now);
  expired = await signAccessToken(claims, 'app', later(now, -minutes(60)));
});

describe('authenticate', () => {
  it('treats a request with no credentials as a guest', async () => {
    expect(await authenticate({ headers: {} }, 'app', now)).toEqual({ kind: 'guest' });
    expect(await authenticate({ headers: { cookie: 'theme=dark; other=1' } }, 'app', now)).toEqual({ kind: 'guest' });
  });

  it('ignores credentials that are not ours', async () => {
    expect(await authenticate({ headers: { authorization: 'Basic dXNlcjpwYXNz' } }, 'app', now)).toEqual({ kind: 'guest' });
  });

  it('accepts a valid Bearer token', async () => {
    expect(await authenticate(bearer(valid), 'app', now)).toEqual(user);
    expect(await authenticate({ headers: { authorization: `bearer   ${valid}` } }, 'app', now)).toEqual(user);
  });

  it('accepts a valid session cookie', async () => {
    expect(await authenticate(cookie(valid), 'app', now)).toEqual(user);
    expect(await authenticate(cookie(valid, '; last=1'), 'app', now)).toEqual(user);
  });

  it('reports an expired token as invalid — never as a guest', async () => {
    expect(await authenticate(bearer(expired), 'app', now)).toEqual({ kind: 'invalid', reason: 'expired' });
    expect(await authenticate(cookie(expired), 'app', now)).toEqual({ kind: 'invalid', reason: 'expired' });
  });

  it('reports a malformed or empty token as invalid', async () => {
    expect(await authenticate(bearer('garbage'), 'app', now)).toEqual({ kind: 'invalid', reason: 'invalid' });
    expect(await authenticate({ headers: { authorization: 'Bearer' } }, 'app', now)).toEqual({ kind: 'invalid', reason: 'invalid' });
    expect(await authenticate({ headers: { cookie: `${ACCESS_COOKIE}=` } }, 'app', now)).toEqual({ kind: 'invalid', reason: 'invalid' });
  });

  it('rejects a speaker token on a first-party endpoint', async () => {
    const speaker = await signAccessToken(claims, 'alexa', now);
    expect(await authenticate(bearer(speaker), 'app', now)).toEqual({ kind: 'invalid', reason: 'invalid' });
    expect(await authenticate(bearer(speaker), 'alexa', now)).toEqual(user);
  });

  it('does not fall back to the cookie when the Bearer token is bad', async () => {
    const req = { headers: { authorization: 'Bearer garbage', cookie: `${ACCESS_COOKIE}=${valid}` } };
    expect(await authenticate(req, 'app', now)).toEqual({ kind: 'invalid', reason: 'invalid' });
  });

  it('with no signing secret configured: guests still pass, tokens are refused', async () => {
    useSecrets(undefined);
    expect(await authenticate({ headers: {} }, 'app', now)).toEqual({ kind: 'guest' });
    expect(await authenticate(bearer(valid), 'app', now)).toEqual({ kind: 'invalid', reason: 'invalid' });
  });
});
