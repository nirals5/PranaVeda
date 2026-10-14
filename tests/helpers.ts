import type { RefreshRow, RefreshStore } from '../api/_lib/refresh.js';

export const SECRET_A = 'test-secret-a-0123456789abcdef0123456789abcdef';
export const SECRET_B = 'test-secret-b-fedcba9876543210fedcba9876543210';

export function useSecrets(current?: string, previous?: string) {
  if (current) process.env.AUTH_JWT_SECRET = current;
  else delete process.env.AUTH_JWT_SECRET;
  if (previous) process.env.AUTH_JWT_SECRET_PREVIOUS = previous;
  else delete process.env.AUTH_JWT_SECRET_PREVIOUS;
}

export const minutes = (n: number) => n * 60 * 1000;
export const later = (from: Date, ms: number) => new Date(from.getTime() + ms);

// Every method yields before touching the rows, like a real database call, so
// two rotations started together genuinely interleave.
export class MemoryRefreshStore implements RefreshStore {
  rows: RefreshRow[] = [];

  async insert(row: RefreshRow) {
    await Promise.resolve();
    this.rows.push({ ...row });
  }
  async findByHash(tokenHash: string) {
    await Promise.resolve();
    const row = this.rows.find((r) => r.tokenHash === tokenHash);
    return row ? { ...row } : null;
  }
  async claimRotation(id: string, rotatedAt: Date, successorEnc: string) {
    await Promise.resolve();
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.rotatedAt || row.revokedAt) return false;
    row.rotatedAt = rotatedAt;
    row.successorEnc = successorEnc;
    return true;
  }
  async remove(id: string) {
    await Promise.resolve();
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async revokeFamily(familyId: string, at: Date) {
    await Promise.resolve();
    for (const row of this.rows) {
      if (row.familyId === familyId && !row.revokedAt) {
        row.revokedAt = at;
        row.successorEnc = null;
      }
    }
  }
}
