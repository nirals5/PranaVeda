import React from 'react';
import { Leaf } from 'lucide-react';
import { Principle } from '../types';

// G12: the principle a card's practice rests on, from the Practice Library's
// Principles tab. The server adds it only when Amrita cited one that exists.
export default function PrincipleNote({ principle }: { principle?: Principle }) {
  if (!principle) return null;
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] leading-snug font-sans text-stone-500">
      <Leaf className="w-3.5 h-3.5 mt-[1px] shrink-0 text-[#8A79A5]" aria-hidden="true" />
      <span>
        <span className="font-semibold text-stone-600">Rooted in: </span>
        {principle.statement}
      </span>
    </p>
  );
}
