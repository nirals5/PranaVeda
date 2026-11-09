import React, { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import type { AlexaLink } from '../hooks/useAlexaLink';

type Alexa = { url: string; phrases: string[] };

// The Smart assistants card. On the website it is Alexa's alone (Siri and the
// phone shortcuts live in the apps), so it appears once the skill is
// published (GET /api/assistants, no release needed) or linked to the account.
export default function AssistantsSettings({ alexaLink }: { alexaLink?: AlexaLink }) {
  const [alexa, setAlexa] = useState<Alexa | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/assistants')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (live && body?.alexa) setAlexa(body.alexa); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const linked = !!alexaLink?.linked;
  if (!alexa && !linked) return null;

  return (
    <section
      aria-label="Smart assistants"
      className="bg-white/50 border border-white/30 p-6 sm:p-8 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 text-[#8A79A5]" />
        <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Smart assistants</span>
      </div>
      <h2 className="text-2xl font-serif text-[#2D3436] mt-2">Practise without opening the app</h2>
      <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed mt-2 max-w-2xl">
        Ask Alexa for today&rsquo;s reflection, a short breathing practice or a daily reminder. On a phone, the
        PranaVeda app also works with Siri and the home screen.
      </p>
      <div className="mt-5 space-y-3">
        <p className="text-sm font-semibold text-[#2D3436]">Alexa</p>
        {linked && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 text-[13.5px] text-stone-600 font-sans leading-relaxed">
              Linked to this account. Amrita greets you by name with your open time and practice.{' '}
              {alexaLink!.notifications
                ? 'Notifications are on: Alexa lets you know when free time opens.'
                : 'Allow notifications for PranaVeda in the Alexa app to hear when free time opens.'}
            </p>
            <button
              type="button"
              onClick={() => alexaLink!.unlink()}
              disabled={alexaLink!.pending}
              className="flex-shrink-0 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70 transition-all cursor-pointer disabled:opacity-60"
            >
              {alexaLink!.pending ? 'One moment…' : 'Unlink'}
            </button>
          </div>
        )}
        {alexa && (
          <ul className="space-y-1" aria-label="Say to Alexa">
            {alexa.phrases.map((phrase) => (
              <li key={phrase} className="text-[14px] italic font-serif text-stone-600">&ldquo;{phrase}&rdquo;</li>
            ))}
          </ul>
        )}
        {alexa && !linked && (
        <a
          href={alexa.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70 transition-all"
        >
          Enable in the Alexa app
        </a>
        )}
      </div>
    </section>
  );
}
