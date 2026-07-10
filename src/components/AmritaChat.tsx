import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Mic, ArrowRight, Sparkles, RotateCcw, Wind, Play, Clock, Volume2, VolumeX } from 'lucide-react';
import { ChatItem, ChatCard, RecommendationResult, BreathworkPattern } from '../types';
import pranavedaIcon from '../assets/pranaveda_icon.svg';

interface AmritaChatProps {
  items: ChatItem[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onOpenRitual: (result: RecommendationResult) => void;
  onOpenVoice: () => void;
  onReset: () => void;
  voiceMuted: boolean;
  onToggleVoiceMuted: () => void;
}

const markdownComponents = {
  p: (props: any) => <p className="mb-2.5 last:mb-0 leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="font-semibold text-stone-900" {...props} />,
  em: (props: any) => <em className="italic" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
};

// TODO(Niral): design a dedicated Amrita mark — something fluid, animated
// while she speaks. Until then, the PranaVeda brand icon stands in.
function AmritaMark() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-white via-[#FBEDE9] to-[#E8E1F2] border border-white shadow-sm flex items-center justify-center flex-shrink-0">
      <img src={pranavedaIcon} alt="Amrita" className="w-5 h-auto" />
    </div>
  );
}

function RitualCard({ result, onOpen }: { result: RecommendationResult; onOpen: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[24px] p-5 shadow-[0_12px_36px_rgba(138,121,165,0.14)] space-y-4 max-w-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-bold bg-[#E8E1F2] text-stone-700 uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-[#8A79A5]" /> {result.primaryEnergy}
        </span>
        <span className="flex items-center gap-1 text-[11px] font-mono text-stone-500 uppercase tracking-wider">
          <Clock className="w-3 h-3" /> {result.yogaPractice.durationMinutes} min
        </span>
      </div>

      <div>
        <h4 className="font-serif text-lg text-stone-900 leading-snug">{result.yogaPractice.title}</h4>
        <p className="text-[13px] text-stone-600 font-sans mt-1 leading-relaxed">{result.yogaPractice.description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {result.yogaPractice.poses.map((pose) => (
          <span
            key={pose.nameEnglish}
            className="py-1 px-3 rounded-full bg-white/70 border border-white text-[12px] text-stone-700 font-sans"
          >
            {pose.nameEnglish} · {pose.duration.replace(' minutes', 'm').replace(' minute', 'm')}
          </span>
        ))}
        <span className="py-1 px-3 rounded-full bg-[#DFE8FA]/60 border border-white text-[12px] text-stone-700 font-sans flex items-center gap-1">
          <Wind className="w-3 h-3 text-[#8A79A5]" /> {result.breathwork.name}
        </span>
      </div>

      <button
        onClick={onOpen}
        className="w-full py-2.5 bg-[#8A79A5] hover:bg-[#72618F] text-white text-[11px] uppercase tracking-widest font-mono font-bold rounded-xl shadow-[0_8px_20px_rgba(138,121,165,0.3)] transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:translate-y-[-1px]"
      >
        <Play className="w-3.5 h-3.5" /> Begin practice
      </button>
    </motion.div>
  );
}

function BreathworkCard({ pattern, note }: { pattern: BreathworkPattern; note?: string }) {
  const phases = [
    { label: 'Inhale', value: pattern.inhale },
    { label: 'Hold', value: pattern.holdActive },
    { label: 'Exhale', value: pattern.exhale },
    { label: 'Rest', value: pattern.holdEmpty },
  ].filter((p) => p.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[24px] p-5 shadow-[0_12px_36px_rgba(138,121,165,0.14)] space-y-4 max-w-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-bold bg-[#DFE8FA]/80 text-stone-700 uppercase flex items-center gap-1.5">
          <Wind className="w-3 h-3 text-[#8A79A5]" /> Breathwork
        </span>
        <span className="text-[11px] font-mono text-stone-500 uppercase tracking-wider">{pattern.cycles} cycles</span>
      </div>

      <div>
        <h4 className="font-serif text-lg text-stone-900 leading-snug">
          {pattern.name} <span className="text-stone-500 italic text-base">· {pattern.sanskritName}</span>
        </h4>
        {note && <p className="text-[13px] text-stone-600 font-serif italic mt-1 leading-relaxed">"{note}"</p>}
      </div>

      <div className="flex items-center gap-2">
        {phases.map((phase) => (
          <div key={phase.label} className="flex-1 bg-white/70 border border-white rounded-2xl py-2.5 text-center">
            <div className="text-xl font-serif text-[#8A79A5]">{phase.value}</div>
            <div className="text-[12px] font-mono uppercase tracking-wider text-stone-500">{phase.label}</div>
          </div>
        ))}
      </div>

      <p className="text-[12.5px] text-stone-600 font-sans leading-relaxed">{pattern.benefits}</p>
    </motion.div>
  );
}

function CardBlock({ card, onOpenRitual }: { card: ChatCard; onOpenRitual: (r: RecommendationResult) => void }) {
  if (card.kind === 'ritual') return <RitualCard result={card.result} onOpen={() => onOpenRitual(card.result)} />;
  return <BreathworkCard pattern={card.pattern} note={card.note} />;
}

export default function AmritaChat({ items, isStreaming, onSend, onOpenRitual, onOpenVoice, onReset, voiceMuted, onToggleVoiceMuted }: AmritaChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const submit = () => {
    if (!draft.trim() || isStreaming) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-5 sm:px-6 flex flex-col h-[calc(100dvh-210px)] min-h-[420px]">
      {/* Thread header */}
      <div className="flex items-center justify-between pb-3">
        <span className="p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-semibold bg-[#E8E1F2]/70 text-stone-600 uppercase flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-[#8A79A5]" /> In conversation with Amrita
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleVoiceMuted}
            title={voiceMuted ? 'Voice replies are off — click to unmute Amrita' : 'Voice replies are on for spoken messages — click to mute'}
            aria-label={voiceMuted ? 'Unmute voice replies' : 'Mute voice replies'}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[11px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800 hover:bg-white/60 border border-transparent hover:border-white/80 transition-all cursor-pointer"
          >
            {voiceMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3 text-[#8A79A5]" />}
          </button>
          <button
            onClick={onReset}
            title="Begin a new conversation (your wellness profile is kept)"
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[11px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800 hover:bg-white/60 border border-transparent hover:border-white/80 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> New
          </button>
        </div>
      </div>

      {/* Message thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pb-4 pr-1 [scrollbar-width:thin]">
        {items.map((item) =>
          item.role === 'user' ? (
            <div key={item.id} className="flex justify-end">
              <div className="bg-[#8A79A5]/90 text-white rounded-[22px] rounded-br-md py-2.5 px-4.5 max-w-[85%] sm:max-w-[70%] text-[15px] font-sans leading-relaxed shadow-[0_8px_20px_rgba(138,121,165,0.2)]">
                {item.text}
              </div>
            </div>
          ) : (
            <div key={item.id} className="flex gap-3 items-start">
              <AmritaMark />
              <div className="space-y-3 max-w-[88%] sm:max-w-[78%] min-w-0 pt-0.5">
                {item.text ? (
                  <div className={`text-[15px] font-sans leading-relaxed ${item.error ? 'text-[#865959]' : 'text-stone-800'}`}>
                    <ReactMarkdown components={markdownComponents}>{item.text}</ReactMarkdown>
                  </div>
                ) : item.streaming ? (
                  <div className="flex items-center gap-2 text-[13px] font-serif italic text-stone-500 py-1">
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      Amrita is reflecting…
                    </motion.span>
                  </div>
                ) : null}
                {item.cards.map((card, i) => (
                  <CardBlock key={i} card={card} onOpenRitual={onOpenRitual} />
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {/* Composer */}
      <div className="pt-3 pb-1">
        <div className="relative flex items-center bg-white/60 backdrop-blur-[20px] rounded-[32px] border border-white/80 p-2.5 px-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] focus-within:border-[#8A79A5]/40 focus-within:shadow-[0_12px_36px_rgba(138,121,165,0.2)] transition-all duration-300">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={isStreaming ? 'Amrita is speaking…' : 'Continue the conversation…'}
            aria-label="Message Amrita"
            className="w-full min-w-0 bg-transparent border-none text-[#2D3436] placeholder-[#2D3436]/30 font-sans text-[15px] focus-visible:outline-none focus-visible:ring-0 mr-3 py-1"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onOpenVoice}
              aria-label="Speak to Amrita"
              title="Speak to Amrita"
              className="p-2.5 rounded-full bg-white border border-black/5 hover:bg-[#E8E1F2] text-stone-600 cursor-pointer shadow-sm transition-all"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={submit}
              disabled={isStreaming || !draft.trim()}
              aria-label="Send message"
              className="p-2.5 rounded-full bg-[#2D3436] border border-stone-800 text-white hover:bg-stone-700 transition-all cursor-pointer shadow-sm disabled:opacity-35 disabled:cursor-default flex items-center justify-center"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
