import React, { useState } from 'react';
import { describeOffer, ProfileOffer } from '../lib/profileOffer';

interface ProfileOfferBarProps {
  offer: ProfileOffer;
  onAdd: () => Promise<boolean>;
  onDismiss: () => void;
}

// Details this device has that the account doesn't (see profileOffer). They
// stay out of sight until Review, then open in place.
export default function ProfileOfferBar({ offer, onAdd, onDismiss }: ProfileOfferBarProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const add = async () => {
    setSaving(true);
    setFailed(false);
    const added = await onAdd();
    setSaving(false);
    setFailed(!added);
  };

  return (
    <div role="status" className="w-full max-w-2xl mx-auto mb-6 bg-white/40 border border-white/60 rounded-3xl py-2 pl-5 pr-2 backdrop-blur-sm text-left">
      <div className="flex items-center gap-3">
        <p className="flex-1 min-w-0 text-[14px] font-sans text-[#2D3436] leading-snug">{describeOffer(offer)}</p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-shrink-0 py-2 px-4 bg-[#8A79A5] hover:bg-[#72618F] text-white text-[11px] uppercase tracking-wider font-mono font-bold rounded-full transition-all cursor-pointer"
          >
            Review
          </button>
        )}
      </div>
      {open && (
        <div className="pr-3 pb-2 pt-2 space-y-3">
          <ul className="list-disc pl-5 text-[14px] font-sans text-[#2D3436] leading-snug space-y-1">
            {offer.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {failed && <p className="text-[13px] font-sans text-[#A5655B]">That couldn't be saved. Please try again.</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={add}
              disabled={saving}
              className="py-2 px-4 bg-[#8A79A5] hover:bg-[#72618F] disabled:opacity-50 text-white text-[11px] uppercase tracking-wider font-mono font-bold rounded-full transition-all cursor-pointer"
            >
              Add to my account
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={saving}
              className="py-2 px-4 border border-stone-300 hover:bg-white/70 disabled:opacity-50 text-stone-700 text-[11px] uppercase tracking-wider font-mono font-bold rounded-full transition-all cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
