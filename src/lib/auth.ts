import { GOOGLE_CLIENT_ID } from '../hooks/googleAuth';

// Accounts are optional and off by default: the app is fully usable signed
// out. Sign-in appears only where VITE_ACCOUNTS_ENABLED is "true" and a Google
// client id is configured.
export const ACCOUNTS_ENABLED = import.meta.env.VITE_ACCOUNTS_ENABLED === 'true' && !!GOOGLE_CLIENT_ID;

// Sign in with Apple appears only once its Services ID is configured.
export const APPLE_SERVICES_ID = (import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined) || '';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string | null;
}

// The session itself lives in httpOnly cookies that this code cannot read.
// This flag only records that one probably exists, so a signed-out visitor
// never makes a request to find out.
const HINT_KEY = 'pranaveda_signed_in';

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1');
    else localStorage.removeItem(HINT_KEY);
  } catch {}
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

async function userFrom(response: Response): Promise<AuthUser | null> {
  return response.ok ? ((await response.json()).user as AuthUser | null) : null;
}

export async function fetchNonce(): Promise<string> {
  const response = await fetch('/api/auth/nonce');
  if (!response.ok) throw new Error('Sign-in is not available right now.');
  return (await response.json()).nonce;
}

// Restores the session on load. An expired access token is normal after 15
// minutes away: one refresh is tried before concluding the session is over.
export async function restoreSession(): Promise<AuthUser | null> {
  let response = await fetch('/api/me');
  if (response.status === 401) response = await fetch('/api/auth/refresh', json('POST'));
  if (response.status === 401) {
    setSessionHint(false);
    return null;
  }
  // Any other failure (offline, server unavailable) keeps the hint, so the
  // session is tried again on the next visit.
  return userFrom(response);
}

export type SignInRequest =
  | { provider: 'google'; credential: string; nonce: string }
  | { provider: 'apple'; idToken: string; code: string; nonce: string; name?: { firstName?: string; lastName?: string } };

const PROVIDER_NAMES = { google: 'Google', apple: 'Apple' } as const;

export async function signIn(request: SignInRequest): Promise<AuthUser> {
  const { provider, ...body } = request;
  const response = await fetch(`/api/auth/${provider}`, json('POST', { ...body, client: 'web' }));
  const user = await userFrom(response);
  if (!user) {
    const failure = response.ok ? {} : await response.json().catch(() => ({}));
    if (failure.error === 'account_exists') {
      const existing = PROVIDER_NAMES[failure.provider as keyof typeof PROVIDER_NAMES] ?? 'your other sign-in';
      throw new Error(`This email already has a PranaVeda account. Please continue with ${existing} instead.`);
    }
    throw new Error(failure.error === 'nonce_expired' ? 'That took a little long. Please try again.' : 'Sign-in did not complete. Please try again.');
  }
  setSessionHint(true);
  return user;
}

export async function saveTimezone(timezone: string): Promise<AuthUser | null> {
  return userFrom(await fetch('/api/me', json('PATCH', { timezone })));
}

export async function signOut(): Promise<void> {
  setSessionHint(false);
  await fetch('/api/auth/logout', json('POST')).catch(() => {});
}

// Permanent. Removes the account from the server; nothing on this device.
export async function deleteAccount(): Promise<void> {
  const response = await fetch('/api/me', json('DELETE', { confirm: true }));
  if (response.status !== 204) throw new Error('Your account could not be deleted just now. Please try again.');
  setSessionHint(false);
}

// For requests that may carry a session. An expired access token (after 15
// minutes away) gets one refresh and one retry. If the session is over, the
// refresh clears its cookies, so the retry goes out signed out — the caller
// is told via `sessionEnded`.
export async function fetchWithSession(url: string, init: RequestInit): Promise<{ response: Response; sessionEnded: boolean }> {
  const response = await fetch(url, init);
  if (response.status !== 401 || !hasSessionHint()) return { response, sessionEnded: false };
  const refreshed = await fetch('/api/auth/refresh', json('POST'));
  const sessionEnded = !refreshed.ok;
  if (sessionEnded) setSessionHint(false);
  return { response: await fetch(url, init), sessionEnded };
}

export interface SyncedProfile<P> {
  profile: P;
  version: number;
}

export async function fetchAccountProfile<P>(): Promise<SyncedProfile<P> | null> {
  const { response } = await fetchWithSession('/api/sync/profile', { method: 'GET' });
  return response.ok ? response.json() : null;
}

// Returns the stored profile: the one just saved, or — if another device saved
// first — the one that is there now.
export async function saveAccountProfile<P>(profile: P, baseVersion: number): Promise<SyncedProfile<P> | null> {
  const { response } = await fetchWithSession('/api/sync/profile', json('PUT', { profile, baseVersion }));
  if (response.ok || response.status === 409) {
    const body = await response.json();
    return { profile: body.profile, version: body.version };
  }
  return null;
}
