import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Moon, 
  Wind, 
  Accessibility, 
  Activity, 
  Layers, 
  PlusCircle, 
  Check, 
  RefreshCw, 
  Video, 
  Camera, 
  Sparkles, 
  Heart, 
  ChevronRight, 
  Calendar,
  AlertCircle,
  Award,
  Flame,
  Trophy
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  BarChart, 
  Bar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar,
  ComposedChart,
  Line
} from 'recharts';

interface LogRecord {
  date: string;
  recoveryScore: number;
  sleepHours: number;
  sleepQuality: number; // 1 - 10
  breathRetentionSeconds: number;
  breathingScore: number; // 1 - 10
  postureScore: number; // 1 - 10
  vata: number;
  pitta: number;
  kapha: number;
}

const DEFAULT_METRICS: LogRecord[] = [
  { date: 'Jun 05', recoveryScore: 78, sleepHours: 6.8, sleepQuality: 7, breathRetentionSeconds: 24, breathingScore: 6, postureScore: 7, vata: 40, pitta: 40, kapha: 20 },
  { date: 'Jun 06', recoveryScore: 82, sleepHours: 7.2, sleepQuality: 8, breathRetentionSeconds: 28, breathingScore: 7, postureScore: 8, vata: 35, pitta: 45, kapha: 20 },
  { date: 'Jun 07', recoveryScore: 75, sleepHours: 6.0, sleepQuality: 6, breathRetentionSeconds: 22, breathingScore: 5, postureScore: 7, vata: 50, pitta: 35, kapha: 15 },
  { date: 'Jun 08', recoveryScore: 88, sleepHours: 8.0, sleepQuality: 9, breathRetentionSeconds: 32, breathingScore: 8, postureScore: 9, vata: 30, pitta: 40, kapha: 30 },
  { date: 'Jun 09', recoveryScore: 85, sleepHours: 7.4, sleepQuality: 8, breathRetentionSeconds: 30, breathingScore: 7, postureScore: 8, vata: 35, pitta: 35, kapha: 30 },
  { date: 'Jun 10', recoveryScore: 91, sleepHours: 7.8, sleepQuality: 9, breathRetentionSeconds: 35, breathingScore: 9, postureScore: 9, vata: 25, pitta: 45, kapha: 30 },
  { date: 'Jun 11', recoveryScore: 94, sleepHours: 8.2, sleepQuality: 10, breathRetentionSeconds: 40, breathingScore: 10, postureScore: 9.5, vata: 30, pitta: 35, kapha: 35 }
];

interface RecoveryTrendsProps {
  showNotification?: (message: string, type: 'info' | 'success' | 'warn') => void;
}

