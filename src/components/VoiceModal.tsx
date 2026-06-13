import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, X, Sparkles, Volume2, VolumeX, Check } from 'lucide-react';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt: (spokenText: string) => void;
}

export default function VoiceModal({ isOpen, onClose, onSubmitPrompt }: VoiceModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Opening voice assistant...');
  const [mediaError, setMediaError] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const waveformIntervalRef = useRef<number | null>(null);
  
  // Waveform visualization elements
  const [waveHeights, setWaveHeights] = useState<number[]>([15, 30, 10, 40, 20, 5, 25, 45, 10, 30, 15]);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      return;
    }

    // Start Recording automated delay or trigger Speech API
    setIsRecording(true);
    setTranscript('');
    setStatusText("Aligning frequency... Speak naturally.");
    setMediaError(false);
    
    // Check for browser recognition capabilities
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onstart = () => {
          setStatusText("I am listening deeply. Share what is on your mind...");
        };

        rec.onresult = (event: any) => {
          let curr = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              curr += event.results[i][0].transcript;
            } else {
              curr += event.results[i][0].transcript;
            }
          }
          if (curr) setTranscript(curr);
        };

        rec.onerror = (err: any) => {
          console.warn("Speech recognition error:", err);
          // If restricted or blocked, we do simulated speech typing safely so the user gets a seamless experience
          if (err.error === 'not-allowed') {
            setMediaError(true);
            runSimulatedSpeech();
          }
        };

        rec.onend = () => {
          // Keep active unless stopped manually
        };

        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.error("Failed to start SpeechRecognition:", e);
        setMediaError(true);
        runSimulatedSpeech();
      }
    } else {
      // Setup mock simulation in case browser doesn't support Web Speech
      setMediaError(true);
      runSimulatedSpeech();
    }

    // Animate waveform bars for vocal tactile feedback
    waveformIntervalRef.current = window.setInterval(() => {
      setWaveHeights(prev => prev.map(() => Math.floor(Math.random() * 55) + 12));
    }, 120);

    return () => {
      stopRecording();
    };
  }, [isOpen]);

  const runSimulatedSpeech = () => {
    setStatusText("I am listening. (Simulated Mode - microphone blocked or unsupported)");
    const simulationPhrases = [
      "I ", "feel ", "very ", "stressed ", "lately, ", "and ", "my ", "lower ", "back ", "is ", "stiff ", "from ", "long ", "hours ", "of ", "sitting ", "at ", "my ", "office ", "desk."
    ];
    
    let currentWordIdx = 0;
    const interval = setInterval(() => {
      if (currentWordIdx < simulationPhrases.length) {
        setTranscript(prev => prev + simulationPhrases[currentWordIdx]);
        currentWordIdx++;
      } else {
        clearInterval(interval);
        setStatusText("Complete. Tapping complete below sends this to PranaVeda.");
      }
    }, 450);

    (recognitionRef as any).currentSimInterval = interval;
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if ((recognitionRef as any).currentSimInterval) {
      clearInterval((recognitionRef as any).currentSimInterval);
    }
  };

  const handleComplete = () => {
    stopRecording();
    const finalTranscript = transcript.trim() || "What does Ayurveda suggest for low energy and digestion?";
    onSubmitPrompt(finalTranscript);
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
              <span className="p-1 px-2.5 rounded-full text-[9px] font-mono tracking-widest font-semibold bg-[#E8E1F2] text-stone-700 uppercase flex items-center gap-1 shadow-sm">
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
                animate={{
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
                animate={{
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
              <div 
                className={`w-28 h-28 rounded-full bg-gradient-to-tr from-white via-[#FBEDE9] to-[#E8E1F2] flex items-center justify-center shadow-[0_12px_36px_rgba(138,121,165,0.15)] border-2 border-white`}
              >
                <div className="text-stone-800 animate-[bounce_4s_infinite_ease-in-out]">
                  <Mic className="w-9 h-9 text-[#8A79A5]" />
                </div>
              </div>
            </div>

            {/* Micro Waveform visualization */}
            <div className="flex items-center gap-1.5 h-16 justify-center">
              {waveHeights.map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-[#8A79A5]/50 hover:bg-[#8A79A5]"
                  style={{ height: `${h}px` }}
                  animate={{
                    backgroundColor: isRecording ? ['rgba(138,121,165,0.4)', 'rgba(138,121,165,1)', 'rgba(138,121,165,0.4)'] : 'rgb(214,211,209)'
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.1
                  }}
                />
              ))}
            </div>

            {/* Coach Voice Status */}
            <div className="text-center space-y-1.5">
              <p className="text-xs font-mono font-medium text-stone-500 uppercase tracking-widest">
                {isRecording ? "LISTENING" : "RITUAL COMPLETED"}
              </p>
              <p className="text-sm font-serif italic text-stone-800 max-w-xs mx-auto leading-relaxed">
                "{statusText}"
              </p>
            </div>
          </div>

          {/* Live Transcript Panel */}
          <div className="bg-white/40 border border-white/80 rounded-2xl p-4 min-h-[90px] flex flex-col justify-between mb-2">
            <span className="text-[9px] font-mono tracking-widest text-[#8A79A5] uppercase font-semibold mb-2 block">
              VOICE TRANSLATION
            </span>
            <p className="text-stone-700 text-xs font-serif italic leading-relaxed">
              {transcript || "Speak naturally... share physical aches, sleepless cycles, stress blockages, or energy priorities."}
            </p>
            {mediaError && (
              <span className="text-[9px] text-[#865959]/75 font-mono block mt-2.5">
                * Simulated audio feed activated - your browser's mic permission is sandboxed.
              </span>
            )}
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
              className="flex-1 py-3 bg-[#8A79A5] hover:bg-[#72618F] text-white text-xs uppercase tracking-widest font-mono font-bold rounded-xl shadow-[0_8px_20px_rgba(138,121,165,0.3)] transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:translate-y-[-1px]"
            >
              <Check className="w-3.5 h-3.5" /> Submit Voice Query
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
