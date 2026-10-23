import React from 'react';
import { TriangleAlert } from 'lucide-react';

// G13: how to adapt a practice for one of the user's conditions ("High blood
// pressure: keep arms down."). The server adds it to a card only when it applies.
export default function CautionNote({ text, dark = false, label }: { text?: string; dark?: boolean; label?: string }) {
  if (!text) return null;
  return (
    <p
      className={`flex items-start gap-1.5 text-[12.5px] leading-snug font-sans ${dark ? 'text-amber-200' : 'text-[#9A5B2E]'}`}
      role="note"
    >
      <TriangleAlert className="w-3.5 h-3.5 mt-[1px] shrink-0" aria-label="Caution" />
      <span>
        {label && <span className="font-semibold">{label}: </span>}
        {text}
      </span>
    </p>
  );
}

// Said in guided practice before the instructions.
export function cautionSpeech(text?: string): string {
  return text ? `Take care. ${text} <break time="0.8s" /> ` : '';
}
