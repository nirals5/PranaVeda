import React, { ReactNode, useState } from 'react';
import { Mic } from 'lucide-react';
import { answerAlexaLink } from '../lib/auth';

const actionButton =
  'py-2.5 px-5 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default';

const FIELDS = ['response_type', 'client_id', 'redirect_uri', 'state', 'scope'] as const;

interface Props {
  auth: { status: 'guest' | 'checking' | 'user'; user: { displayName?: string | null } | null };
  search: string;
  go: (url: string) => void;
  signIn?: ReactNode;
}

// /link/alexa: the Alexa app opens it (through /api/oauth/authorize) to link
// a PranaVeda account to the skill. The answer goes back to Amazon.
export default function AlexaLinkPage({ auth, search, go, signIn }: Props) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const params = new URLSearchParams(search);
  const request = Object.fromEntries(FIELDS.map((f) => [f, params.get(f) ?? ''])) as Record<string, string>;

  const answer = async (decision: 'allow' | 'deny') => {
    setPending(true);
    setFailed(false);
    const redirect = await answerAlexaLink(request, decision).catch(() => null);
    if (redirect) return go(redirect);
    setPending(false);
    setFailed(true);
  };

  return (
    <main className="min-h-screen bg-[#F4F1EC] flex items-center justify-center px-4 py-10">
      <section
        aria-label="Link Alexa"
        className="w-full max-w-lg bg-white/60 border border-white/40 p-6 sm:p-8 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
      >
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-[#8A79A5]" />
          <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Alexa</span>
        </div>
        <h1 className="text-2xl font-serif text-[#2D3436] mt-2">Link PranaVeda to Alexa</h1>

        {auth.status === 'checking' ? (
          <p className="text-[14px] text-stone-600 font-sans mt-3">One moment…</p>
        ) : auth.status !== 'user' ? (
          <div className="mt-3 space-y-4">
            <p className="text-[14px] text-stone-600 font-sans leading-relaxed">Sign in to link your PranaVeda account to Alexa.</p>
            {signIn}
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-[14px] text-stone-600 font-sans leading-relaxed">
              When you open PranaVeda on Alexa, Amrita will greet you with your first name, your open time and when you last
              practised. Alexa can also let you know when free time opens, if you allow notifications in the Alexa app.
            </p>
            <p className="text-[13.5px] text-stone-500 font-sans leading-relaxed">
              A speaker can be heard by anyone in the room, so Alexa never says your events, your profile or anything about
              your health. You can unlink at any time from your profile or the Alexa app.
            </p>
            {auth.user?.displayName && (
              <p className="text-[13.5px] text-stone-600 font-sans">Signed in as {auth.user.displayName}.</p>
            )}
            {failed && (
              <p role="alert" className="text-[13px] text-[#B4443A] font-sans">
                This link request could not be used. Please start again from the Alexa app.
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={pending} onClick={() => answer('allow')} className={`${actionButton} bg-[#8A79A5] hover:bg-[#72618F] text-white`}>
                {pending ? 'One moment…' : 'Allow'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => answer('deny')}
                className={`${actionButton} text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70`}
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
