import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ChevronDown, Compass } from 'lucide-react';
import { exploreNotFor } from '../../api/_lib/explore';
import type { ExplorePose } from '../../api/_lib/explore';

// The advanced poses Amrita never suggests (G3), as in the apps' Library →
// Explore. Each card opens in place; the profile's conditions mark the ones
// that are not for this person.
export default function ExploreView({ conditions }: { conditions?: string[] }) {
  const [poses, setPoses] = useState<ExplorePose[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/catalog')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { explore?: ExplorePose[] }) => !cancelled && setPoses(body.explore ?? []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-12 space-y-6">
      <div className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[28px] p-7 sm:p-8 shadow-[0_16px_44px_rgba(138,121,165,0.14)] space-y-2.5">
        <span className="inline-flex items-center gap-1.5 p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-bold bg-[#E8E1F2] text-stone-700 uppercase">
          <Compass className="w-3 h-3 text-[#8A79A5]" /> Explore
        </span>
        <h1 className="text-4xl font-serif text-[#2D3436]">Advanced poses</h1>
        <p className="text-[14px] text-stone-600 font-sans leading-relaxed">
          Amrita won't suggest these poses. They are best learned with a teacher. Practise them only if you are experienced, at your own risk, and stop if anything hurts.
        </p>
      </div>

      {failed && <p className="text-center text-[14px] text-stone-500 font-sans">The poses couldn't be loaded just now. Please try again later.</p>}
      {!failed && poses === null && <p className="text-center text-[14px] text-stone-400 font-sans">Loading…</p>}
      {poses?.length === 0 && <p className="text-center text-[14px] text-stone-500 font-sans">No poses to explore yet.</p>}

      {poses && poses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {poses.map((pose) => (
            <ExploreCard
              key={pose.id}
              pose={pose}
              notFor={exploreNotFor(pose, conditions)}
              open={openId === pose.id}
              onToggle={() => setOpenId(openId === pose.id ? null : pose.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExploreCard({ pose, notFor, open, onToggle }: { pose: ExplorePose; notFor: string[]; open: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-white/50 border border-white/30 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md overflow-hidden ${open ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-4 p-5 text-left cursor-pointer">
        <span className="w-12 h-12 flex-shrink-0 rounded-2xl bg-[#E8E1F2]/80 flex items-center justify-center text-2xl" aria-hidden="true">🧘</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-serif text-[#2D3436]">{pose.nameEnglish}</span>
          <span className="block text-[13px] font-sans italic text-[#8A79A5]">{pose.nameSanskrit}</span>
          <span className="block text-[11px] font-mono uppercase tracking-wider text-stone-500 mt-0.5">{pose.bodyFocus}</span>
          {notFor.length > 0 && (
            <span className="inline-block mt-1.5 py-0.5 px-2 rounded-full text-[10.5px] font-mono uppercase tracking-wider font-bold bg-[#FBEDE9] text-[#7E4F41]">Not for you</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-stone-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="px-5 pb-6 space-y-5 border-t border-stone-200/50 pt-5">
              <div className="rounded-2xl bg-[#FBEDE9]/70 border border-[#F2D0C6] p-4 space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs text-[#7E4F41] uppercase font-mono tracking-wider font-bold">
                  <AlertCircle className="w-3.5 h-3.5" /> At your own risk
                </span>
                <p className="text-[13.5px] text-stone-700 font-sans leading-relaxed">
                  Amrita won't suggest this pose. It is best learned with a teacher. Practise it only if you are experienced, and stop if anything hurts.
                </p>
                {notFor.length > 0 ? (
                  <p className="text-[13.5px] text-[#7E4F41] font-sans font-semibold">Not for you: you've said {notFor.join(', ').toLowerCase()}.</p>
                ) : (
                  pose.avoidWith.length > 0 && (
                    <p className="text-[13.5px] text-stone-700 font-sans">Avoid with: {pose.avoidWith.map((c) => c.label).join(', ').toLowerCase()}.</p>
                  )
                )}
                {pose.avoidAfterMeal && <p className="text-[13.5px] text-stone-700 font-sans">Not within 2 hours of a meal.</p>}
              </div>

              <p className="text-[15px] text-stone-700 font-sans leading-relaxed">{pose.benefits}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <BulletList title="Cues" items={pose.cues} />
                <BulletList title="Common mistakes" items={pose.commonMistakes} />
              </div>

              {(pose.modifications || pose.followWith) && (
                <div className="rounded-2xl bg-white/60 border border-white p-4 space-y-1.5">
                  <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Build up to it</span>
                  {pose.modifications && <p className="text-[13.5px] text-stone-800 font-sans leading-relaxed">{pose.modifications}</p>}
                  {pose.followWith && <p className="text-[13.5px] text-stone-800 font-sans">Follow with {pose.followWith}.</p>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">{title}</span>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13.5px] text-stone-700 font-sans leading-relaxed">
            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#8A79A5]/70 flex-shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