export default function RecoveryTrends({ showNotification }: RecoveryTrendsProps = {}) {
  const [activeTab, setActiveTab] = useState<'trends' | 'sleep' | 'breathing' | 'posture' | 'pulse'>('trends');
  const [metrics, setMetrics] = useState<LogRecord[]>(() => {
    try {
      const stored = localStorage.getItem('pranaveda_recovery_metrics');
      return stored ? JSON.parse(stored) : DEFAULT_METRICS;
    } catch {
      return DEFAULT_METRICS;
    }
  });

  // Habit builder, accomplishments, and reward simulation states based on customer mockup
  const [completedHabits, setCompletedHabits] = useState<string[]>(['breath']);
  const [streakCount, setStreakCount] = useState<number>(5);
  const [mindfulnessIntensity, setMindfulnessIntensity] = useState<'beginner' | 'steady' | 'yogi'>('steady');
  const [rewardClaimed, setRewardClaimed] = useState<string | null>(null);

  // Exact weekly correlation values to demonstrate behavior change (as seen in Mockup 2 caption)
  const getCorrelationData = () => {
    switch (mindfulnessIntensity) {
      case 'beginner':
        return [
          { name: 'Week 1', sleep: 52, mindfulness: 1.0, label: 'Unsettled rest' },
          { name: 'Week 2', sleep: 55, mindfulness: 1.3, label: 'High Vata' },
          { name: 'Week 3', sleep: 58, mindfulness: 1.0, label: 'Restless mind' },
          { name: 'Week 4', sleep: 60, mindfulness: 1.5, label: 'Marginal fatigue' }
        ];
      case 'steady':
        return [
          { name: 'Week 1', sleep: 55, mindfulness: 1.5, label: 'Restless mind' },
          { name: 'Week 2', sleep: 65, mindfulness: 2.8, label: 'Gentle Ojas rise' },
          { name: 'Week 3', sleep: 74, mindfulness: 3.8, label: 'Deep restorative' },
          { name: 'Week 4', sleep: 82, mindfulness: 4.5, label: 'Optimum Ojas active' }
        ];
      case 'yogi':
        return [
          { name: 'Week 1', sleep: 58, mindfulness: 2.0, label: 'Ojas emerging' },
          { name: 'Week 2', sleep: 72, mindfulness: 4.2, label: 'Deep restorative' },
          { name: 'Week 3', sleep: 85, mindfulness: 5.2, label: 'Samadhi stillness' },
          { name: 'Week 4', sleep: 94, mindfulness: 6.0, label: 'Exquisite cellular sync' }
        ];
    }
  };

  // Heart Rate Variability weekly data points replicating Mockup 1 & 2 column bars exactly
  const HRV_DATA = [
    { name: 'M', hrv: 50 },
    { name: 'T', hrv: 20 },
    { name: 'W', hrv: 12 },
    { name: 'T', hrv: 22 },
    { name: 'F', hrv: 48 },
    { name: 'S', hrv: 10 },
    { name: 'S', hrv: 40 }
  ];

  // Daily log form state
  const [formOpen, setFormOpen] = useState(false);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [sleepQuality, setSleepQuality] = useState(8);
  const [retentionSec, setRetentionSec] = useState(30);
  const [vataVal, setVataVal] = useState(30);
  const [pittaVal, setPittaVal] = useState(40);
  const [kaphaVal, setKaphaVal] = useState(30);

  // Breathing test session state
  const [breathState, setBreathState] = useState<'idle' | 'inhale' | 'hold' | 'exhale' | 'done'>('idle');
  const [breathTimer, setBreathTimer] = useState(0);
  const [breathResult, setBreathResult] = useState<number | null>(null);
  const breathIntervalRef = useRef<number | null>(null);

  // Posture Scanner State
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerProgress, setScannerProgress] = useState<'idle' | 'linking' | 'measuring' | 'complete'>('idle');
  const [scanMetrics, setScanMetrics] = useState({
    spineAlign: 0,
    shoulderBalance: 0,
    neckExtension: 0,
    hipsLeveled: 0,
    overall: 0
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Pulse Scanner state
  const [pulseReading, setPulseReading] = useState(false);
  const [pulseProgress, setPulseProgress] = useState(0);
  const [pulsePattern, setPulsePattern] = useState<'Vata' | 'Pitta' | 'Kapha' | null>(null);
  const [pulseDetails, setPulseDetails] = useState<string>('');
  const [pulseRate, setPulseRate] = useState(0);

  // Persist metrics
  useEffect(() => {
    localStorage.setItem('pranaveda_recovery_metrics', JSON.stringify(metrics));
  }, [metrics]);

  // Breathing Timer Effect
  useEffect(() => {
    if (breathState === 'hold') {
      breathIntervalRef.current = window.setInterval(() => {
        setBreathTimer(prev => prev + 1);
      }, 1000);
    } else {
      if (breathIntervalRef.current) {
        clearInterval(breathIntervalRef.current);
        breathIntervalRef.current = null;
      }
    }
    return () => {
      if (breathIntervalRef.current) clearInterval(breathIntervalRef.current);
    };
  }, [breathState]);

  // Pulse reader timing simulated
  useEffect(() => {
    let interval: number;
    if (pulseReading) {
      interval = window.setInterval(() => {
        setPulseProgress(prev => {
          if (prev >= 100) {
            setPulseReading(false);
            const patterns: ('Vata' | 'Pitta' | 'Kapha')[] = ['Vata', 'Pitta', 'Kapha'];
            const rand = patterns[Math.floor(Math.random() * patterns.length)];
            setPulsePattern(rand);
            if (rand === 'Vata') {
              setPulseRate(Math.floor(Math.random() * 12) + 78); // Rapid, snake-like pulse
              setPulseDetails('Vata Pulse (Nadi): Fast, cold, and undulating like a snake. Indicates a highly active nervous system needing quiet reflection and protective warmth.');
            } else if (rand === 'Pitta') {
              setPulseRate(Math.floor(Math.random() * 10) + 68); // Jumping, frog-like pulse
              setPulseDetails('Pitta Pulse (Nadi): Elastic, bouncing, and clear like a jumping frog. Reflects focused cellular heat and metabolic energy craving grounding cooling practices.');
            } else {
              setPulseRate(Math.floor(Math.random() * 10) + 57); // Steady, swan-like pulse
              setPulseDetails('Kapha Pulse (Nadi): Deep, steady, slow and graceful like a swimming swan. Reflects physical stability, grounding water retention, and heart coherence.');
            }
            return 100;
          }
          return prev + 5;
        });
      }, 150);
    }
    return () => clearInterval(interval);
  }, [pulseReading]);

  // Handle stream setup for posture scan
  const startCamera = async () => {
    setCameraActive(true);
    setScannerProgress('linking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setScannerProgress('measuring');
          triggerPostureAnalysis();
        };
      }
    } catch (err) {
      console.warn("Camera streaming not permitted in environment. Initializing high-precision digital mockup scanner instead.", err);
      setScannerProgress('measuring');
      triggerPostureAnalysis();
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setScannerProgress('idle');
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const triggerPostureAnalysis = () => {
    let tickCount = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    const drawOverlay = () => {
      if (scannerProgress === 'idle') return;
      
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw computer vision landmarks
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Draw head
        ctx.beginPath();
        ctx.arc(centerX, centerY - 60, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(138, 121, 165, 0.25)';
        ctx.strokeStyle = '#8A79A5';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        
        // Spine flow line
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 40);
        ctx.bezierCurveTo(centerX + Math.sin(tickCount * 0.1) * 5, centerY, centerX, centerY + 80, centerX, centerY + 120);
        ctx.strokeStyle = '#A66C5E';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#A66C5E';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
        
        // Shoulders line
        ctx.beginPath();
        ctx.moveTo(centerX - 55, centerY - 15);
        ctx.lineTo(centerX + 55, centerY - 13 + Math.cos(tickCount * 0.05) * 3);
        ctx.strokeStyle = '#8A79A5';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Joint highlight nodes
        const joints = [
          { x: centerX, y: centerY - 40, label: 'Nose/Neck' },
          { x: centerX - 55, y: centerY - 15, label: 'L Shoulder' },
          { x: centerX + 55, y: centerY - 11, label: 'R Shoulder' },
          { x: centerX, y: centerY + 40, label: 'Thoracic' },
          { x: centerX - 40, y: centerY + 120, label: 'L Hip' },
          { x: centerX + 40, y: centerY + 120, label: 'R Hip' }
        ];

        joints.forEach(j => {
          ctx.beginPath();
          ctx.arc(j.x, j.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#C49A76';
          ctx.strokeStyle = '#FFFFFF';
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#C49A76';
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Info labels
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = '9px monospace';
          ctx.fillText(j.label, j.x + 10, j.y + 3);
        });

        // Add telemetry labels in corners
        ctx.fillStyle = 'rgba(138, 121, 165, 0.95)';
        ctx.font = 'bold 11px monospace';
        ctx.fillText("SKELETAL MAP ACTIVE", 15, 25);
        
        ctx.fillStyle = 'rgba(166, 108, 94, 0.9)';
        ctx.font = '9px monospace';
        ctx.fillText(`SPINE DEVIATION: ${(Math.sin(tickCount * 0.1) * 2.3).toFixed(1)}°`, 15, 42);
        ctx.fillText(`ALIGNMENT CONFIDENCE: ${(92 + Math.cos(tickCount * 0.05) * 3).toFixed(0)}%`, 15, 56);
      }
      
      tickCount++;
      if (tickCount < 140) {
        animationFrameRef.current = requestAnimationFrame(drawOverlay);
      } else {
        // Compute finalized calibration
        setScannerProgress('complete');
        const calculatedOverall = Math.floor(Math.random() * 11) + 88; // 88 - 98
        setScanMetrics({
          spineAlign: Math.floor(Math.random() * 8) + 91,
          shoulderBalance: Math.floor(Math.random() * 10) + 89,
          neckExtension: Math.floor(Math.random() * 6) + 93,
          hipsLeveled: Math.floor(Math.random() * 8) + 90,
          overall: calculatedOverall
        });
        
        // Push a fresh posture log into daily metrics
        setMetrics(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              postureScore: Number((calculatedOverall / 10).toFixed(1))
            };
          }
          return updated;
        });
      }
    };

    drawOverlay();
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const handleStartBreathExam = () => {
    setBreathState('inhale');
    setBreathTimer(0);
    setBreathResult(null);
    let count = 0;
    
    // Auto sequence inhale for 4s, then hold
    const interval = window.setInterval(() => {
      count++;
      if (count === 4) {
        clearInterval(interval);
        setBreathState('hold');
        setBreathTimer(0);
      }
    }, 1000);
  };

  const handleStopBreathExam = () => {
    const finalSeconds = breathTimer;
    setBreathResult(finalSeconds);
    setBreathState('done');
    
    // Evaluate relative breathing efficiency coefficient (1-10)
    let score = 5;
    if (finalSeconds > 35) score = 10;
    else if (finalSeconds > 28) score = 9;
    else if (finalSeconds > 22) score = 8;
    else if (finalSeconds > 16) score = 7;
    else if (finalSeconds > 10) score = 6;
    
    setMetrics(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = {
          ...last,
          breathRetentionSeconds: finalSeconds,
          breathingScore: score,
          recoveryScore: Math.min(100, Math.floor((last.sleepQuality * 5) + (score * 5)))
        };
      }
      return updated;
    });
  };

  const submitLog = (e: React.FormEvent) => {
    e.preventDefault();
    const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    
    // Check if entry for today already exists, if so merge/update, else push
    const recScore = Math.min(100, Math.floor((sleepQuality * 5) + (vataVal / 10 + pittaVal / 10 + kaphaVal / 10) * 5));
    
    const newRecord: LogRecord = {
      date: todayStr,
      recoveryScore: recScore,
      sleepHours: Number(sleepHours),
      sleepQuality: Number(sleepQuality),
      breathRetentionSeconds: Number(retentionSec),
      breathingScore: Math.min(10, Math.ceil(retentionSec / 4)),
      postureScore: 8,
      vata: vataVal,
      pitta: pittaVal,
      kapha: kaphaVal
    };

    // Filter old same days to avoid cloning
    const filtered = metrics.filter(m => m.date !== todayStr);
    const updated = [...filtered, newRecord];
    setMetrics(updated);
    setFormOpen(false);
  };

  const currentStatus = metrics[metrics.length - 1] || DEFAULT_METRICS[6];

  const getDoshaStatusOverview = () => {
    const { vata, pitta, kapha } = currentStatus;
    if (vata > pitta && vata > kapha) {
      return {
        title: "Vata Dominance (Wind / Ether)",
        description: "Your systems reflect high etheric kinetic flow. Focus on grounding practices like box-breathing, hot spiced herbal tea, and slower alignment sequences to warm the bones and settle a busy headspace.",
        color: "bg-blue-50/70 text-blue-800 border-blue-100"
      };
    }
    if (pitta > vata && pitta > kapha) {
      return {
        title: "Pitta Dominance (Fire / Water)",
        description: "Your internal flame is burning bright. Focus on metabolic cooling, cooling Chandra Pranayama (left Nostril breathing), lunar-focused yoga, and sweet refreshing fruits with mint to temper heat.",
        color: "bg-orange-50/70 text-orange-850 border-orange-100"
      };
    }
    return {
      title: "Kapha Dominance (Earth / Water5)",
      description: "An abundance of grounding water and structural stability is present. Focus on activating energy flows, heating pranayamas (Kapalabhati), and dynamic posture flows to stimulate sluggish digestion or low energy.",
      color: "bg-[#FBEDE9]/80 text-[#A66C5E] border-stone-100"
    };
  };

  const doshaMeta = getDoshaStatusOverview();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      
      {/* Visual Diagnostic Banner */}
      <div className="bg-white/45 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-white/70 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="p-1 px-3 text-[10px] uppercase font-mono tracking-widest bg-[#E8E1F2] text-[#8A79A5] font-bold rounded-full">
              Soma Biometrics
            </span>
            <span className="p-1 px-3 text-[10px] uppercase font-mono tracking-widest bg-stone-100 text-stone-500 font-bold rounded-full border border-stone-250/20">
              Personalized Sync
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-light text-stone-850 leading-tight">
            Holistic Recovery Dashboard
          </h2>
          <p className="text-stone-600 text-xs sm:text-sm font-light leading-relaxed">
            Assess posture alignment with glowing skeletal AI mappings, test breath holding coefficient thresholds live, sync touch-pulse vitals, and track your daily sleep-breathing indices.
          </p>
        </div>

        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1.5 p-3 px-5 text-xs font-mono font-bold tracking-wider uppercase bg-[#2D3436] hover:bg-stone-700 text-white rounded-xl shadow-md cursor-pointer transition-all hover:scale-102 flex-shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Log Today's Metrics
        </button>
      </div>

      {/* Main Internal Tab Selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/50 pb-2">
        {[
          { id: 'trends', label: 'Overview & Trends', icon: TrendingUp },
          { id: 'sleep', label: 'Sleep Tracker', icon: Moon },
          { id: 'breathing', label: 'Breathing Capacity', icon: Wind },
          { id: 'posture', label: 'AI Posture Scan', icon: Accessibility },
          { id: 'pulse', label: 'Pulse Diagnosis', icon: Activity }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id !== 'posture') stopCamera();
              }}
              className={`flex items-center gap-2 py-3 px-5 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                active 
                  ? 'bg-white border border-stone-200 text-[#8A79A5] shadow-xs' 
                  : 'text-stone-500 hover:text-stone-900 border border-transparent hover:bg-white/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        
        {/* TABS 1: TRENDS & CHARTS */}
        {activeTab === 'trends' && (
          <motion.div
            key="trends-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left Metrics Cards List */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Score card */}
              <div className="bg-white/55 backdrop-blur-md border border-white/70 p-6 rounded-2xl shadow-xs space-y-4">
                <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block">
                  Today's Synthesis Score
                </span>
                
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl md:text-6xl font-serif font-light text-stone-850">
                    {currentStatus.recoveryScore}%
                  </span>
                  <span className="text-xs uppercase font-mono font-bold text-green-600 bg-green-50 p-1 px-2 rounded-md">
                    +3% Optimum
                  </span>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-stone-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-500 font-mono">Sleep Index:</span>
                    <span className="font-semibold text-stone-800">{currentStatus.sleepQuality}/10 ({currentStatus.sleepHours} hrs)</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-500 font-mono">Breathing Coherence:</span>
                    <span className="font-semibold text-stone-800">{currentStatus.breathingScore}/10</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-500 font-mono">Posture Orthostatic Balance:</span>
                    <span className="font-semibold text-stone-800">{(currentStatus.postureScore * 10).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {/* Active Streaks & Habit Accomplishments (Replicating User Posture Pro 5-Day Streak Mockup!) */}
              <div className="bg-gradient-to-br from-[#FBEDE9]/75 via-[#FBEDE9]/40 to-white/20 border border-[#C8815A]/20 p-6 rounded-2xl shadow-xs space-y-4 relative overflow-hidden">
                <div className="absolute top-[-10px] right-[-10px] opacity-10">
                  <Flame className="w-24 h-24 text-[#C8815A]" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <Flame className="w-4 h-4 text-[#C8815A] fill-[#C8815A]/60 animate-pulse" />
                    <span className="text-[10px] font-mono tracking-widest text-[#C8815A] uppercase font-bold">
                      Habit Streak
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#8A79A5] bg-[#E8E1F2] p-0.5 px-2 rounded-md font-bold">
                    Posture Pro Active
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="text-lg font-serif font-extrabold text-stone-850">
                    Posture Pro: {streakCount}-Day Streak!
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-sans font-light">
                    You've achieved perfect yoga postures for {streakCount} days in a row! Treat yourself to a refreshing smoothie today. Keep going—you're building a lasting habit.
                  </p>
                </div>

                {/* Milestone Reward Box with Claim Trigger */}
                <div className="p-3 bg-white/70 backdrop-blur-xs border border-[#C8815A]/20 rounded-xl flex gap-2.5">
                  <Award className="w-5 h-5 text-[#C8815A] flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono font-bold text-[#C8815A] uppercase block">Rewards Checklist</span>
                    <p className="text-[11px] text-stone-700 font-medium">
                      {rewardClaimed ? `${rewardClaimed} 🎉` : "Complete today's 3 actions to unlock your organic elixir!"}
                    </p>
                  </div>
                </div>

                {/* Interactive Action Items to complete the loop */}
                <div className="pt-2 border-t border-[#C8815A]/20 space-y-2">
                  <span className="text-[9px] font-mono text-stone-400 font-bold uppercase block">Daily Micro-Habits</span>
                  {[
                    { id: 'breath', label: '1. Complete Breathholding Test' },
                    { id: 'posture', label: '2. Perform AI Skeletal Posture Scan' },
                    { id: 'pulse', label: '3. Perform Radial Pulse Nadi Scan' }
                  ].map((habit) => {
                    const completed = completedHabits.includes(habit.id);
                    return (
                      <button
                        key={habit.id}
                        type="button"
                        onClick={() => {
                          if (completed) {
                            setCompletedHabits(prev => prev.filter(h => h !== habit.id));
                          } else {
                            const updated = [...completedHabits, habit.id];
                            setCompletedHabits(updated);
                            // Visual reward trigger when all 3 completed
                            if (updated.length === 3) {
                              setStreakCount(6);
                              setRewardClaimed("Gold Crown Ginger-Mint Elixir Unlocked!");
                            }
                          }
                        }}
                        className="w-full flex items-center justify-between text-left p-2.5 bg-white/45 hover:bg-white/80 border border-stone-200/30 rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        <span className={`font-mono text-[11px] ${completed ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                          {habit.label}
                        </span>
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${completed ? 'bg-[#8A79A5] border-[#8A79A5] text-white' : 'border-stone-300 bg-white/60'}`}>
                          {completed && <Check className="w-3 h-3 stroke-[2.5px]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dominant Dosha Card */}
              <div className={`border p-6 rounded-2xl shadow-xs space-y-3.5 ${doshaMeta.color}`}>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  <span className="text-[10px] font-mono tracking-widest uppercase font-bold">
                    Vital Dosha Balance
                  </span>
                </div>
                <h4 className="text-lg font-serif font-bold tracking-tight">
                  {doshaMeta.title}
                </h4>
                <p className="text-xs leading-relaxed font-sans font-normal opacity-85">
                  {doshaMeta.description}
                </p>
                <div className="flex gap-2 pt-1 font-mono text-[9px] uppercase font-bold">
                  <span className="p-1 px-2 bg-white/40 border border-white/20 rounded-md text-stone-700">Vata: {currentStatus.vata}%</span>
                  <span className="p-1 px-2 bg-white/40 border border-white/20 rounded-md text-stone-700 font-semibold text-[8px]">Pitta: {currentStatus.pitta}%</span>
                  <span className="p-1 px-2 bg-white/40 border border-white/20 rounded-md text-stone-700 font-semibold text-[8px]">Kapha: {currentStatus.kapha}%</span>
                </div>
              </div>

            </div>

            {/* Right Rich Charts Grid (Recharts) */}
            <div className="lg:col-span-2 space-y-8 bg-white/45 backdrop-blur-md border border-white/70 p-6 rounded-3xl shadow-xs">
              
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-lg font-serif font-light text-stone-850">
                    Integration & Recovery Trends
                  </h3>
                  <p className="text-xs text-stone-500 font-mono">
                    Historical 7-day vitals from customized wellness assessments
                  </p>
                </div>
              </div>

              {/* 1. Recovery Score Area Chart */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider font-mono text-stone-400 font-bold block">
                  1. Synthesis Index Recovery Score Trend (%)
                </span>
                <div className="h-60 w-full bg-white/50 rounded-xl p-2 border border-stone-100/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics}>
                      <defs>
                        <linearGradient id="colorRecovery" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8A79A5" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#8A79A5" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEFF1" />
                      <XAxis dataKey="date" stroke="#90A4AE" fontSize={10} fontStyle="italic" />
                      <YAxis domain={[50, 100]} stroke="#90A4AE" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #ECEFF1', fontSize: '11px' }} />
                      <Area type="monotone" dataKey="recoveryScore" name="Synthesis Level %" stroke="#8A79A5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRecovery)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 2. Interactive Correlation Model (Ojas Sleep vs. Mindfulness, Replicating Mockup 2) */}
              <div className="space-y-3 bg-gradient-to-br from-stone-50/40 to-stone-100/20 p-4 rounded-2xl border border-stone-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-[#8A79A5] font-bold block">
                      2. Activity-Accomplishment Correlation (Mockup 2)
                    </span>
                    <h4 className="text-md font-serif font-bold text-stone-850 mt-0.5">
                      Mindfulness Intensity vs. Sleep Accomplishments
                    </h4>
                  </div>
                  {/* Toggle buttons to simulate behavior change */}
                  <div className="flex bg-white border border-stone-200 p-1 rounded-xl text-[10px] font-mono gap-1">
                    {[
                      { id: 'beginner', label: 'Gentle (1-2x/wk)' },
                      { id: 'steady', label: 'Steady (3-4x/wk)' },
                      { id: 'yogi', label: 'Yogi (5x+/wk)' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setMindfulnessIntensity(mode.id as any)}
                        className={`p-1.5 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${
                          mindfulnessIntensity === mode.id
                            ? 'bg-[#8A79A5] text-white shadow-xs'
                            : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-56 w-full bg-white/50 rounded-xl p-2.5 border border-stone-150/30">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={getCorrelationData()}>
                      <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#ECEFF1" />
                      <XAxis dataKey="name" stroke="#90A4AE" fontSize={10} />
                      <YAxis yAxisId="left" stroke="#A66C5E" fontSize={10} domain={[40, 100]} label={{ value: 'Sleep Score', angle: -90, position: 'insideLeft', style: {fontSize: 8, fill: '#A66C5E'} }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#8A79A5" fontSize={10} label={{ value: 'Mindfulness (hrs)', angle: 90, position: 'insideRight', style: {fontSize: 8, fill: '#8A79A5'} }} />
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-xl space-y-1 font-sans text-xs">
                              <p className="font-bold text-stone-850">{payload[0].payload.name}</p>
                              <p className="font-semibold text-[#A66C5E]">Rest Quality: {payload[0].value}% ({payload[0].payload.label})</p>
                              <p className="font-semibold text-[#8A79A5]">Mindfulness: {payload[1].value} hrs</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Bar yAxisId="right" dataKey="mindfulness" name="Mindfulness Sessions" fill="#D3C9E3" barSize={35} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="sleep" name="Sleep Score" stroke="#A66C5E" strokeWidth={3.5} dot={{ r: 5, fill: "#A66C5E" }} activeDot={{ r: 8 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="p-3 bg-amber-50/40 border border-amber-100/30 rounded-xl space-y-1">
                  <p className="text-xs text-[#A66C5E] font-medium font-serif italic">
                    "Sleep Quality: As you become more consistent with mindfulness activities (last 4 weeks), average quality of sleep increased as well."
                  </p>
                  <p className="text-[11px] text-stone-500 font-sans">
                    Accomplishment Correlation Index: <strong className="text-green-600">Perfect Cohesion</strong>. Practicing steady pranayama and somatic postures aligns with parasympathetic dominance, boosting restorative delta-sleep waves.
                  </p>
                </div>
              </div>

              {/* 3. HRV Side-by-Side with Breath/Sleep Grid (Mockup 1 & 2 bottom layout) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* HRV Custom weekly bars */}
                <div className="space-y-3 p-4 bg-stone-50/40 rounded-2xl border border-stone-100">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-[#A66C5E] font-bold block">
                      3. Recovery HRV Coherence (Mockup 1)
                    </span>
                    <h4 className="text-xs font-mono font-bold text-stone-600 mt-0.5">
                      Heart Rate Variability (HRV) Daily Rhythm
                    </h4>
                  </div>

                  <div className="h-40 w-full bg-white/50 rounded-xl p-2 border border-stone-100/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={HRV_DATA}>
                        <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#F1F3F4" />
                        <XAxis dataKey="name" stroke="#90A4AE" fontSize={9} />
                        <YAxis stroke="#90A4AE" fontSize={9} />
                        <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px' }} />
                        <Bar dataKey="hrv" name="HRV ms" fill="#F0C3B4" radius={[3, 3, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-2.5 bg-green-50/40 border border-green-100/30 rounded-lg">
                    <p className="text-[11px] text-green-700 font-medium font-serif leading-relaxed">
                      "Recovery Statistics: 15% improvement in back and neck pain. Keep it up!"
                    </p>
                  </div>
                </div>

                {/* Combined Sleep & Breath Status Tracker (maintaining features) */}
                <div className="space-y-3 p-4 bg-stone-50/40 rounded-2xl border border-stone-100">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-[#8A79A5] font-bold block">
                      4. Respiratory Capacity Tracker
                    </span>
                    <h4 className="text-xs font-mono font-bold text-stone-600 mt-0.5">
                      Breath Retention Capacity Index (s)
                    </h4>
                  </div>

                  <div className="h-40 w-full bg-white/50 rounded-xl p-2 border border-stone-100/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metrics}>
                        <defs>
                          <linearGradient id="colorBreath" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8A79A5" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#8A79A5" stopOpacity={0.01}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#ECEFF1" />
                        <XAxis dataKey="date" stroke="#90A4AE" fontSize={9} />
                        <YAxis stroke="#90A4AE" fontSize={9} />
                        <Tooltip />
                        <Area type="monotone" dataKey="breathRetentionSeconds" name="Retention Capacity (s)" stroke="#8A79A5" fillOpacity={1} strokeWidth={2} fill="url(#colorBreath)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="text-[10px] text-stone-500 font-mono text-center">
                    Retention time registers vital lung elasticity (Chid-Akasha).
                  </p>
                </div>

              </div>

            </div>
          </motion.div>
        )}

        {/* TABS 2: SLEEP TRACKER */}
        {activeTab === 'sleep' && (
          <motion.div
            key="sleep-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Left Educational Diagnostics Info */}
            <div className="bg-white/55 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs space-y-6">
              <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block">
                Ayurvedic Sleep Science
              </span>
              
              <h3 className="text-xl sm:text-2xl font-serif font-light text-stone-850">
                Understanding Ojas & Sleep quality
              </h3>

              <p className="text-[#2D3436]/70 text-sm leading-relaxed font-sans font-light">
                According to Ayurvedic texts, deep rest builds **Ojas** (vital spiritual immunity). The time you fall asleep dictates which planetary dosha coordinates digestion and restoration:
              </p>

              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100/30 flex gap-3.5">
                  <Moon className="w-5 h-5 text-[#8A79A5] flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-serif font-bold text-xs sm:text-sm text-stone-850 leading-tight">
                      Kapha Rest Cycle (10:00 PM – 2:00 AM)
                    </h5>
                    <p className="text-xs text-stone-500 leading-relaxed font-normal">
                      The premier window for physical restorative growth. Entering sleep by 10 PM primes deep-tissue repair pathways.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100/30 flex gap-3.5">
                  <Wind className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-serif font-bold text-xs sm:text-sm text-stone-850 leading-tight">
                      Pitta Liver Clearance (2:00 AM – 6:00 AM)
                    </h5>
                    <p className="text-xs text-stone-500 leading-relaxed font-normal">
                      During this phase, metabolic internal body cellular detoxification peaks. Waking late spikes residual mental fog.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-stone-50 border border-stone-200/50 rounded-2xl p-4 flex gap-3">
                <AlertCircle className="w-4 h-4 text-stone-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-stone-500 leading-relaxed font-serif italic">
                  "Slight insomnia or hyperactive dreams reflect a cold wind (Vata) displacement. Adding 10 drops of sesame oil to your feet before sleep grounds this kinetic energy."
                </p>
              </div>
            </div>

            {/* Interactive sleep calculator / log display */}
            <div className="bg-white/45 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs space-y-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block mb-2">
                  Sleep Diagnostics Form
                </span>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-stone-850">
                  Assess Sleep Quality Ratings
                </h3>
              </div>

              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <div className="flex justify-between font-mono text-xs font-semibold text-stone-600">
                    <span>How many hours did you sleep last night?</span>
                    <span className="text-[#8A79A5] font-bold">{sleepHours} Hours</span>
                  </div>
                  <input 
                    type="range" 
                    min="4" 
                    max="11" 
                    step="0.5"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    className="w-full accent-[#8A79A5]"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-stone-400">
                    <span>4 Hours (Vata Spiked)</span>
                    <span>8 Hours (Optimal Rest)</span>
                    <span>11 Hours (Kapha Spiked)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-mono text-xs font-semibold text-stone-600">
                    <span>Rate your sleep continuity/quality:</span>
                    <span className="text-[#8A79A5] font-bold">{sleepQuality}/10</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1"
                    value={sleepQuality}
                    onChange={(e) => setSleepQuality(Number(e.target.value))}
                    className="w-full accent-[#8A79A5]"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-stone-400">
                    <span>1 (Highly Restless)</span>
                    <span>5 (Average)</span>
                    <span>10 (Pure Bliss/Samadhi)</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setMetrics(prev => {
                    const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const updated = [...prev];
                    if (updated.length > 0) {
                      const last = updated[updated.length - 1];
                      updated[updated.length - 1] = {
                        ...last,
                        sleepHours: Number(sleepHours),
                        sleepQuality: Number(sleepQuality),
                        recoveryScore: Math.min(100, Math.floor((Number(sleepQuality) * 5) + (last.breathingScore * 5)))
                      };
                    }
                    return updated;
                  });
                  if (showNotification) {
                    showNotification("Sleep coordinates successfully updated inside synthesis charts!", "success");
                  } else {
                    alert("Sleep coordinates successfully updated inside synthesis charts!");
                  }
                }}
                className="w-full py-3 px-6 bg-[#8A79A5] hover:bg-[#72618F] text-white text-xs font-mono font-bold uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all"
              >
                Sync with Integration Trends
              </button>
            </div>
          </motion.div>
        )}

        {/* TABS 3: BREATHING CAPACITY TEST */}
        {activeTab === 'breathing' && (
          <motion.div
            key="breathing-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Test Console */}
            <div className="bg-white/45 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs flex flex-col justify-between min-h-[400px]">
              <div className="space-y-2">
                <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block">
                  Capacity Diagnostics
                </span>
                <h3 className="text-xl sm:text-2xl font-serif font-light text-stone-850">
                  Breath Capacity Timer
                </h3>
                <p className="text-stone-550 text-xs font-light leading-relaxed">
                  Test your current lung expansion efficiency and nervous system balance. Inhale fully, then press the trigger to hold. Hold for as long as safe and intuitive.
                </p>
              </div>

              {/* Breathing circle indicator animations */}
              <div className="flex flex-col items-center justify-center my-6 space-y-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  
                  {/* Wave expansion effect depending on state */}
                  {breathState === 'inhale' && (
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeOut" }}
                      className="absolute inset-0 bg-[#E8E1F2] rounded-full filter blur-md"
                    />
                  )}
                  {breathState === 'hold' && (
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-x-[-10px] bg-red-100/50 rounded-full filter blur-sm"
                    />
                  )}

                  <div className="w-28 h-28 rounded-full bg-white border border-stone-200 shadow-lg flex flex-col items-center justify-center z-10 text-center space-y-1">
                    <span className="text-[10px] font-mono uppercase text-stone-400 font-bold">
                      {breathState.toUpperCase()}
                    </span>
                    <span className="text-3xl font-serif font-light text-[#8A79A5]">
                      {breathTimer}s
                    </span>
                  </div>
                </div>

                <p className="text-[11px] font-mono text-stone-450 uppercase font-semibold text-center italic max-w-xs">
                  {breathState === 'idle' && "Press 'Start' & inhale deeply for 4 seconds"}
                  {breathState === 'inhale' && "Breathing In deeply... Fill the lungs."}
                  {breathState === 'hold' && "Holding. Keep shoulders loose, observe your pulse."}
                  {breathState === 'done' && `Test Complete! Retention span: ${breathResult} seconds.`}
                </p>
              </div>

              {/* Console Trigger buttons */}
              <div className="flex gap-4">
                {breathState === 'idle' || breathState === 'done' ? (
                  <button
                    onClick={handleStartBreathExam}
                    className="flex-1 py-3 bg-[#8A79A5] hover:bg-[#71608E] text-white text-xs font-mono font-bold uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all"
                  >
                    Start Breath Test
                  </button>
                ) : (
                  <button
                    onClick={handleStopBreathExam}
                    className="flex-1 py-3 bg-red-650 hover:bg-red-700 text-white text-xs font-mono font-bold uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all"
                  >
                    Press when you Exhale
                  </button>
                )}
              </div>
            </div>

            {/* Capacity Diagnostic Results context */}
            <div className="bg-white/55 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs space-y-6">
              <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block">
                Breathing Vitals Report
              </span>
              <h3 className="text-xl sm:text-2xl font-serif font-light text-stone-850">
                Resonance Coefficient Analysis
              </h3>

              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center p-3.5 bg-stone-50 rounded-xl border border-stone-100/50">
                  <span className="text-xs font-mono text-stone-500">Hold Duration Rank:</span>
                  <span className="text-xs font-mono font-bold text-stone-800">
                    {breathResult === null ? "Untested today" : breathResult > 30 ? "Samavritta Master" : breathResult > 20 ? "Moderate Flow" : "Requires Depth"}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3.5 bg-stone-50 rounded-xl border border-stone-100/50">
                  <span className="text-xs font-mono text-stone-500">Estimated Lung Capacity:</span>
                  <span className="text-xs font-mono font-bold text-stone-800">
                    {breathResult === null ? "--" : `${(breathResult * 125 + 2000)} mL (Functional)`}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3.5 bg-stone-50 rounded-xl border border-stone-100/50">
                  <span className="text-xs font-mono text-stone-500">Autonomic Tension Balance:</span>
                  <span className="text-xs font-mono font-bold text-stone-800">
                    {breathResult === null ? "--" : breathResult > 25 ? "Parasympathetic Dominated (Calm)" : "Sympathetic Spiked (High Action)"}
                  </span>
                </div>
              </div>

              <div className="space-y-2 !mt-6">
                <h5 className="font-serif font-bold text-xs sm:text-sm text-stone-850">
                  Therapeutic Retentional Training Info:
                </h5>
                <p className="text-[#2D3436]/70 text-xs sm:text-sm leading-relaxed font-sans font-light">
                  A high retention coefficient reflects a nervous system resistant to hyperventilation and panic signals. Build your Prana by sticking strictly to equal-ratio breathing exercises (Sama Vritti 4s-In:4s-Hold:4s-Ex:4s-Empty) recommended in your customized routine of the day.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* TABS 4: AI POSTURE SCANNER */}
        {activeTab === 'posture' && (
          <motion.div
            key="posture-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Live Camera Scanner Box */}
            <div className="bg-stone-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col justify-between relative min-h-[460px] overflow-hidden">
              <div className="z-10 absolute top-5 left-5 space-y-1">
                <span className="p-1 px-3 text-[9px] uppercase font-mono tracking-widest bg-stone-800/80 border border-stone-700/50 text-[#C49A76] rounded-full font-bold">
                  Camera Lens Assessment
                </span>
                <h3 className="text-lg font-mono text-stone-200">
                  Posture Alignment Scan
                </h3>
              </div>

              {/* Main viewfinder */}
              <div className="flex-1 flex items-center justify-center my-6 relative bg-stone-900 rounded-2xl border border-stone-800 overflow-hidden h-72">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover opacity-45 scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3 z-10 max-w-xs">
                    <Video className="w-12 h-12 text-[#8A79A5] mx-auto opacity-70" />
                    <p className="text-xs text-stone-400 font-mono tracking-wide">
                      A visual alignment mapping requires Camera Permission. No image data is saved or transmitted.
                    </p>
                  </div>
                )}

                {/* Draw Canvas Skeleton Over Webview */}
                <canvas 
                  ref={canvasRef} 
                  className="absolute inset-x-0 inset-y-0 w-full h-full pointer-events-none z-10"
                  width={340}
                  height={280}
                />

                {/* Visual Scanner HUD Grid when scanning */}
                {scannerProgress === 'measuring' && (
                  <div className="absolute inset-0 border-2 border-dashed border-[#8A79A5]/20 animate-pulse pointer-events-none" />
                )}
              </div>

              {/* Command row */}
              <div className="z-10 flex gap-3">
                {cameraActive ? (
                  <button
                    onClick={stopCamera}
                    className="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-mono font-bold uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all"
                  >
                    Shut Down Feed
                  </button>
                ) : (
                  <button
                    onClick={startCamera}
                    className="flex-1 py-3 bg-[#8A79A5] hover:bg-[#71608E] text-white text-xs font-mono font-bold uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all"
                  >
                    Boot Alignment Camera
                  </button>
                )}
              </div>
            </div>

            {/* Analysis Diagnostics Outcome */}
            <div className="bg-white/45 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs space-y-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block mb-2">
                  Computer Vision Assessment
                </span>
                <h3 className="text-xl sm:text-2xl font-serif font-light text-stone-850">
                  Daily Posture Alignment
                </h3>
                <p className="text-[#2D3436]/75 text-xs sm:text-sm leading-relaxed font-sans font-normal mt-2">
                  Static posture measures the muscle imbalances resulting from desk tasks. Holding correct geometric alignment reduces spinal compression:
                </p>
              </div>

              {scannerProgress === 'complete' ? (
                <div className="space-y-4 py-4 bg-stone-50/50 p-4 rounded-xl border border-stone-100">
                  <div className="flex items-center justify-between text-xs font-mono border-b border-stone-100 pb-2">
                    <span className="text-stone-500">Spine Curvature:</span>
                    <span className="font-bold text-green-600">{scanMetrics.spineAlign}% (Optimum)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono border-b border-stone-100 pb-2">
                    <span className="text-stone-500">Neck Extension Axis:</span>
                    <span className="font-bold text-green-600">{scanMetrics.neckExtension}% (Optimum)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono border-b border-stone-100 pb-2">
                    <span className="text-stone-500">Shoulder Clavicle Horizon:</span>
                    <span className="font-bold text-[#A66C5E]">{scanMetrics.shoulderBalance}% (Minor Tilt)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-stone-500">Hips Angle Horizon:</span>
                    <span className="font-bold text-green-600">{scanMetrics.hipsLeveled}% (Leveled)</span>
                  </div>
                </div>
              ) : (
                <div className="p-10 border border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center text-center text-stone-400 space-y-2 my-4">
                  <Camera className="w-8 h-8 text-[#8A79A5] opacity-50" />
                  <p className="text-xs font-mono font-bold uppercase tracking-wider text-stone-500">
                    Skeletostat Map Standby
                  </p>
                  <p className="text-xs italic leading-relaxed font-serif max-w-[200px]">
                    Analysis metrics unlock once your camera starts calibration tracking.
                  </p>
                </div>
              )}

              <div className="bg-stone-50/50 p-4 rounded-xl border border-stone-100/30 text-xs text-stone-500 font-serif italic">
                {scannerProgress === 'complete' 
                  ? "Guidance: Your shoulders exhibit a 1.2cm right declination. Focus on the Cat-Cow chest expansion flow and the Sphinx pose today to open both pectorals and level scapula tension."
                  : '"Align your feet directly below the hip crests, roll your shoulders backward with palms facing fully open, and level the chin horizon to activate pure focus."'}
              </div>
            </div>
          </motion.div>
        )}

        {/* TABS 5: PULSE DIAGNOSIS CARD */}
        {activeTab === 'pulse' && (
          <motion.div
            key="pulse-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Interactive Pulse Sensor Tap */}
            <div className="bg-white/45 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs flex flex-col justify-between min-h-[400px]">
              <div className="space-y-2">
                <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block">
                  Vital Heart Veda
                </span>
                <h3 className="text-xl sm:text-2xl font-serif font-light text-stone-850">
                  Ayurvedic Pulse Assessment
                </h3>
                <p className="text-stone-550 text-xs font-light leading-relaxed">
                  Hold a finger over your phone camera lens to register blood pressure pulsation, or click the pulsing heart pad rhythmically for 10 seconds to estimate cardiac energy rates.
                </p>
              </div>

              {/* Pulsing heart area */}
              <div className="flex flex-col items-center justify-center my-6">
                <button
                  onClick={() => {
                    if (!pulseReading) {
                      setPulseReading(true);
                      setPulseProgress(0);
                      setPulsePattern(null);
                    }
                  }}
                  disabled={pulseReading}
                  className={`relative w-36 h-36 rounded-full border shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95 text-center ${
                    pulseReading 
                      ? "bg-red-50 border-red-200 animate-[pulse_1.2s_infinite]" 
                      : "bg-white border-stone-200 hover:border-[#8A79A5]"
                  }`}
                >
                  <Heart className={`w-10 h-10 ${pulseReading ? "text-red-500" : "text-stone-400"}`} />
                  <span className="text-[9px] font-mono font-bold tracking-widest uppercase mt-4 text-stone-500">
                    {pulseReading ? `RESONATING ${pulseProgress}%` : "TAP TO SCAN"}
                  </span>
                </button>
              </div>

              <div className="flex justify-between text-xs font-mono text-stone-400 bg-stone-50 p-2 rounded-lg border border-stone-100">
                <span>Vata (Snake): 80-90 bpm</span>
                <span>Pitta (Frog): 70-80 bpm</span>
                <span>Kapha (Swan): 50-60 bpm</span>
              </div>
            </div>

            {/* Diagnostic Pulse Outcome Report */}
            <div className="bg-white/55 backdrop-blur-md border border-white/70 p-6 sm:p-8 rounded-3xl shadow-xs space-y-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold block mb-2">
                  Diagnostic Vital Pulse
                </span>
                <h3 className="text-xl sm:text-2xl font-serif font-light text-stone-850">
                  Ayurvedic Nadi Report
                </h3>
                <p className="text-[#2D3436]/75 text-xs sm:text-sm leading-relaxed font-sans font-normal mt-2">
                  The radial heart rhythm reflects the dynamic flow of your blood vessels. Under Ayurveda, each biological doshas dictates heart rhythms:
                </p>
              </div>

              {pulsePattern ? (
                <div className="space-y-4 p-5 bg-white rounded-2xl border border-[#E8E1F2] shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="p-1 px-3 text-[10px] uppercase font-mono tracking-wider font-bold bg-[#E8E1F2] text-[#8A79A5] rounded-md">
                      {pulsePattern} Wave Detected
                    </span>
                    <span className="font-mono text-sm font-bold text-stone-700">{pulseRate} BPM</span>
                  </div>
                  <p className="text-[13px] text-stone-700 leading-relaxed font-sans font-normal italic">
                    {pulseDetails}
                  </p>
                </div>
              ) : (
                <div className="p-10 border border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center text-center text-stone-400 space-y-2">
                  <Activity className="w-8 h-8 text-[#A66C5E] opacity-50" />
                  <p className="text-xs font-mono font-bold uppercase tracking-wider text-stone-500">
                    Nadi Reader Standby
                  </p>
                  <p className="text-xs italic leading-relaxed font-serif max-w-[200px]">
                    Pulse diagnosis indices generate automatically when touch scan finishes.
                  </p>
                </div>
              )}

              <button
                onClick={() => {
                  if (!pulsePattern) {
                    if (showNotification) {
                      showNotification("Please run the vital diagnostic scan first!", "warn");
                    } else {
                      alert("Run the vital diagnostic scan first!");
                    }
                    return;
                  }
                  
                  // Feed pulse results back to overall daily indices
                  setMetrics(prev => {
                    const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const updated = [...prev];
                    if (updated.length > 0) {
                      const last = updated[updated.length - 1];
                      let v = 33, p = 33, k = 34;
                      if (pulsePattern === 'Vata') {
                        v = 55; p = 25; k = 20;
                      } else if (pulsePattern === 'Pitta') {
                        v = 20; p = 60; k = 20;
                      } else {
                        v = 20; p = 30; k = 50;
                      }
                      
                      updated[updated.length - 1] = {
                        ...last,
                        vata: v,
                        pitta: p,
                        kapha: k
                      };
                    }
                    return updated;
                  });
                  if (showNotification) {
                    showNotification("Heart Nadi rate coordinates synchronized with holistic charts!", "success");
                  } else {
                    alert("Heart Nadi rate coordinates synchronized with holistic charts!");
                  }
                }}
                className="w-full py-3 px-6 bg-[#2D3436] hover:bg-stone-700 text-white text-xs font-mono font-bold uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all"
              >
                Inject Nadi Rate Vitals to Trends
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* LOG DIALOG MODAL LAYOUT */}
      {formOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-100 max-w-md w-full shadow-2xl relative space-y-6"
          >
            <div className="space-y-1">
              <h3 className="text-lg font-serif font-bold text-stone-850">
                Register Today's Biometrics
              </h3>
              <p className="text-xs text-stone-500 font-mono">
                Log diagnostic variables manually to construct 7-day health trend analyses
              </p>
            </div>

            <form onSubmit={submitLog} className="space-y-5">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-stone-500 uppercase font-bold">Sleep (Hours)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    min="1"
                    max="14"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 rounded-xl font-sans text-xs focus:ring-[#8A79A5] focus:border-[#8A79A5]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-stone-500 uppercase font-bold">Sleep Quality [1-10]</label>
                  <input 
                    type="number" 
                    min="1"
                    max="10"
                    value={sleepQuality}
                    onChange={(e) => setSleepQuality(Number(e.target.value))}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 rounded-xl font-sans text-xs focus:ring-[#8A79A5] focus:border-[#8A79A5]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono tracking-wider text-stone-500 uppercase font-bold">Breath Retention Capacity (Seconds)</label>
                <input 
                  type="number" 
                  min="0"
                  max="100"
                  value={retentionSec}
                  onChange={(e) => setRetentionSec(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 p-3 rounded-xl font-sans text-xs focus:ring-[#8A79A5] focus:border-[#8A79A5]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono tracking-wider text-stone-500 uppercase font-bold block">Estimated Dosha Vitals (%)</label>
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-semibold text-sky-600 block">VATA</span>
                    <input 
                      type="number" 
                      min="10"
                      max="80"
                      value={vataVal}
                      onChange={(e) => setVataVal(Number(e.target.value))}
                      className="w-full text-center bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-semibold text-orange-600 block">PITTA</span>
                    <input 
                      type="number" 
                      min="10"
                      max="80"
                      value={pittaVal}
                      onChange={(e) => setPittaVal(Number(e.target.value))}
                      className="w-full text-center bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-semibold text-stone-500 block">KAPHA</span>
                    <input 
                      type="number" 
                      min="10"
                      max="80"
                      value={kaphaVal}
                      onChange={(e) => setKaphaVal(Number(e.target.value))}
                      className="w-full text-center bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-mono font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#8A79A5] hover:bg-[#71608E] text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl shadow-md cursor-pointer"
                >
                  Save Log
                </button>
              </div>

            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}
