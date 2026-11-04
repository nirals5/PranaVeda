import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Mic, MicOff, X, Sparkles, Check } from 'lucide-react';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt: (spokenText: string) => void;
}

/** Why voice can't be used, if it can't. */
export type VoiceProblem = 'unsupported' | 'blocked' | 'no-microphone' | 'failed';

/** What to tell someone when voice can't be used, in plain words. Nothing is
 *  ever made up in its place: only what they actually said is sent. */
export const VOICE_PROBLEM_TEXT: Record<VoiceProblem, string> = {
  unsupported: "Voice isn't available in this browser. Try Chrome, Edge or Safari, or type your message instead.",
  blocked: "PranaVeda can't use your microphone. Allow it in your browser's site settings and try again, or type your message instead.",
  'no-microphone': "No microphone was found. Check that one is connected, or type your message instead.",
  failed: "Voice stopped working just now. Please try again, or type your message instead.",
};

/** Maps a Web Speech API error code to what we tell the person, or null for
 *  codes that need no message ("no-speech" just means silence so far, and
 *  "aborted" is us stopping it). */
export function voiceProblemFor(code: string): VoiceProblem | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'blocked';
    case 'audio-capture':
      return 'no-microphone';
    case 'no-speech':
    case 'aborted':
      return null;
    default:
      return 'failed';
  }
}

