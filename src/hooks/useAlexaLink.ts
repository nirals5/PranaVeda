import { useCallback, useEffect, useState } from 'react';
import { Auth } from './useAuth';
import { fetchAlexaLink, unlinkAlexaAccount } from '../lib/auth';

export interface AlexaLink {
  linked: boolean;
  notifications: boolean;
  pending: boolean;
  unlink: () => Promise<boolean>;
}

// Whether the Alexa skill is linked to the signed-in account. Linked, the
// website keeps the account told of busy times (as for push), so Alexa can
// say the person's open time.
export function useAlexaLink(auth: Auth): AlexaLink {
  const signedIn = auth.status === 'user';
  const [status, setStatus] = useState({ linked: false, notifications: false });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setStatus({ linked: false, notifications: false });
      return;
    }
    let live = true;
    fetchAlexaLink()
      .then((s) => live && s && setStatus(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn]);

  const unlink = useCallback(async () => {
    setPending(true);
    const ok = await unlinkAlexaAccount().catch(() => false);
    if (ok) setStatus({ linked: false, notifications: false });
    setPending(false);
    return ok;
  }, []);

  return { ...status, pending, unlink };
}
