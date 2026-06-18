import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Compass, Sparkles, BookOpen, Trash2, ArrowRight, Play, HeartHandshake, Wind } from 'lucide-react';
import { SavedPractice } from '../types';

interface WellnessInsightProps {
  savedPractices: SavedPractice[];
  onSelectPractice: (practice: SavedPractice) => void;
  onDeletePractice: (id: string, e: React.MouseEvent) => void;
  onSelectSuggestion: (text: string) => void;
}

export default function WellnessInsight({
  savedPractices,
  onSelectPractice,
  onDeletePractice,
  onSelectSuggestion,
}: WellnessInsightProps) {
  const prefersReducedMotion = useReducedMotion();
  const [insight, setInsight] = useState<{
    headline: string;
    quote: string;
    focus: string;
    practice: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Live Breathing Guide pace state for Card 3
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Sustain'>('Inhale');
  const [breathDuration, setBreathDuration] = useState(4);

  useEffect(() => {
    async function fetchInsight() {
      setLoading(true);
      try {
        const response = await fetch('/api/insight');
        if (response.ok) {
          const data = await response.json();
          setInsight(data);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Error loading insight:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchInsight();
  }, []);

  // Breath pacing timer
  useEffect(() => {
    const timer = setInterval(() => {
      setBreathDuration((prev) => {
        if (prev <= 1) {
          if (breathPhase === 'Inhale') {
            setBreathPhase('Hold');
            return 4;
          } else if (breathPhase === 'Hold') {
            setBreathPhase('Exhale');
            return 4;
          } else if (breathPhase === 'Exhale') {
            setBreathPhase('Sustain');
            return 2;
          } else {
            setBreathPhase('Inhale');
            return 4;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [breathPhase]);

  // Assist circle scale & colors for breath visualizer
  const getBreathCircleScale = () => {
    if (breathPhase === 'Inhale') return 1.4;
    if (breathPhase === 'Hold') return 1.4;
    if (breathPhase === 'Exhale') return 1.0;
    return 1.0;
  };

  const getBreathPhaseColor = () => {
    if (breathPhase === 'Inhale') return 'bg-[#DDF5EE]/80 border-[#A2E6D4] text-[#2D5A4E]';
    if (breathPhase === 'Hold') return 'bg-[#E8E1F2]/80 border-[#CEBFEC] text-[#554375]';
    if (breathPhase === 'Exhale') return 'bg-[#FBEDE9]/80 border-[#F2D0C6] text-[#7E4F41]';
    return 'bg-[#DFE8FA]/80 border-[#B7CFFB] text-[#3B5B95]';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mt-10 sm:mt-14 px-5 sm:px-6 pb-12 z-10 relative">
      
      {/* CARD 1: Today's Wellness Insight */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white/50 border border-white/30 p-6 rounded-[24px] flex flex-col justify-between gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-stone-500/70 uppercase font-mono tracking-wider font-bold">
              Daily Insight
            </span>
            <Compass className="w-4 h-4 text-stone-500" />
          </div>
          
          <AnimatePresence mode="wait">
            {loading ? (
              <div className="space-y-3 py-4">
                <div className="h-4 bg-stone-200/60 w-3/4 rounded animate-pulse" />
                <div className="h-3 bg-stone-200/60 w-5/6 rounded animate-pulse" />
                <div className="h-3 bg-stone-200/60 w-2/3 rounded animate-pulse" />
              </div>
            ) : error || !insight ? (
              <div className="space-y-3">
                <h4 className="text-lg text-stone-900 font-sans leading-snug font-medium">
                  Vata season transitions
                </h4>
                <p className="text-sm text-stone-600 italic font-serif leading-relaxed">
                  "Prana is the bridge between the body and mind. Let your breath serve as the anchor of absolute consciousness."
                </p>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3.5"
              >
                <h4 className="text-lg text-stone-900 font-sans leading-snug font-semibold">
                  {insight.headline}
                </h4>
                <p className="text-sm text-stone-600 leading-relaxed font-serif italic">
                  "{insight.quote}"
                </p>
                <div className="pt-3 border-t border-stone-200/50 mt-2">
                  <div className="text-xs font-mono tracking-widest text-[#8A79A5] uppercase font-bold">
                    FOCUS: {insight.focus}
                  </div>
                  <p className="text-xs text-stone-600 mt-1.5 leading-relaxed font-medium" title={insight.practice}>
                    {insight.practice}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-xs text-stone-500 italic mt-1">
          Ayurvedic tip of the day
        </div>
      </motion.div>

      {/* CARD 2: Saved Practices & Bookmarks */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white/50 border border-white/30 p-6 rounded-[24px] flex flex-col justify-between gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-stone-500/70 uppercase font-mono tracking-wider font-bold">
              Saved Rituals
            </span>
            <BookOpen className="w-4 h-4 text-stone-500" />
          </div>

          <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
            {savedPractices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <HeartHandshake className="w-6 h-6 text-stone-400 opacity-60 mb-2" />
                <p className="text-sm text-stone-600 italic font-serif">
                  No bookmarked rituals.
                </p>
                <p className="text-xs text-stone-500 mt-1.5 max-w-[200px] leading-relaxed">
                  Ask PranaVeda to create a grounding ritual to get started.
                </p>
              </div>
            ) : (
              savedPractices.slice(0, 3).map((practice, index) => (
                <motion.div
                  key={practice.id}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelectPractice(practice)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/55 hover:bg-white border border-white/40 transition-all cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center gap-2.5 max-w-[80%] overflow-hidden">
                    <div className="p-1.5 rounded-lg bg-[#E8E1F2]/60 text-stone-700">
                      <Play className="w-3 h-3 text-stone-600 fill-stone-500" />
                    </div>
                    <div className="overflow-hidden">
                      <h5 className="text-xs font-semibold text-stone-800 truncate">
                        {practice.title}
                      </h5>
                      <span className="text-xs text-stone-500 block truncate font-mono mt-0.5">
                        {practice.result.primaryEnergy} • {practice.date}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => onDeletePractice(practice.id, e)}
                    className="p-1 px-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete Saved Practice"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div>
          {savedPractices.length > 0 ? (
            <div className="pt-2.5 border-t border-stone-200/40 flex items-center justify-between text-xs">
              <span className="text-stone-500 font-mono text-[10px] uppercase tracking-wider font-semibold">
                {savedPractices.length} items logged
              </span>
              <button 
                onClick={() => onSelectPractice(savedPractices[0])}
                className="text-[#8A79A5] hover:text-[#766395] font-bold flex items-center gap-1 group/btn transition-colors cursor-pointer"
              >
                Resume latest <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-stone-400 italic">Saved historical sessions</span>
          )}
        </div>
      </motion.div>

      {/* CARD 3: Breath Pace / Live Conscious breath spacer */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white/50 border border-white/30 p-6 rounded-[24px] flex flex-col justify-between gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
      >
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-stone-500/70 uppercase font-mono tracking-wider font-bold">
              Breathing Reset
            </span>
            <Wind className={`w-4 h-4 text-stone-500 ${prefersReducedMotion ? '' : 'animate-[pulse_2s_infinite]'}`} />
          </div>

          <div className="flex flex-col items-center justify-center py-2">
            {/* Meditative Breathing Circle */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              <motion.div
                animate={{
                  scale: getBreathCircleScale(),
                }}
                transition={{
                  duration: breathPhase === 'Inhale' || breathPhase === 'Exhale' ? 4 : 2,
                  ease: "easeInOut",
                }}
                className={`absolute w-12 h-12 rounded-full border transition-colors duration-500 ${getBreathPhaseColor()}`}
              />
              <div className="z-10 text-xs font-mono tracking-widest uppercase font-bold text-stone-800">
                {breathDuration}s
              </div>
            </div>

            <div className="mt-3.5 text-center">
              <span className="text-xs font-mono tracking-widest text-[#8A79A5]/90 uppercase font-extrabold block">
                {breathPhase === 'Sustain' ? 'Prepare' : breathPhase}
              </span>
              <span className="text-xs text-stone-600 font-serif italic mt-1 block leading-relaxed">
                {breathPhase === 'Inhale' && 'Slowly fill the lungs'}
                {breathPhase === 'Hold' && 'Retain pure cosmic prana'}
                {breathPhase === 'Exhale' && 'Release all physical tension'}
                {breathPhase === 'Sustain' && 'Find inner stillness'}
              </span>
            </div>
          </div>
        </div>

        <div className="text-xs text-stone-400 italic">
          A guided breathing pace to help you reset
        </div>
      </motion.div>
      
    </div>
  );
}
