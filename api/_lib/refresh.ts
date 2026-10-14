import { randomUUID } from 'node:crypto';
import { ACCESS_TTL_SECONDS, hashToken, newOpaqueToken, seal, signAccessToken, unseal } from './tokens.js';
import type { Audience } from './tokens.js';

// Sessions: issuing and rotating refresh tokens.
//
// Every refresh token is single-use and belongs to a family (one sign-in on
// one device). Using it returns a successor in the same family. Two cases need
// care:
//
//   Retry  — a flaky network makes a client send the same token twice within
//            moments. Both requests get the SAME successor, so the client is
//            never logged out by its own retry and the family never forks.
//   Reuse  — the same token shows up after that short window. It has leaked or
//            been replayed, so the whole family is revoked.

export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000; // sliding: renewed on every rotation
export const REFRESH_GRACE_MS = 30 * 1000;

export type Client = 'web' | 'ios' | 'android' | 'alexa';

export interface RefreshRow {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  client: Client;
  aud: string;
  scope: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  successorEnc: string | null;
  revokedAt: Date | null;
}

// Storage is behind an interface so the rotation rules can be tested without
// a database. The Postgres implementation is in refreshStore.ts.
export interface RefreshStore {
  insert(row: RefreshRow): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshRow | null>;
  // Marks the row rotated ONLY if it is not already rotated or revoked.
  // Returns whether this call was the one that did it.
  claimRotation(id: string, rotatedAt: Date, successorEnc: string): Promise<boolean>;
  remove(id: string): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until the access token expires
  userId: string;
  sessionId: string;
}

export class RefreshError extends Error {
  constructor(public reason: 'invalid' | 'expired' | 'reused') {
    super(`refresh token ${reason}`);
  }
}

interface NewSession {
  userId: string;
  client: Client;
  aud: Audience;
  scope?: readonly string[];
}

async function tokensFor(row: RefreshRow, refreshToken: string, now: Date): Promise<SessionTokens> {
  const accessToken = await signAccessToken(
    { userId: row.userId, sessionId: row.familyId, scope: row.scope ? row.scope.split(' ') : [] },
    row.aud as Audience,
    now
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS, userId: row.userId, sessionId: row.familyId };
}

function newRow(base: Pick<RefreshRow, 'userId' | 'familyId' | 'client' | 'aud' | 'scope'>, token: string, now: Date): RefreshRow {
  return {
    ...base,
    id: randomUUID(),
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    rotatedAt: null,
    successorEnc: null,
    revokedAt: null,
  };
}

// A new sign-in: a new family.
export async function issueSession(store: RefreshStore, session: NewSession, now: Date = new Date()): Promise<SessionTokens> {
  const token = newOpaqueToken();
  const row = newRow(
    {
      userId: session.userId,
      familyId: randomUUID(),
      client: session.client,
      aud: session.aud,
      scope: (session.scope ?? []).join(' '),
    },
    token,
    now
  );
  await store.insert(row);
  return tokensFor(row, token, now);
}

export async function rotateSession(store: RefreshStore, presented: string, now: Date = new Date()): Promise<SessionTokens> {
  const tokenHash = hashToken(presented);
  let row = await store.findByHash(tokenHash);
  if (!row || row.revokedAt) throw new RefreshError('invalid');
  if (row.expiresAt.getTime() <= now.getTime()) throw new RefreshError('expired');

  if (!row.rotatedAt) {
    // The successor is stored before the claim, so it exists by the time any
    // request can be handed it. If a concurrent request wins the claim, this
    // one discards its own successor and falls through to the retry path.
    const successor = newOpaqueToken();
    const successorRow = newRow(row, successor, now);
    await store.insert(successorRow);
    if (await store.claimRotation(row.id, now, seal(successor))) {
      return tokensFor(successorRow, successor, now);
    }
    await store.remove(successorRow.id);
    row = await store.findByHash(tokenHash);
    if (!row || row.revokedAt) throw new RefreshError('invalid');
  }

  const sinceRotation = now.getTime() - (row.rotatedAt?.getTime() ?? 0);
  if (row.rotatedAt && row.successorEnc && sinceRotation <= REFRESH_GRACE_MS) {
    const successor = unseal(row.successorEnc);
    if (!successor) throw new RefreshError('invalid');
    return tokensFor(row, successor, now);
  }

  await store.revokeFamily(row.familyId, now);
  throw new RefreshError('reused');
}

// Sign-out: ends this device's session and nothing else.
export async function revokeSession(store: RefreshStore, presented: string, now: Date = new Date()): Promise<void> {
  const row = await store.findByHash(hashToken(presented));
  if (row) await store.revokeFamily(row.familyId, now);
}
