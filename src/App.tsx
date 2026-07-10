import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles, Mic, ArrowRight, HelpCircle, Flame, Wind, Droplet, Star, Play, RotateCcw, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import PranaBackground from './components/PranaBackground';
import Logo from './components/Logo';
import VoiceModal from './components/VoiceModal';
import WellnessInsight from './components/WellnessInsight';
import CoachingDashboard from './components/CoachingDashboard';
import AmritaChat from './components/AmritaChat';
import { useAmritaChat } from './hooks/useAmritaChat';
import { RecommendationResult, SavedPractice } from './types';
import RecoveryTrends from './components/RecoveryTrends';

export default function App() {
  const prefersReducedMotion = useReducedMotion();
  const [currentView, setCurrentView] = useState<'coach' | 'recovery'>('coach');
  const [showAmritaHint, setShowAmritaHint] = useState(true);
  const hoverTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowAmritaHint(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const handleAmritaMouseEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setShowAmritaHint(true), 1000);
  };

  const handleAmritaMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowAmritaHint(false), 600);
  };
  const [inputValue, setInputValue] = useState('');
  const [currentResult, setCurrentResult] = useState<RecommendationResult | null>(null);
  const { items: chatItems, isStreaming, sendMessage, resetConversation } = useAmritaChat();
  const [savedPractices, setSavedPractices] = useState<SavedPractice[]>([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  
  // Track currently active saving ID to toggling
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warn' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setNotification({ message, type });
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4200);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load saved practices from localStorage on boot
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pranaveda_practices');
      if (stored) {
        setSavedPractices(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not read localStorage:", e);
    }
  }, []);

  // Determine time of day greeting
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return "Good morning, seeker.";
    if (hours < 17) return "Good afternoon, reflective heart.";
    return "Good evening, peaceful traveler.";
  };

  // Every consultation flows through the Amrita conversation. Structured
  // rituals arrive as in-line cards; opening one shows the full dashboard.
  const handleConsultCoach = (text: string) => {
    if (!text.trim()) return;
    setCurrentResult(null);
    setCurrentView('coach');
    sendMessage(text);
    setInputValue('');
  };

  const handleOpenRitual = (result: RecommendationResult) => {
    setCurrentResult(result);
    setActivePracticeId(`temp_${Date.now()}`);
  };

  // Handle Bookmarks Management
  const handleToggleSave = () => {
    if (!currentResult || !activePracticeId) return;

    const exists = savedPractices.find(p => p.id === activePracticeId || p.result.primaryEnergy === currentResult.primaryEnergy);
    if (exists) {
      // Remove it
      const filtered = savedPractices.filter(p => p.id !== exists.id);
      setSavedPractices(filtered);
      localStorage.setItem('pranaveda_practices', JSON.stringify(filtered));
      showToast("Practice deleted from Saved list.", "info");
    } else {
      // Add it
      const newSaved: SavedPractice = {
        id: activePracticeId.startsWith('temp_') ? activePracticeId : `save_${Date.now()}`,
        title: currentResult.yogaPractice.title,
        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        query: inputValue || "Voice Wellness Consultation",
        category: 'Yoga',
        result: currentResult
      };
      
      const updated = [newSaved, ...savedPractices];
      setSavedPractices(updated);
      localStorage.setItem('pranaveda_practices', JSON.stringify(updated));
      showToast("Wellness ritual safely bookmarked.", "success");
    }
  };

  const handleSelectSavedPractice = (practice: SavedPractice) => {
    setCurrentResult(practice.result);
    setActivePracticeId(practice.id);
    setInputValue(practice.query);
  };

  const handleDeleteSavedPractice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = savedPractices.filter(p => p.id !== id);
    setSavedPractices(filtered);
    localStorage.setItem('pranaveda_practices', JSON.stringify(filtered));
    if (activePracticeId === id) {
      setActivePracticeId(null);
    }
  };

  const handleSelectSuggestion = (text: string) => {
    setInputValue(text);
    handleConsultCoach(text);
  };

  // Check if currentResult is already bookmarked
  const isResultSaved = () => {
    if (!currentResult) return false;
    return savedPractices.some(p => p.result.primaryEnergy === currentResult.primaryEnergy);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between font-sans text-stone-900 relative">
      {/* 1. Dynamic Ambient Background */}
      <PranaBackground />

      {/* 2. Brand Header Panel */}
      <header className="w-full max-w-7xl mx-auto px-5 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 z-10 relative">
        <button onClick={() => { setCurrentResult(null); setCurrentView('coach'); }} className="cursor-pointer" aria-label="Go to home">
          <Logo size="md" />
        </button>
        
        <div className="flex items-center gap-2 bg-white/40 p-1 rounded-2xl border border-white/60 shadow-xs w-full sm:w-auto max-w-[360px]">
          <div
            className="relative"
            onMouseEnter={handleAmritaMouseEnter}
            onMouseLeave={handleAmritaMouseLeave}
          >
            <button
              onClick={() => setCurrentView('coach')}
              className={`flex-1 sm:flex-none py-2 px-3 sm:px-5 rounded-xl text-[12px] sm:text-[14px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                currentView === 'coach'
                  ? 'bg-[#8A79A5]/90 text-white shadow-sm'
                  : 'text-stone-550 hover:text-stone-900'
              }`}
            >
              Ask Amrita
            </button>
            <AnimatePresence>
              {showAmritaHint && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  className="absolute top-full left-0 mt-2 whitespace-nowrap text-[12px] sm:text-[14px] font-sans text-[#8A79A5] pointer-events-none"
                >
                  Amrita is your AI wellness companion.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          
          <button
            onClick={() => setCurrentView('recovery')}
            className={`flex-1 sm:flex-none py-2 px-3 sm:px-5 rounded-xl text-[12px] sm:text-[14px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              currentView === 'recovery'
                ? 'bg-[#8A79A5]/90 text-white shadow-sm'
                : 'text-stone-550 hover:text-stone-900'
            }`}
          >
            Recovery & Trends
          </button>
        </div>
      </header>

      {/* 3. Main Central App Area */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-7xl mx-auto z-10 relative">
        <AnimatePresence mode="wait">

          {/* RECOVERY DASHBOARD SCREEN */}
          {currentView === 'recovery' && (
            <motion.div
              key="recovery-dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full"
            >
              <RecoveryTrends showNotification={showToast} />
            </motion.div>
          )}
 
          {/* RESULTS DASHBOARD SCREEN */}
          {currentView === 'coach' && currentResult && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full"
            >
              <CoachingDashboard
                result={currentResult}
                onBack={() => setCurrentResult(null)}
                isSaved={isResultSaved()}
                onToggleSave={handleToggleSave}
                showNotification={showToast}
              />
            </motion.div>
          )}

          {/* AMRITA CONVERSATION THREAD */}
          {currentView === 'coach' && !currentResult && chatItems.length > 0 && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full"
            >
              <AmritaChat
                items={chatItems}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onOpenRitual={handleOpenRitual}
                onOpenVoice={() => setShowVoiceModal(true)}
                onReset={resetConversation}
              />
            </motion.div>
          )}

          {/* INITIAL WELCOME SCREEN (Soma Input Console) */}
          {currentView === 'coach' && !currentResult && chatItems.length === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center w-full px-5 sm:px-6 text-center space-y-10 sm:space-y-12"
            >
              
              {/* Editorial Display Intro */}
              <div className="space-y-4 max-w-2xl mt-8 sm:mt-12">
                <span className="p-1.5 px-4 rounded-full text-[12px] font-mono tracking-[0.2em] font-bold bg-[#E8E1F2]/80 text-stone-700 uppercase shadow-xs">
                  Personalized yoga and Ayurvedic guidance, powered by AI.
                </span>
                
                <h1 className="text-4xl sm:text-[54px] font-serif font-normal italic text-[#2D3436] tracking-tight leading-tight">
                  {getGreeting()}
                </h1>

                <p className="text-base sm:text-lg font-light text-[#2D3436]/60 leading-relaxed max-w-xl mx-auto font-sans">
                  Tell me how you feel, and I'll suggest a practice that fits your body, energy, and goals.
                </p>
              </div>

              {/* Major Input Area (The Soma Input Circle Container) */}
              <div className="w-full max-w-2xl space-y-5">
                <div className="text-[12px] tracking-[0.15em] font-mono text-[#2D3436]/40 uppercase font-bold">
                  How are you feeling today?
                </div>

                {/* Highly structured rounded input capsule */}
                <div
                  className="relative flex items-center bg-white/60 backdrop-blur-[20px] rounded-[40px] border border-white/80 p-3 sm:p-3.5 px-5 sm:px-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:bg-white/80 hover:border-white hover:shadow-[0_12px_36px_rgba(138,121,165,0.15)] focus-within:border-[#8A79A5]/40 focus-within:shadow-[0_12px_36px_rgba(138,121,165,0.2)] transition-all duration-300 group"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConsultCoach(inputValue);
                    }}
                    placeholder="Tell Amrita how you're feeling..."
                    aria-label="Tell Amrita how you're feeling"
                    className="w-full min-w-0 bg-transparent border-none text-[#2D3436] placeholder-[#2D3436]/30 font-sans text-base sm:text-[18px] focus-visible:outline-none focus-visible:ring-0 mr-3 sm:mr-4 py-1"
                  />

                  {/* Micro Buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <motion.button
                      onClick={() => setShowVoiceModal(true)}
                      aria-label="Activate voice consultation"
                      className="p-3 rounded-full bg-white border border-black/5 hover:bg-[#E8E1F2] text-stone-700 cursor-pointer shadow-md"
                      title="Activate voice consultation"
                      whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                      whileTap={prefersReducedMotion ? {} : { scale: 0.88 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    >
                      <Mic className="w-4 h-4 text-stone-600 flex-shrink-0" />
                    </motion.button>
                    
                    <button
                      onClick={() => handleConsultCoach(inputValue)}
                      aria-label="Consult Coach"
                      className="p-3 rounded-full bg-[#2D3436] border border-stone-800 text-white hover:bg-stone-700 transition-all cursor-pointer shadow-md hover:scale-105 flex items-center justify-center"
                      title="Consult Coach"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sugges-chips list (chip-cloud) */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-3 max-w-3xl mx-auto pb-4 sm:pb-0">
                  {[
                    "I haven't been sleeping well lately",
                    "I feel stressed and overwhelmed",
                    "My lower back feels tight",
                    "Help me create a morning yoga practice",
                    "What does Ayurveda suggest for low energy?"
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleSelectSuggestion(chip)}
                      className="py-2.5 px-6 rounded-[30px] bg-white/40 border border-white/60 hover:bg-white text-sm text-[#2D3436] transition-all duration-300 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:-translate-y-0.5 cursor-pointer font-sans"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary elements (Daily details, saved archives) */}
              <WellnessInsight
                savedPractices={savedPractices}
                onSelectPractice={handleSelectSavedPractice}
                onDeletePractice={handleDeleteSavedPractice}
                onSelectSuggestion={handleSelectSuggestion}
              />

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* 4. Advanced Vocal overlay Modal */}
      <VoiceModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSubmitPrompt={(text) => {
          setInputValue(text);
          handleConsultCoach(text);
        }}
      />

      {/* 5. Minimal Human Footer */}
      <footer className="w-full text-center py-6 text-[12px] font-mono tracking-widest text-[#8A79A5]/60 z-10 relative">
        PRANAVEDA · ANCIENT WISDOM OF YOGA AND AYURVEDA PERSONALIZED FOR YOU · © 2026
      </footer>

      {/* 6. Custom Elegant Floating Glassmorphism Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 p-4 px-5 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center gap-3.5 max-w-sm font-sans transition-all duration-300 ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-100 border-emerald-800/80 shadow-emerald-950/10'
                : notification.type === 'warn'
                  ? 'bg-rose-950/90 text-rose-100 border-rose-800/80 shadow-rose-950/10'
                  : 'bg-stone-900/90 text-stone-100 border-stone-800/80 shadow-stone-950/10'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
            {notification.type === 'warn' && <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />}
            {notification.type === 'info' && <Info className="w-5 h-5 text-indigo-300 flex-shrink-0" />}
            
            <p className="text-[12.5px] leading-relaxed flex-1 font-medium">{notification.message}</p>
            
            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded-full text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
