import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Bookmark, BookmarkCheck, Heart, Sparkles, Flame, Wind, 
  Droplet, Compass, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, 
  Clock, Coffee, BookOpen, Volume2, HelpCircle 
} from 'lucide-react';
import { RecommendationResult, SavedPractice } from '../types';

const getFallbackPoseImage = (pose: { nameEnglish: string; nameSanskrit?: string }) => {
  const name = (pose.nameEnglish || '').toLowerCase();
  const sanskrit = (pose.nameSanskrit || '').toLowerCase();

  if (name.includes("child") || sanskrit.includes("balasana")) {
    return "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("cat") || name.includes("cow") || sanskrit.includes("marjari") || sanskrit.includes("bitila")) {
    return "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("forward bend") || name.includes("forward fold") || sanskrit.includes("paschi") || sanskrit.includes("uttana")) {
    return "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("corpse") || name.includes("savasana") || sanskrit.includes("savasana")) {
    return "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("sphinx") || name.includes("cobra") || sanskrit.includes("bhujanga")) {
    return "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("meditation") || name.includes("easy pose") || sanskrit.includes("sukhasana")) {
    return "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop";
  }

  // Consistent background rotating based on length
  const placeholders = [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop"
  ];
  const charSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return placeholders[charSum % placeholders.length];
};

interface CoachingDashboardProps {
  result: RecommendationResult;
  onBack: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
  showNotification?: (message: string, type: 'info' | 'success' | 'warn') => void;
}

type TabType = 'Overview' | 'Yoga' | 'Ayurveda' | 'Breathwork';