export default function VoiceModal({ isOpen, onClose, onSubmitPrompt }: VoiceModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Opening voice assistant...');
  const [problem, setProblem] = useState<VoiceProblem | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      return;
    }

    setTranscript('');
    setProblem(null);

    const fail = (why: VoiceProblem) => {
      setProblem(why);
      setIsRecording(false);
      setStatusText(VOICE_PROBLEM_TEXT[why]);
    };

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Firefox, for one, has no speech recognition.
      fail('unsupported');
      return;
    }

    setIsRecording(true);
    setStatusText("Aligning frequency... Speak naturally.");
    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setStatusText("I am listening deeply. Share what is on your mind...");
      };

      // The whole of what has been heard so far, final and interim alike, so
      // earlier sentences stay when a new one begins.
      rec.onresult = (event: any) => {
        let heard = '';
        for (let i = 0; i < event.results.length; ++i) {
          heard += event.results[i][0].transcript;
        }
        setTranscript(heard);
      };

      rec.onerror = (err: any) => {
        console.warn("Speech recognition error:", err?.error ?? err);
        const why = voiceProblemFor(err?.error ?? '');
        if (why) {
          if (recognitionRef.current === rec) recognitionRef.current = null;
          fail(why);
        }
      };

      rec.onend = () => {
        // The browser stops listening after a pause; what was heard stays.
        if (recognitionRef.current === rec) {
          recognitionRef.current = null;
          setIsRecording(false);
        }
      };

      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      console.error("Failed to start SpeechRecognition:", e);
      fail('failed');
    }

    return () => {
      stopRecording();
    };
  }, [isOpen]);

  const stopRecording = () => {
    setIsRecording(false);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch (e) {}
    }
  };

  const spoken = transcript.trim();

  const handleComplete = () => {
    if (!spoken) return;
    stopRecording();
    onSubmitPrompt(spoken);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Soft frosted barrier backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#E8E1F2]/60 backdrop-blur-xl"
        />

        {/* Modal Sheet */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white/70 backdrop-blur-lg rounded-[28px] border border-white/80 shadow-[0_24px_64px_rgba(138,121,165,0.25)] p-8 flex flex-col justify-between overflow-hidden z-10"
        >
          {/* Subtle logo vector outline in core background of sheet */}
          <div className="pointer-events-none absolute -right-24 -bottom-24 w-80 h-80 opacity-5">
            <svg viewBox="0 0 100 100" className="w-full h-full text-stone-800" fill="none" stroke="currentColor">
              <path d="M 50 10 C 20 40, 20 70, 50 90 C 80 70, 80 40, 50 10" />
            </svg>
          </div>

          {/* Header Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 rounded-full text-[12px] font-mono tracking-widest font-semibold bg-[#E8E1F2] text-stone-700 uppercase flex items-center gap-1 shadow-sm">
                <Sparkles className="w-2.5 h-2.5 text-[#8A79A5] animate-pulse" /> VOICE CONSULTATION
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-stone-100 border border-stone-200 text-stone-500 hover:text-stone-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Central Sonic Orb and Animated Waveform */}
          <div className="flex flex-col items-center justify-center my-10 space-y-8">
            <div className="relative flex items-center justify-center">
              {/* Outer radiating ripples */}
              <motion.div
                animate={prefersReducedMotion ? {} : {
                  scale: [1, 1.4, 1],
                  opacity: [0.15, 0, 0.15],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 w-32 h-32 rounded-full border-2 border-[#8A79A5] blur-sm"
              />
              <motion.div
                animate={prefersReducedMotion ? {} : {
                  scale: [1.2, 1.6, 1.2],
                  opacity: [0.1, 0, 0.1],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 2
                }}
                className="absolute inset-0 w-32 h-32 rounded-full border border-[#DFE8FA] blur-md"
              />

              {/* Central Glowing Mic Capsule */}
              <motion.div
                className="w-28 h-28 rounded-full bg-gradient-to-tr from-white via-[#FBEDE9] to-[#E8E1F2] flex items-center justify-center border-2 border-white"
                animate={prefersReducedMotion ? {
                  boxShadow: '0 0 0 5px rgba(138,121,165,0.35), 0 10px 28px rgba(138,121,165,0.15)',
                } : {
                  scale: [1, 1.06, 1],
                  boxShadow: [
                    '0 0 0 5px rgba(138,121,165,0.45), 0 8px 24px rgba(138,121,165,0.18)',
                    '0 0 0 28px rgba(138,121,165,0), 0 18px 48px rgba(138,121,165,0.08)',
                    '0 0 0 5px rgba(138,121,165,0.45), 0 8px 24px rgba(138,121,165,0.18)',
                  ],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                {problem ? <MicOff className="w-9 h-9 text-[#8A79A5]" /> : <Mic className="w-9 h-9 text-[#8A79A5]" />}
              </motion.div>
            </div>

            {/* Coach Voice Status */}
            <div className="text-center space-y-1.5">
              <p className="text-xs font-mono font-medium text-stone-500 uppercase tracking-widest">
                {problem ? "VOICE UNAVAILABLE" : isRecording ? "LISTENING" : "HEARD YOU"}
              </p>
              <p role="status" className="text-sm font-serif italic text-stone-800 max-w-xs mx-auto leading-relaxed">
                {problem ? statusText : `"${statusText}"`}
              </p>
            </div>
          </div>

          {/* Live Transcript Panel */}
          <div className="bg-white/40 border border-white/80 rounded-2xl p-4 min-h-[90px] flex flex-col justify-between mb-2">
            <span className="text-[12px] font-mono tracking-widest text-[#8A79A5] uppercase font-semibold mb-2 block">
              VOICE TRANSLATION
            </span>
            <p className="text-stone-700 text-xs font-serif italic leading-relaxed">
              {transcript || (problem ? "Nothing heard." : "Speak naturally... share physical aches, sleepless cycles, stress blockages, or energy priorities.")}
            </p>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-xs uppercase tracking-widest font-mono font-bold bg-stone-50 border border-stone-200 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleComplete}
              disabled={!spoken}
              className="flex-1 py-3 bg-[#8A79A5] hover:bg-[#72618F] text-white text-xs uppercase tracking-widest font-mono font-bold rounded-xl shadow-[0_8px_20px_rgba(138,121,165,0.3)] transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#8A79A5] disabled:hover:translate-y-0"
            >
              <Check className="w-3.5 h-3.5" /> Submit Voice Query
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
