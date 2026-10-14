import React, { useEffect, useRef, useState } from 'react';
import { APPLE_SERVICES_ID, SignInRequest, fetchNonce } from '../lib/auth';

const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
// Matches GoogleSignIn: a nonce is good for ten minutes, so re-arm before then.
const REARM_MS = 8 * 60 * 1000;

let appleLoading: Promise<void> | null = null;
function loadAppleId(): Promise<void> {
  if ((window as any).AppleID?.auth) return Promise.resolve();
  appleLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = APPLE_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      appleLoading = null;
      reject(new Error('Sign in with Apple could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return appleLoading;
}

const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// "Continue with Apple", drawn to Apple's button guidelines (white, black
// outline, Apple logo, system font) at the same size as Google's button.
// Apple's sign-in runs in a popup and hands the result straight back to this
// page, so nothing is posted to the redirect address.
export default function AppleSignIn({ signIn }: { signIn: (request: SignInRequest) => Promise<void> }) {
  const ready = useRef<{ nonce: string; state: string } | null>(null);
  const [armed, setArmed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The popup must open in the click itself or browsers block it, so the
  // nonce is fetched and Apple's script initialised ahead of time.
  useEffect(() => {
    let cancelled = false;
    ready.current = null;
    (async () => {
      try {
        const [nonce] = await Promise.all([fetchNonce(), loadAppleId()]);
        if (cancelled) return;
        const state = randomState();
        (window as any).AppleID.auth.init({
          clientId: APPLE_SERVICES_ID,
          scope: 'name email',
          redirectURI: `${window.location.origin}/api/auth/apple/callback`,
          state,
          nonce,
          usePopup: true,
        });
        ready.current = { nonce, state };
      } catch {
        if (!cancelled) setMessage('Sign in with Apple is not available right now.');
      }
    })();
    const timer = window.setTimeout(() => setArmed((n) => n + 1), REARM_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [armed]);

  const start = async () => {
    const attempt = ready.current;
    if (!attempt || busy) return;
    setMessage(null);
    setBusy(true);
    try {
      const result = await (window as any).AppleID.auth.signIn();
      const { code, id_token: idToken, state } = result?.authorization ?? {};
      if (!idToken || state !== attempt.state) throw new Error('Sign-in did not complete. Please try again.');
      await signIn({ provider: 'apple', idToken, code, nonce: attempt.nonce, name: result.user?.name });
    } catch (err: any) {
      // Closing Apple's window is a choice, not an error.
      if (err?.error !== 'popup_closed_by_user' && err?.error !== 'user_cancelled_authorize') {
        setMessage(err instanceof Error ? err.message : 'Sign-in did not complete. Please try again.');
      }
      setArmed((n) => n + 1); // a nonce is single-attempt: arm a fresh one
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-[280px] max-w-full h-10 flex items-center justify-center gap-2 rounded-full bg-white border border-black text-black text-[15px] font-medium cursor-pointer disabled:opacity-60 disabled:cursor-default"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif' }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-[18px] h-[18px] -mt-0.5" fill="currentColor">
          <path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" />
        </svg>
        Continue with Apple
      </button>
      {message && (
        <p role="status" className="text-[13.5px] text-stone-700 font-sans">
          {message}
        </p>
      )}
    </>
  );
}
