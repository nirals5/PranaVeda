import React, { useState } from 'react';
import { Clock, Play, Video } from 'lucide-react';
import { FLOW_GROUPS, flows } from '../../api/_lib/flows';
import type { Flow } from '../../api/_lib/flows';

// The follow-along video flows, grouped as in the apps' Library → Flows. A
// card turns into its player in place; one plays at a time.
export default function FlowsView() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-12 space-y-6">
      <div className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[28px] p-7 sm:p-8 shadow-[0_16px_44px_rgba(138,121,165,0.14)] space-y-2.5">
        <span className="inline-flex items-center gap-1.5 p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-bold bg-[#E8E1F2] text-stone-700 uppercase">
          <Video className="w-3 h-3 text-[#8A79A5]" /> Flows
        </span>
        <h1 className="text-4xl font-serif text-[#2D3436]">Follow-along flows</h1>
        <p className="text-[14px] text-stone-600 font-sans leading-relaxed">
          Short guided sequences to practise along with. Move within what feels comfortable, and stop if anything hurts.
        </p>
      </div>

      {FLOW_GROUPS.map((group) => {
        const inGroup = flows.filter((f) => f.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-stone-500 px-1">{group}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {inGroup.map((flow) => (
                <FlowCard key={flow.id} flow={flow} playing={playingId === flow.id} onPlay={() => setPlayingId(flow.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FlowCard({ flow, playing, onPlay }: { flow: Flow; playing: boolean; onPlay: () => void }) {
  return (
    <div className={`bg-white/50 border border-white/30 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md overflow-hidden ${playing ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      {playing ? (
        <video src={flow.videoUrl} poster={flow.coverUrl} controls autoPlay playsInline className="w-full aspect-video bg-black" />
      ) : (
        <button onClick={onPlay} aria-label={`Play ${flow.title}`} className="relative block w-full aspect-video cursor-pointer group">
          <img src={flow.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
            <span className="w-12 h-12 rounded-full bg-white/85 flex items-center justify-center shadow">
              <Play className="w-5 h-5 text-[#8A79A5] ml-0.5" fill="currentColor" />
            </span>
          </span>
        </button>
      )}
      <div className="px-5 py-3.5">
        <span className="block text-[17px] font-serif text-[#2D3436]">{flow.title}</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-stone-500 mt-0.5">
          <Clock className="w-3 h-3" /> {flow.minutes} min
        </span>
      </div>
    </div>
  );
}
