import { GOOGLE_CLIENT_ID } from '../hooks/googleAuth';

// Accounts are optional and off by default: the app is fully usable signed
// out. Sign-in appears only where VITE_ACCOUNTS_ENABLED is "true" and a Google
// client id is configured.
export const ACCOUNTS_ENABLED = import.meta.env.VITE_ACCOUNTS_ENABLED === 'true' && !!GOOGLE_CLIENT_ID;

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

export async function signInWithGoogle(credential: string, nonce: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/google', json('POST', { credential, nonce, client: 'web' }));
  const user = await userFrom(response);
  if (!user) {
    const code = response.ok ? '' : (await response.json().catch(() => ({}))).error;
    throw new Error(code === 'nonce_expired' ? 'That took a little long. Please try again.' : 'Sign-in did not complete. Please try again.');
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
