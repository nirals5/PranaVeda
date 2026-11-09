import React from 'react';
import AlexaLinkPage from './AlexaLinkPage';
import AppleSignIn from './AppleSignIn';
import GoogleSignIn from './GoogleSignIn';
import { useAuth } from '../hooks/useAuth';
import { APPLE_SERVICES_ID } from '../lib/auth';

// /link/alexa, on its own: no app screens behind it, only sign-in and the question.
export default function AlexaLinkRoute() {
  const auth = useAuth();
  return (
    <AlexaLinkPage
      auth={auth}
      search={window.location.search}
      go={(url) => window.location.assign(url)}
      signIn={
        <div className="flex flex-col gap-2 items-start">
          <GoogleSignIn signIn={auth.signIn} />
          {APPLE_SERVICES_ID && <AppleSignIn signIn={auth.signIn} />}
        </div>
      }
    />
  );
}
