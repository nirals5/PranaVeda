import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '../hooks/googleAuth';
import { fetchNonce } from '../lib/auth';

// A sign-in nonce is good for ten minutes; the button is re-armed before then
// so a page left open still signs in on the first click.
const REARM_MS = 8 * 60 * 1000;

// Google's own "Continue with Google" button. Google renders it, so its look
// is theirs; everything around it is ours.
export default function GoogleSignIn({ signIn }: { signIn: (credential: string, nonce: string) => Promise<void> }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nonce] = await Promise.all([fetchNonce(), loadGoogleIdentity()]);
        if (cancelled || !buttonRef.current) return;
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce,
          callback: ({ credential }: { credential?: string }) => {
            if (!credential) return;
            setMessage(null);
            signIn(credential, nonce).catch((err: Error) => {
              setMessage(err.message);
              setArmed((n) => n + 1); // a nonce is single-attempt: arm a fresh one
            });
          },
        });
        buttonRef.current.replaceChildren();
        google.accounts.id.renderButton(buttonRef.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
      } catch {
        if (!cancelled) setMessage('Sign-in is not available right now.');
      }
    })();
    const timer = window.setTimeout(() => setArmed((n) => n + 1), REARM_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [armed, signIn]);

  return (
    <>
      <div ref={buttonRef} className="min-h-[44px]" />
      {message && (
        <p role="status" className="text-[13.5px] text-stone-700 font-sans">
          {message}
        </p>
      )}
    </>
  );
}
