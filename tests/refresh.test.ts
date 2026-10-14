import { beforeEach, describe, expect, it } from 'vitest';
import {
  REFRESH_GRACE_MS,
  REFRESH_TTL_MS,
  RefreshError,
  issueSession,
  revokeSession,
  rotateSession,
} from '../api/_lib/refresh.js';
import { hashToken, verifyAccessToken } from '../api/_lib/tokens.js';
import { MemoryRefreshStore, SECRET_A, later, useSecrets } from './helpers.js';

const now = new Date('2026-10-13T12:00:00Z');
const session = { userId: 'user-1', client: 'ios', aud: 'app', scope: ['sync'] } as const;

const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'accepted';
  } catch (err) {
    return err instanceof RefreshError ? err.reason : `unexpected: ${err}`;
  }
};

let store: MemoryRefreshStore;

beforeEach(() => {
  useSecrets(SECRET_A);
  store = new MemoryRefreshStore();
});

describe('issueSession', () => {
  it('returns a verifiable access token and stores only a hash of the refresh token', async () => {
    const tokens = await issueSession(store, session, now);
    expect(await verifyAccessToken(tokens.accessToken, 'app', now)).toEqual({
      userId: 'user-1',
      sessionId: tokens.sessionId,
      scope: ['sync'],
    });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tokenHash).toBe(hashToken(tokens.refreshToken));
    expect(JSON.stringify(store.rows)).not.toContain(tokens.refreshToken);
    expect(store.rows[0].expiresAt).toEqual(later(now, REFRESH_TTL_MS));
  });

  it('starts a separate family for each sign-in', async () => {
    const a = await issueSession(store, session, now);
    const b = await issueSession(store, session, now);
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe('rotateSession', () => {
  it('returns a new refresh token in the same family with a renewed expiry', async () => {
    const first = await issueSession(store, session, now);
    const at = later(now, 60_000);
    const second = await rotateSession(store, first.refreshToken, at);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.userId).toBe('user-1');
    expect((await verifyAccessToken(second.accessToken, 'app', at)).sessionId).toBe(first.sessionId);
    expect(store.rows.find((r) => r.tokenHash === hashToken(second.refreshToken))?.expiresAt).toEqual(later(at, REFRESH_TTL_MS));
  });

  it('can be chained', async () => {
    let tokens = await issueSession(store, session, now);
    for (let i = 1; i <= 3; i++) tokens = await rotateSession(store, tokens.refreshToken, later(now, i * 3_600_000));
    expect(store.rows).toHaveLength(4);
    expect(store.rows.every((r) => !r.revokedAt)).toBe(true);
  });

  it('gives a retry inside the grace window the same successor', async () => {
    const first = await issueSession(store, session, now);
    const second = await rotateSession(store, first.refreshToken, now);
    const retry = await rotateSession(store, first.refreshToken, later(now, REFRESH_GRACE_MS));

    expect(retry.refreshToken).toBe(second.refreshToken);
    expect(store.rows).toHaveLength(2); // no fork
    expect(store.rows.every((r) => !r.revokedAt)).toBe(true);
  });

  it('gives two simultaneous requests the same successor and leaves no orphan', async () => {
    const first = await issueSession(store, session, now);
    const [a, b] = await Promise.all([
      rotateSession(store, first.refreshToken, now),
      rotateSession(store, first.refreshToken, now),
    ]);

    expect(a.refreshToken).toBe(b.refreshToken);
    expect(store.rows).toHaveLength(2);
    expect(await reasonOf(rotateSession(store, a.refreshToken, later(now, 3_600_000)))).toBe('accepted');
  });

  it('treats reuse after the grace window as theft and revokes the whole family', async () => {
    const first = await issueSession(store, session, now);
    const second = await rotateSession(store, first.refreshToken, now);
    const afterGrace = later(now, REFRESH_GRACE_MS + 1);

    expect(await reasonOf(rotateSession(store, first.refreshToken, afterGrace))).toBe('reused');
    expect(store.rows.every((r) => r.revokedAt)).toBe(true);
    // The legitimate holder of the successor is signed out too.
    expect(await reasonOf(rotateSession(store, second.refreshToken, afterGrace))).toBe('invalid');
  });

  it('does not touch other sessions of the same user when one is revoked', async () => {
    const phone = await issueSession(store, session, now);
    const laptop = await issueSession(store, { ...session, client: 'web' }, now);
    await rotateSession(store, phone.refreshToken, now);
    await reasonOf(rotateSession(store, phone.refreshToken, later(now, REFRESH_GRACE_MS + 1)));

    expect(await reasonOf(rotateSession(store, laptop.refreshToken, later(now, 3_600_000)))).toBe('accepted');
  });

  it('rejects an expired token', async () => {
    const first = await issueSession(store, session, now);
    expect(await reasonOf(rotateSession(store, first.refreshToken, later(now, REFRESH_TTL_MS)))).toBe('expired');
    expect(await reasonOf(rotateSession(store, first.refreshToken, later(now, REFRESH_TTL_MS - 1)))).toBe('accepted');
  });

  it('rejects a token it has never seen', async () => {
    expect(await reasonOf(rotateSession(store, 'never-issued', now))).toBe('invalid');
  });
});

describe('revokeSession', () => {
  it('ends that session only', async () => {
    const phone = await issueSession(store, session, now);
    const laptop = await issueSession(store, { ...session, client: 'web' }, now);
    await revokeSession(store, phone.refreshToken, now);

    expect(await reasonOf(rotateSession(store, phone.refreshToken, now))).toBe('invalid');
    expect(await reasonOf(rotateSession(store, laptop.refreshToken, now))).toBe('accepted');
  });

  it('ignores an unknown token', async () => {
    await expect(revokeSession(store, 'never-issued', now)).resolves.toBeNull();
  });
});
