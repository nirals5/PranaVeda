import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { BusyInterval, describeOpenSlot, findOpenSlot } from '../hooks/useExternalCalendar';

const DISMISSED_KEY = 'pranaveda_nudge_dismissed';

interface FreeTimeNudgeProps {
  busy: BusyInterval[];
  now: number;
  // When the user last finished a practice (epoch ms), if ever.
  lastPracticeAt: number | null;
  onAccept: (message: string) => void;
}

// Amrita's in-app nudge. It appears ONLY in an open calendar slot (see
// findOpenSlot), and not again once dismissed for the same opening.
export default function FreeTimeNudge({ busy, now, lastPracticeAt, onAccept }: FreeTimeNudgeProps) {
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  });

  const slot = findOpenSlot(busy, now, lastPracticeAt);
  if (!slot || dismissed === slot.key) return null;
  const slotKey = slot.key;
  const freeMinutes = slot.minutes;

  const dismiss = () => {
    setDismissed(slotKey);
    try {
      sessionStorage.setItem(DISMISSED_KEY, slotKey);
    } catch {}
  };

  return (
    <div
      role="status"
      className="w-full max-w-2xl mx-auto mb-6 flex items-center gap-3 bg-white/40 border border-white/60 rounded-full py-2 pl-5 pr-2 backdrop-blur-sm"
    >
      <p className="flex-1 min-w-0 text-[14px] font-sans text-[#2D3436] leading-snug">
        {describeOpenSlot(slot)}
      </p>
      <button
        type="button"
        onClick={() => {
          dismiss();
          onAccept(
            freeMinutes !== null
              ? `I have about ${freeMinutes} free minutes right now. What would you suggest?`
              : 'I have some open time right now. What would you suggest?'
          );
        }}
        className="flex-shrink-0 flex items-center gap-1.5 py-2 px-4 bg-[#8A79A5] hover:bg-[#72618F] text-white text-[11px] uppercase tracking-wider font-mono font-bold rounded-full transition-all cursor-pointer"
      >
        Practice now <ArrowRight className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss suggestion"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-900 hover:bg-white/70 transition-all cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
