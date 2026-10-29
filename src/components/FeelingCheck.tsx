import React from 'react';
import { X } from 'lucide-react';
import { Feeling } from '../types';

// H11: one optional tap after a practice. Amrita leans away from practices
// that leave them less settled, and toward ones that settle them.
const OPTIONS: { feeling: Feeling; label: string }[] = [
  { feeling: 'more', label: 'More settled' },
  { feeling: 'same', label: 'About the same' },
  { feeling: 'less', label: 'Less settled' },
];

export default function FeelingCheck({
  chosen,
  onChoose,
  onDismiss,
  dark = false,
}: {
  chosen?: Feeling;
  onChoose: (feeling: Feeling) => void;
  onDismiss: () => void;
  dark?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="How do you feel now?"
      className={`relative rounded-2xl border px-4 py-3 ${dark ? 'border-stone-700 bg-stone-800/60' : 'border-stone-200 bg-white/80'}`}
    >
      <button
        onClick={onDismiss}
        className={`absolute top-2 right-2 p-1 rounded-full cursor-pointer ${dark ? 'text-stone-400 hover:text-white' : 'text-stone-400 hover:text-stone-700'}`}
        aria-label="Skip"
        title="Skip"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <p className={`text-sm font-serif pr-6 ${dark ? 'text-stone-200' : 'text-stone-700'}`}>
        {chosen ? 'Thank you. Amrita will keep this in mind.' : 'How do you feel now?'}
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        {OPTIONS.map(({ feeling, label }) => {
          const selected = chosen === feeling;
          return (
            <button
              key={feeling}
              onClick={() => onChoose(feeling)}
              aria-pressed={selected}
              className={`py-1.5 px-3 rounded-full text-xs font-mono uppercase tracking-wider border cursor-pointer transition-colors ${
                selected
                  ? 'bg-[#8A79A5] border-[#8A79A5] text-white'
                  : dark
                    ? 'border-stone-600 text-stone-200 hover:bg-stone-700'
                    : 'border-stone-200 text-stone-700 bg-white hover:bg-stone-50'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
