import React from 'react';
import { MapPin } from 'lucide-react';
import { PLACE_KINDS, PLACE_LABEL, Place } from '../hooks/usePlace';

const actionButton =
  'flex-shrink-0 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default';
const primaryAction = `${actionButton} bg-[#8A79A5] hover:bg-[#72618F] text-white`;
const quietAction = `${actionButton} text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70`;

// Turn location on, then mark the spots that matter. Amrita learns only the
// kind of place (home, work, …) — the copy says so, because that is the promise.
export default function LocationSettings({ place }: { place: Place }) {
  const saved = new Set(place.places.map((p) => p.kind));

  const status = !place.supported
    ? 'This browser cannot share location.'
    : place.blocked
      ? 'Location is blocked for this site. Allow it in your browser’s site settings, then turn this on.'
      : !place.enabled
        ? 'Off. Amrita does not know where you are.'
        : !place.located
          ? 'Finding where you are…'
          : place.imprecise
            ? 'Your device can only give a rough area right now, too vague to tell your places apart.'
            : place.current
              ? `Right now: ${PLACE_LABEL[place.current]}.`
              : 'Located. Save the spot you are in below so Amrita can recognise it.';

  return (
    <section
      aria-label="Location"
      className="bg-white/50 border border-white/30 p-6 sm:p-8 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-[#8A79A5]" />
        <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Location</span>
      </div>
      <h2 className="text-2xl font-serif text-[#2D3436] mt-2">A practice that fits where you are</h2>
      <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed mt-2 max-w-2xl">
        While PranaVeda is open, it checks where you are against spots you save here. Amrita is told only the kind of
        place, such as home or work. Your coordinates stay on this device and no history is kept.
      </p>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <p aria-live="polite" className="flex-1 min-w-0 text-[15px] font-serif italic text-stone-700 leading-relaxed">
          {status}
        </p>
        {place.supported && !place.blocked && (
          <button
            type="button"
            onClick={place.enabled ? place.disable : place.enable}
            aria-pressed={place.enabled}
            className={place.enabled ? quietAction : primaryAction}
          >
            {place.enabled ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>

      {place.enabled && (
        <ul className="mt-5 divide-y divide-stone-200/50">
          {PLACE_KINDS.map((kind) => (
            <li key={kind} className="py-4 first:pt-0 last:pb-0 flex items-center gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-serif text-[#2D3436] leading-snug">{PLACE_LABEL[kind]}</p>
                <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
                  {saved.has(kind) ? (place.current === kind ? 'Saved. You are here now.' : 'Saved.') : 'Not saved yet.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => place.savePlace(kind)}
                disabled={!place.located || place.imprecise}
                aria-label={`${saved.has(kind) ? 'Move' : 'Save'} ${PLACE_LABEL[kind]} to where I am now`}
                className={saved.has(kind) ? quietAction : primaryAction}
              >
                {saved.has(kind) ? 'Move here' : 'I am here'}
              </button>
              {saved.has(kind) && (
                <button type="button" onClick={() => place.removePlace(kind)} aria-label={`Remove ${PLACE_LABEL[kind]}`} className={quietAction}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