export default function CoachingDashboard({
  result,
  onBack,
  isSaved,
  onToggleSave,
  showNotification,
}: CoachingDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('Overview');
  
  // Yoga Flow Wizard State
  const [isYogaWizardActive, setIsYogaWizardActive] = useState(false);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [poseTimerInternal, setPoseTimerInternal] = useState(120); // standard 2 minutes
  const [isPoseTimerRunning, setIsPoseTimerRunning] = useState(false);
  const poseIntervalRef = useRef<number | null>(null);

  // Breathing Timer State
  const [isBreathingRunning, setIsBreathingRunning] = useState(false);
  const [breathingPhase, setBreathingPhase] = useState<'inhale' | 'holdFull' | 'exhale' | 'holdEmpty'>('inhale');
  const [breathingTimeRemaining, setBreathingTimeRemaining] = useState(result.breathwork.inhale);
  const [breathingCycleCount, setBreathingCycleCount] = useState(1);
  const breathingTimerRef = useRef<number | null>(null);

  // Load appropriate energy icon based on text
  const getEnergyIcon = (energy: string) => {
    const norm = energy.toLowerCase();
    if (norm.includes('wind') || norm.includes('vata') || norm.includes('scatter')) {
      return <Wind className="w-5 h-5 text-neutral-600 animate-pulse" />;
    }
    if (norm.includes('fire') || norm.includes('pitta') || norm.includes('flame')) {
      return <Flame className="w-5 h-5 text-orange-600" />;
    }
    return <Droplet className="w-5 h-5 text-blue-600" />;
  };

  // 1. Manage Breathing Timer Logic
  useEffect(() => {
    if (isBreathingRunning) {
      breathingTimerRef.current = window.setInterval(() => {
        setBreathingTimeRemaining(prev => {
          if (prev <= 1) {
            // Sector transition logic
            switch (breathingPhase) {
              case 'inhale':
                if (result.breathwork.holdActive > 0) {
                  setBreathingPhase('holdFull');
                  speakVocalPhase('Hold Breath Full');
                  return result.breathwork.holdActive;
                } else {
                  setBreathingPhase('exhale');
                  speakVocalPhase('Exhale slowly');
                  return result.breathwork.exhale;
                }
              case 'holdFull':
                setBreathingPhase('exhale');
                speakVocalPhase('Exhale slowly');
                return result.breathwork.exhale;
              case 'exhale':
                if (result.breathwork.holdEmpty > 0) {
                  setBreathingPhase('holdEmpty');
                  speakVocalPhase('Hold Empty');
                  return result.breathwork.holdEmpty;
                } else {
                  setBreathingPhase('inhale');
                  speakVocalPhase('Inhale deeply');
                  setBreathingCycleCount(c => c + 1);
                  return result.breathwork.inhale;
                }
              case 'holdEmpty':
                setBreathingPhase('inhale');
                speakVocalPhase('Inhale deeply');
                setBreathingCycleCount(c => c + 1);
                return result.breathwork.inhale;
              default:
                return result.breathwork.inhale;
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (breathingTimerRef.current) {
        clearInterval(breathingTimerRef.current);
        breathingTimerRef.current = null;
      }
    }

    return () => {
      if (breathingTimerRef.current) {
        clearInterval(breathingTimerRef.current);
      }
    };
  }, [isBreathingRunning, breathingPhase, result]);

  // Voice synthesis cue helper for breathing and actions
  const speakVocalPhase = (phrase: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      // Naturalize phrase transitions for organic, breathing-centered cadence
      let naturalized = phrase;
      const lower = phrase.toLowerCase();
      if (lower.includes('inhale deeply') || lower === 'inhale') {
        naturalized = "Inhale... slowly... drawing in pure air... feeling deep calm.";
      } else if (lower.includes('hold breath full') || lower.includes('hold full')) {
        naturalized = "Hold the breath full... serene... steady... feel the space expanding within.";
      } else if (lower.includes('exhale slowly') || lower === 'exhale') {
        naturalized = "Exhale... completely... releasing all density... resting into gravity.";
      } else if (lower.includes('hold empty')) {
        naturalized = "Hold empty... absolute pause... still... fully grounded.";
      } else if (lower.includes('beginning')) {
        naturalized = phrase.replace('Beginning', 'Beginning the nourishing practice of ');
      } else {
        // Humanize text by transforming punctuation and structures into structural pauses
        naturalized = phrase
          .replace(':', '... ')
          .replace(', or', '... also known as... ')
          .replace(/,/g, '... ');
      }

      const utterance = new SpeechSynthesisUtterance(naturalized);
      utterance.rate = 0.8; // Gentle, grounding pace
      utterance.pitch = 0.95; // Warm, soothing tone
      
      // Find standard high-quality natural voice default
      const voices = window.speechSynthesis.getVoices();
      const EnglishVoices = voices.filter(v => v.lang.toLowerCase().includes('en'));
      const listToSelect = EnglishVoices.length > 0 ? EnglishVoices : voices;
      const selectedVoice = listToSelect.find(v => 
        v.name.includes('Natural') || 
        v.name.includes('Google') || 
        v.name.includes('Premium') || 
        v.name.includes('Siri') ||
        v.name.includes('Samantha') ||
        v.name.includes('Daniel')
      ) || listToSelect[0];
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleBreathing = () => {
    if (!isBreathingRunning) {
      speakVocalPhase(`Beginning ${result.breathwork.name}`);
    }
    setIsBreathingRunning(!isBreathingRunning);
  };

  const resetBreathing = () => {
    setIsBreathingRunning(false);
    setBreathingPhase('inhale');
    setBreathingTimeRemaining(result.breathwork.inhale);
    setBreathingCycleCount(1);
    speakVocalPhase("Timer reset");
  };

  // 2. Yoga Wizard Sequences Logic
  const startYogaWizard = () => {
    setIsYogaWizardActive(true);
    setCurrentPoseIndex(0);
    const initialPose = result.yogaPractice.poses[0];
    const seconds = parseDurationToSeconds(initialPose.duration);
    setPoseTimerInternal(seconds);
    setIsPoseTimerRunning(true);
    speakVocalPhase(`Starting posture: ${initialPose.nameEnglish}, or ${initialPose.nameSanskrit}`);
  };

  const parseDurationToSeconds = (durStr: string): number => {
    const num = parseInt(durStr);
    if (isNaN(num)) return 120; // fallback: 2 minutes
    if (durStr.toLowerCase().includes('breath')) {
      return num * 6; // 6 seconds per deep lung cycle
    }
    return num * 60; // minutes to seconds
  };

  useEffect(() => {
    if (isYogaWizardActive && isPoseTimerRunning) {
      poseIntervalRef.current = window.setInterval(() => {
        setPoseTimerInternal(prev => {
          if (prev <= 1) {
            handleNextPose();
            return 120;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (poseIntervalRef.current) {
        clearInterval(poseIntervalRef.current);
        poseIntervalRef.current = null;
      }
    }
    return () => {
      if (poseIntervalRef.current) {
        clearInterval(poseIntervalRef.current);
      }
    };
  }, [isYogaWizardActive, isPoseTimerRunning, currentPoseIndex]);

  const handleNextPose = () => {
    if (currentPoseIndex < result.yogaPractice.poses.length - 1) {
      const nextIdx = currentPoseIndex + 1;
      setCurrentPoseIndex(nextIdx);
      const nextPose = result.yogaPractice.poses[nextIdx];
      const seconds = parseDurationToSeconds(nextPose.duration);
      setPoseTimerInternal(seconds);
      speakVocalPhase(`Entering posture: ${nextPose.nameEnglish}, ${nextPose.nameSanskrit}`);
    } else {
      setIsPoseTimerRunning(false);
      speakVocalPhase("Yoga ritual completed. Sit quietly and feel the light of integration.");
      if (showNotification) {
        showNotification("Namaste. You have successfully aligned your 10-minute yoga sequence!", "success");
      } else {
        alert("Namaste. You have successfully aligned your 10-minute yoga sequence!");
      }
      setIsYogaWizardActive(false);
    }
  };

  const handlePrevPose = () => {
    if (currentPoseIndex > 0) {
      const prevIdx = currentPoseIndex - 1;
      setCurrentPoseIndex(prevIdx);
      const prevPose = result.yogaPractice.poses[prevIdx];
      const seconds = parseDurationToSeconds(prevPose.duration);
      setPoseTimerInternal(seconds);
      speakVocalPhase(`Returning to posture: ${prevPose.nameEnglish}`);
    }
  };

  const formatTimerString = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pt-4 pb-20 select-none z-10 relative">
      {/* Upper Navigation Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 group font-mono text-xs cursor-pointer uppercase tracking-wider bg-white/50 backdrop-blur-sm p-2 px-4 rounded-xl border border-white/60 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          BACK TO COACH
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSave}
            className={`flex items-center gap-1.5 font-mono text-xs cursor-pointer uppercase tracking-wider p-2 px-4 rounded-xl border transition-all ${
              isSaved 
                ? 'bg-neutral-800 text-white border-neutral-800' 
                : 'bg-white/50 border-white/60 text-stone-600 hover:text-stone-900'
            }`}
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="w-3.5 h-3.5 text-orange-200 fill-orange-200" />
                Bookmarked
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5" />
                Bookmark Ritual
              </>
            )}
          </button>
        </div>
      </div>

      {result._isFallback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#E8E1F2]/60 backdrop-blur-xs border border-purple-200/65 p-4 px-5 rounded-2xl mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-purple-950 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#8A79A5] flex-shrink-0 animate-pulse" />
            <div>
              <p className="font-mono font-bold uppercase tracking-wider text-[10px] text-[#8A79A5]">Centering Baseline Mode Active</p>
              <p className="font-sans text-stone-600 font-medium sm:mt-0.5">The live synthesis engine is offline or overloaded. We have safely routed baseline consecrated Ayurvedic wisdom to support your practice.</p>
            </div>
          </div>
          <span className="text-[9px] font-mono tracking-widest font-extrabold uppercase bg-white/70 border border-stone-200 p-1 px-2.5 rounded-lg text-[#8A79A5] self-start sm:self-auto flex-shrink-0">
            SECURE FALLBACK
          </span>
        </motion.div>
      )}

      {/* Primary Floating Header Card detailing State and Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/55 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/70 shadow-[0_12px_40px_rgba(138,121,165,0.15)] mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div className="space-y-3.5 md:max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1 px-3 rounded-full text-[11px] font-mono tracking-wider font-bold bg-[#E8E1F2]/70 text-stone-700 uppercase flex items-center gap-1.5 shadow-xs">
              {getEnergyIcon(result.primaryEnergy)} CORE ENERGY • {result.ayurvedicAdvice.doshaPrimary}
            </span>
            <span className="p-1 px-3 rounded-full text-[11px] font-mono tracking-wider font-bold bg-white/80 text-stone-600 uppercase shadow-xs">
              10-MIN DAILY FLOW
            </span>
          </div>

          <h2 className="text-3xl md:text-[40px] font-serif font-light text-stone-850 tracking-tight leading-tight">
            {result.primaryEnergy} <span className="font-normal italic text-[#8A79A5]">State</span>
          </h2>
          
          <p className="text-sm md:text-base font-serif text-stone-700 leading-relaxed max-w-xl">
            {result.summary}
          </p>
        </div>

        {/* Dosha Circle Analysis Display */}
        <div className="bg-white/75 backdrop-blur-xs rounded-xl p-5 border border-stone-100 flex flex-col justify-center items-center h-full min-w-[170px] shadow-sm">
          <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold text-center">
            DOSHA IMPRESSION
          </span>
          <span className="text-2xl font-serif font-bold text-stone-850 mt-2">
            {result.ayurvedicAdvice.doshaPrimary}
          </span>
          <span className="text-xs text-stone-500 text-center font-mono mt-1 px-2.5">
            {result.doshaTendency.split(' ')[0]} Element Focus
          </span>
        </div>
      </motion.div>

      {/* Grid containing Core Tab selectors and Main Content Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left column holding Tabs */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Responsive Pill Tabs Column */}
          <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none">
            {(['Overview', 'Yoga', 'Ayurveda', 'Breathwork'] as TabType[]).map((tab) => {
              const hasIcon = {
                Overview: <Compass className="w-4 h-4" />,
                Yoga: <Clock className="w-4 h-4" />,
                Ayurveda: <Coffee className="w-4 h-4" />,
                Breathwork: <Wind className="w-4 h-4 animate-pulse" />
              }[tab];
              
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setIsYogaWizardActive(false);
                  }}
                  className={`flex items-center gap-2.5 p-3 px-5 rounded-xl border text-xs font-mono font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap transition-all flex-1 lg:flex-initial text-left ${
                    activeTab === tab
                      ? 'bg-gradient-to-tr from-[#E8E1F2] to-[#DFE8FA] font-bold text-stone-800 border-white/80 shadow-md'
                      : 'bg-white/40 hover:bg-white/70 border-white/50 text-stone-500'
                  }`}
                >
                  {hasIcon}
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Pane Area */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            
            {/* Overview / Holistic Integration Tab */}
            {activeTab === 'Overview' && (
              <motion.div
                key="Overview"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="bg-white/55 backdrop-blur-md rounded-2xl p-6 border border-white/70 shadow-sm space-y-4">
                  <h3 className="text-base sm:text-lg font-mono uppercase tracking-widest text-[#8A79A5] font-bold flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Holistic Advice & Philosophy
                  </h3>
                  <p className="text-sm sm:text-base text-stone-750 leading-relaxed font-serif italic">
                    "{result.ayurvedicAdvice.assessment}"
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                    <div className="bg-white/50 rounded-xl p-4 border border-stone-200/40">
                      <span className="text-xs uppercase font-mono tracking-wider font-bold text-stone-600 block mb-2">
                        INTEGRATING ENERGY
                      </span>
                      <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                        Through a balanced protocol of <b>{result.yogaPractice.title}</b> and equal ratio breath cycles, the body offsets the dry and fluttering mechanics of Vata, returning power to your core storage.
                      </p>
                    </div>

                    <div className="bg-white/50 rounded-xl p-4 border border-stone-200/40 list-disc">
                      <span className="text-xs uppercase font-mono tracking-wider font-bold text-stone-600 block mb-2">
                        TODAY'S RATIONAL HYDRATION
                      </span>
                      <ul className="text-xs sm:text-sm text-stone-600 space-y-1">
                        <li>• Sip warm spice tea (ginger/cinnamon)</li>
                        <li>• Avoid cold drafts and raw ice juices</li>
                        <li>• Rest eyes in quiet posture every 3 hours</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Direct quick launch of practice panels for faster engagement */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div 
                    onClick={() => setActiveTab('Yoga')}
                    className="p-5 rounded-2xl bg-white/40 border border-white/60 hover:bg-white/70 transition-all cursor-pointer flex items-center justify-between group shadow-sm"
                  >
                    <div>
                      <span className="text-[11px] uppercase font-mono tracking-wider text-[#8A79A5] font-bold">FLOW PRACTICE</span>
                      <h4 className="text-base font-serif font-semibold text-stone-800 mt-1">{result.yogaPractice.title}</h4>
                      <p className="text-xs text-stone-500 mt-1">10 Minutes • {result.yogaPractice.poses.length} postures</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-stone-400 group-hover:translate-x-1 transition-transform" />
                  </div>

                  <div 
                    onClick={() => setActiveTab('Breathwork')}
                    className="p-5 rounded-2xl bg-white/40 border border-white/60 hover:bg-white/70 transition-all cursor-pointer flex items-center justify-between group shadow-sm"
                  >
                    <div>
                      <span className="text-[11px] uppercase font-mono tracking-wider text-[#8A79A5] font-bold">PRANAYAMA TIMERS</span>
                      <h4 className="text-base font-serif font-semibold text-stone-800 mt-1">{result.breathwork.name}</h4>
                      <p className="text-xs text-stone-500 mt-1">Ratios: {result.breathwork.inhale}-{result.breathwork.holdActive}-{result.breathwork.exhale}-{result.breathwork.holdEmpty}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-stone-400 group-hover:translate-x-1 transition-transform animate-pulse" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Yoga Sequence Tab */}
            {activeTab === 'Yoga' && (
              <motion.div
                key="Yoga"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                {/* Yoga Guide Screen / Active wizard */}
                {isYogaWizardActive ? (
                  <div className="bg-stone-900 text-white rounded-3xl p-6 md:p-8 border border-stone-800 shadow-2xl relative overflow-hidden">
                    {/* Background glow in dark mode */}
                    <div className="absolute top-0 right-0 w-80 h-80 bg-[#8A79A5]/10 blur-[100px] rounded-full pointer-events-none" />

                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-800">
                      <div>
                        <span className="text-[11px] font-mono tracking-widest text-[#A294BF] font-semibold uppercase">
                          ACTIVE YOGA SEQUENCE PLAYER
                        </span>
                        <h4 className="text-base font-serif font-light text-stone-300 mt-1">
                          {result.yogaPractice.title}
                        </h4>
                      </div>
                      <button
                        onClick={() => {
                          setIsYogaWizardActive(false);
                          setIsPoseTimerRunning(false);
                        }}
                        className="p-1 px-2.5 rounded-lg border border-stone-700 text-xs font-mono text-stone-400 hover:text-white hover:bg-stone-800 uppercase transition-colors"
                      >
                        Exit Player
                      </button>
                    </div>

                    {/* Active Pose Visualization panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center min-h-[220px]">
                      <div className="space-y-4">
                        <span className="text-xs font-mono uppercase bg-[#8A79A5]/25 text-[#D1C7EB] p-1 px-2.5 rounded-full font-bold">
                          POSTURE {currentPoseIndex + 1} OF {result.yogaPractice.poses.length}
                        </span>
                        
                        {/* Pose Visual Demonstration Header */}
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-stone-950 border border-stone-800/80 shadow-md">
                          {result.yogaPractice.poses[currentPoseIndex].videoUrl ? (
                            <video
                              src={result.yogaPractice.poses[currentPoseIndex].videoUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src={result.yogaPractice.poses[currentPoseIndex].poseImageUrl || getFallbackPoseImage(result.yogaPractice.poses[currentPoseIndex])}
                              alt={result.yogaPractice.poses[currentPoseIndex].nameEnglish}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute bottom-3 right-3 bg-stone-950/80 backdrop-blur-xs text-[10px] font-mono p-1 px-2.5 rounded-md text-stone-300 font-bold border border-stone-800">
                            {result.yogaPractice.poses[currentPoseIndex].videoUrl ? "Looping flow" : "Static guide"}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <h2 className="text-2xl md:text-3.5xl font-serif font-medium tracking-tight">
                            {result.yogaPractice.poses[currentPoseIndex].nameEnglish}
                          </h2>
                          <p className="text-xs md:text-sm text-stone-400 font-mono italic">
                            {result.yogaPractice.poses[currentPoseIndex].nameSanskrit}
                          </p>
                        </div>

                        <div className="border border-stone-850 bg-stone-950 p-4.5 rounded-xl space-y-1 pl-12 relative">
                          <Compass className="w-5 h-5 absolute top-4 left-4 text-orange-200 opacity-60" />
                          <span className="text-[10px] font-mono text-stone-500 uppercase block font-bold">Instructions</span>
                          <p className="text-sm text-stone-300 leading-relaxed font-serif">
                            {result.yogaPractice.poses[currentPoseIndex].instructions}
                          </p>
                        </div>
                      </div>

                      {/* Giant Circle Countdown Timer */}
                      <div className="flex flex-col items-center justify-center space-y-6">
                        <div className="relative w-44 h-44 flex items-center justify-center">
                          {/* Pulsing ring for breath alignment */}
                          <motion.div
                            animate={{
                              scale: isPoseTimerRunning ? [1.1, 1.15, 1.1] : 1.1,
                              opacity: [0.3, 0.1, 0.3]
                            }}
                            transition={{
                              duration: 5,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                            className="absolute inset-0 border border-white/20 rounded-full"
                          />
                          <div className="absolute inset-2 bg-stone-950 rounded-full border-2 border-stone-800 flex flex-col items-center justify-center">
                            <span className="text-7xl font-mono font-extralight tracking-tight text-stone-100">
                              {formatTimerString(poseTimerInternal)}
                            </span>
                            <span className="text-[11px] text-[#A294BF] font-mono uppercase tracking-wider mt-1 font-bold flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {result.yogaPractice.poses[currentPoseIndex].duration} Focus
                            </span>
                          </div>
                        </div>

                        {/* Player controls */}
                        <div className="flex items-center gap-4">
                          <button
                            onClick={handlePrevPose}
                            disabled={currentPoseIndex === 0}
                            className="p-2.5 rounded-full border border-stone-800 bg-stone-950 text-stone-400 disabled:opacity-30 hover:text-white hover:bg-stone-800 disabled:hover:bg-transparent enabled:cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setIsPoseTimerRunning(!isPoseTimerRunning)}
                            className="p-4 rounded-full bg-white hover:bg-stone-100 text-stone-950 cursor-pointer shadow-lg hover:scale-105 transition-transform"
                            title={isPoseTimerRunning ? "Pause timer" : "Resume timer"}
                          >
                            {isPoseTimerRunning ? <Pause className="w-5 h-5 fill-stone-950" /> : <Play className="w-5 h-5 fill-stone-950 ml-0.5" />}
                          </button>

                          <button
                            onClick={handleNextPose}
                            className="p-2.5 rounded-full border border-stone-800 bg-stone-950 text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Posture Benefits block */}
                    <div className="mt-8 pt-4 border-t border-stone-800 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-stone-400">
                      <p className="font-serif italic text-center sm:text-left text-sm text-stone-300 leading-relaxed">
                        "Benefits: {result.yogaPractice.poses[currentPoseIndex].benefits}"
                      </p>
                      <span className="font-mono text-xs text-stone-500">
                        Namaste Practice Guide
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/55 backdrop-blur-md rounded-2xl p-6 border border-white/70 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                      <div>
                        <h3 className="text-base sm:text-lg font-mono uppercase tracking-widest text-[#8A79A5] font-bold">
                          {result.yogaPractice.title}
                        </h3>
                        <p className="text-sm font-serif text-stone-600 mt-2">
                          {result.yogaPractice.description}
                        </p>
                      </div>

                      <button
                        onClick={startYogaWizard}
                        className="py-2.5 px-6 rounded-xl text-xs uppercase font-mono font-bold tracking-wider bg-stone-900 border border-stone-900 text-white hover:bg-stone-700 shadow-md flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-center"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" /> Begin 10m Flow
                      </button>
                    </div>

                    {/* Interactive Posture List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {result.yogaPractice.poses.map((pose, index) => (
                        <div
                          key={index}
                          className="flex flex-col rounded-2xl overflow-hidden border border-stone-100 bg-white/75 hover:bg-white transition-all shadow-sm group"
                        >
                          {/* Posture Demonstration Header */}
                          <div className="w-full h-48 relative overflow-hidden bg-stone-50 border-b border-stone-100/60">
                            <img 
                              src={pose.poseImageUrl || getFallbackPoseImage(pose)} 
                              alt={pose.nameEnglish}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            />
                            <div className="absolute top-4 left-4 p-1 px-3 text-[10px] uppercase font-mono tracking-wider font-bold bg-white/90 text-[#8A79A5] backdrop-blur-xs rounded-full shadow-xs">
                              Posture {(index + 1).toString().padStart(2, '0')}
                            </div>
                            <span className="absolute top-4 right-4 p-1 px-2.5 text-[10px] uppercase font-mono tracking-wider font-bold bg-[#FBEDE9] text-[#A66C5E] backdrop-blur-xs rounded-md shadow-xs leading-none">
                              {pose.duration}
                            </span>
                          </div>

                          {/* Posture Text Details Below Visual */}
                          <div className="p-5 flex-1 flex flex-col justify-between space-y-3.5">
                            <div className="space-y-1">
                              <div className="flex flex-col">
                                <h4 className="text-base sm:text-lg font-serif font-bold text-stone-850 leading-tight">
                                  {pose.nameEnglish}
                                </h4>
                                <span className="text-xs font-mono text-stone-450 italic mt-0.5">
                                  {pose.nameSanskrit}
                                </span>
                              </div>
                              <p className="text-xs text-stone-500 font-medium font-mono leading-tight bg-stone-50 p-2 rounded-lg border border-stone-100/50 block">
                                Benefits: {pose.benefits}
                              </p>
                            </div>
                            
                            <div className="pt-2 border-t border-stone-100/50">
                              <span className="text-[10px] font-mono font-bold uppercase text-stone-400 tracking-wider block mb-1">
                                Instructions
                              </span>
                              <p className="text-xs sm:text-sm text-stone-605 leading-relaxed font-serif">
                                {pose.instructions}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Ayurveda wisdom Tab */}
            {activeTab === 'Ayurveda' && (
              <motion.div
                key="Ayurveda"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Eat habits card */}
                  <div className="bg-white/55 backdrop-blur-md rounded-2xl p-6 border border-white/70 shadow-sm space-y-4">
                    <h3 className="text-xs sm:text-sm uppercase font-mono tracking-widest text-[#8A79A5] font-bold flex items-center gap-1.5 pl-0.5">
                      <Coffee className="w-4.5 h-4.5" /> DIETARY PRACTICES (AHARA)
                    </h3>
                    
                    <div className="space-y-3 pt-2">
                      {result.ayurvedicAdvice.dietaryTips.map((tip, idx) => (
                        <div key={idx} className="flex gap-3 items-start p-3 bg-white/60 border border-stone-100 rounded-xl">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 flex-shrink-0" />
                          <p className="text-sm text-stone-700 leading-relaxed font-serif">
                            {tip}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lifestyle guidelines card */}
                  <div className="bg-white/55 backdrop-blur-md rounded-2xl p-6 border border-white/70 shadow-sm space-y-4">
                    <h3 className="text-xs sm:text-sm uppercase font-mono tracking-widest text-[#8A79A5] font-bold flex items-center gap-1.5 pl-0.5">
                      <Compass className="w-4.5 h-4.5" /> DAILY ROUTINES (VIHARA)
                    </h3>
                    
                    <div className="space-y-3 pt-2">
                      {result.ayurvedicAdvice.lifestyleTips.map((tip, idx) => (
                        <div key={idx} className="flex gap-3 items-start p-3 bg-white/60 border border-stone-100 rounded-xl">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 flex-shrink-0" />
                          <p className="text-sm text-stone-700 leading-relaxed font-serif">
                            {tip}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Classical Herbs Suggestion display */}
                <div className="bg-gradient-to-tr from-[#E8E1F2]/25 to-[#DDF5EE]/25 border border-white/80 rounded-2xl p-6 shadow-sm">
                  <span className="text-xs uppercase font-mono tracking-wider text-stone-500 font-bold block mb-3">
                    SACRED HERBS & INFUSIONS (AUSHADHA)
                  </span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.ayurvedicAdvice.recommendedHerbs.map((herb, idx) => (
                      <div key={idx} className="p-4.5 bg-white/70 rounded-xl border border-stone-200/50 flex flex-col justify-between shadow-xs">
                        <h4 className="text-xs sm:text-sm font-mono font-bold tracking-wider text-stone-850 uppercase">
                          {herb.split(' ')[0]} Focus
                        </h4>
                        <p className="text-sm font-serif text-stone-700 leading-relaxed mt-2">
                          {herb}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Breathwork / Pranayama Tab with Interactive Breathing Ring */}
            {activeTab === 'Breathwork' && (
              <motion.div
                key="Breathwork"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="bg-white/55 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/70 shadow-sm flex flex-col md:flex-row gap-8 items-center">
                  
                  {/* Interactive breathing graphic */}
                  <div className="flex flex-col items-center justify-center space-y-4 md:border-r md:border-stone-200/50 md:pr-10 min-w-[240px]">
                    
                    {/* Breathing circle container */}
                    <div className="relative w-48 h-48 flex items-center justify-center">
                      <AnimatePresence>
                        {/* Dynamic breathing expanding core */}
                        <motion.div
                          key={breathingPhase}
                          className={`absolute rounded-full border border-stone-200/20`}
                          style={{
                            width: '100%',
                            height: '100%',
                            background: {
                              inhale: 'radial-gradient(circle, rgba(223,232,250,0.4) 0%, rgba(223,232,250,0.05) 70%)',
                              holdFull: 'radial-gradient(circle, rgba(232,225,242,0.45) 0%, rgba(232,225,242,0.05) 75%)',
                              exhale: 'radial-gradient(circle, rgba(251,237,233,0.3) 0%, rgba(251,237,233,0.05) 70%)',
                              holdEmpty: 'radial-gradient(circle, rgba(221,245,238,0.3) 0%, rgba(221,245,238,0.05) 70%)',
                            }[breathingPhase]
                          }}
                          animate={{
                            scale: isBreathingRunning ? {
                              inhale: [1, 1.25],
                              holdFull: 1.25,
                              exhale: [1.25, 1],
                              holdEmpty: 1,
                            }[breathingPhase] : 1,
                          }}
                          transition={{
                            duration: {
                              inhale: result.breathwork.inhale,
                              holdFull: result.breathwork.holdActive,
                              exhale: result.breathwork.exhale,
                              holdEmpty: result.breathwork.holdEmpty || 1,
                            }[breathingPhase],
                            ease: "easeInOut"
                          }}
                        />
                      </AnimatePresence>

                      <div className="absolute w-32 h-32 bg-white/90 backdrop-blur-md rounded-full border border-white/80 shadow-[0_8px_24px_rgba(138,121,165,0.1)] flex flex-col items-center justify-center p-4">
                        <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold">
                          {isBreathingRunning ? 'ACTIVE CYCLE' : 'STANDBY'}
                        </span>
                        
                        <span className="text-base font-serif font-bold text-[#8A79A5] capitalize mt-1.5">
                          {breathingPhase === 'holdFull' ? 'Hold full' : breathingPhase === 'holdEmpty' ? 'Hold empty' : breathingPhase}
                        </span>

                        <span className="text-4.5xl font-mono font-light tracking-tight text-stone-850 mt-1">
                          {breathingTimeRemaining}s
                        </span>
                      </div>
                    </div>

                    {/* Cycle Indicators */}
                    <div className="text-center font-mono text-xs text-stone-600 uppercase tracking-wider font-bold">
                      Cycle {breathingCycleCount} / {result.breathwork.cycles}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={toggleBreathing}
                        className="p-3 rounded-full bg-stone-900 border border-stone-900 text-white hover:bg-stone-700 cursor-pointer shadow-md"
                        title={isBreathingRunning ? "Pause cycle" : "Begin pranayama"}
                      >
                        {isBreathingRunning ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                      </button>
                      
                      <button
                        onClick={resetBreathing}
                        className="p-3 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 cursor-pointer shadow-sm"
                        title="Reset timer"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>

                  </div>

                  {/* Breath specifications & advice */}
                  <div className="space-y-4 flex-1">
                    <div>
                      <span className="p-1 px-3 rounded-full text-xs font-mono tracking-wider font-bold bg-[#DDF5EE] text-[#4d7f72] uppercase h-fit shadow-xs">
                        SANSKRIT: {result.breathwork.sanskritName || "PRANAYAMA"}
                      </span>
                      <h3 className="text-xl font-serif font-bold text-stone-850 tracking-tight mt-2 px-0.5">
                        {result.breathwork.name}
                      </h3>
                    </div>

                    <p className="text-sm sm:text-base font-serif text-stone-605 leading-relaxed italic">
                      "{result.breathwork.description}"
                    </p>

                    <div className="grid grid-cols-4 gap-2 pt-2 text-center">
                      <div className="p-2.5 bg-[#DFE8FA]/40 border border-white/70 rounded-xl">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase font-mono">Inhale</span>
                        <span className="text-base font-bold font-mono text-stone-800 block mt-1">{result.breathwork.inhale}s</span>
                      </div>
                      <div className="p-2.5 bg-[#E8E1F2]/40 border border-white/70 rounded-xl">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase font-mono">Hold Full</span>
                        <span className="text-base font-bold font-mono text-stone-800 block mt-1">{result.breathwork.holdActive}s</span>
                      </div>
                      <div className="p-2.5 bg-[#FBEDE9]/40 border border-white/70 rounded-xl">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase font-mono">Exhale</span>
                        <span className="text-base font-bold font-mono text-stone-800 block mt-1">{result.breathwork.exhale}s</span>
                      </div>
                      <div className="p-2.5 bg-[#DDF5EE]/40 border border-white/70 rounded-xl">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase font-mono">Hold Empty</span>
                        <span className="text-base font-bold font-mono text-stone-800 block mt-1">{result.breathwork.holdEmpty}s</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-150 space-y-1 bg-white/40 p-5 border border-white/60 rounded-xl shadow-xs">
                      <span className="text-xs uppercase font-mono tracking-wider font-bold text-stone-600 block mb-1">
                        COACH'S CORNER ON RETENTION (KUMBHAKA)
                      </span>
                      <p className="text-sm text-stone-605 leading-relaxed font-serif">
                        {result.breathwork.benefits}
                      </p>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}
