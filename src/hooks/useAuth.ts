import { useCallback, useEffect, useState } from 'react';
import { ACCOUNTS_ENABLED, AuthUser, SignInRequest, hasSessionHint, restoreSession, saveTimezone, signIn as startSession, signOut as endSession } from '../lib/auth';

export type AuthStatus = 'guest' | 'checking' | 'user';

// The device's own zone, so nudges can later be timed to the user's day.
function syncTimezone(user: AuthUser, onChange: (user: AuthUser) => void) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || user.timezone === zone) return;
  saveTimezone(zone)
    .then((updated) => updated && onChange(updated))
    .catch(() => {});
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (ACCOUNTS_ENABLED && hasSessionHint() ? 'checking' : 'guest'));

  useEffect(() => {
    if (status !== 'checking') return;
    let cancelled = false;
    restoreSession()
      .catch(() => null)
      .then((restored) => {
        if (cancelled) return;
        setUser(restored);
        setStatus(restored ? 'user' : 'guest');
        if (restored) syncTimezone(restored, setUser);
      });
    return () => {
      cancelled = true;
    };
    // Runs once: `status` only starts as 'checking'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (request: SignInRequest) => {
    const signedIn = await startSession(request);
    setUser(signedIn);
    setStatus('user');
    syncTimezone(signedIn, setUser);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setStatus('guest');
    await endSession();
  }, []);

  return { status, user, signIn, signOut };
}

export type Auth = ReturnType<typeof useAuth>;
