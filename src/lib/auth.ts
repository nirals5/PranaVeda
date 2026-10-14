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
