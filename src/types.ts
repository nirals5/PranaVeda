export type DoshaType = 'Vata' | 'Pitta' | 'Kapha' | 'Anami' | 'Dual' | 'Unknown';

export interface YogaPose {
  poseId?: string;
  nameEnglish: string;
  nameSanskrit: string;
  duration: string;
  benefits: string;
  instructions: string;
  poseImageUrl?: string;
  videoUrl?: string;
}

export interface AyurvedicAdvice {
  assessment: string;
  doshaPrimary: DoshaType;
  dietaryTips: string[];
  lifestyleTips: string[];
  recommendedHerbs: string[];
}

export interface BreathworkPattern {
  name: string;
  sanskritName?: string;
  description: string;
  inhale: number; // in seconds
  holdActive: number; // in seconds
  exhale: number; // in seconds
  holdEmpty: number; // in seconds
  cycles: number;
  benefits: string;
}

export interface RecommendationResult {
  summary: string;
  doshaTendency: string;
  primaryEnergy: string;
  yogaPractice: {
    title: string;
    description: string;
    poses: YogaPose[];
    durationMinutes: number;
  };
  ayurvedicAdvice: AyurvedicAdvice;
  breathwork: BreathworkPattern;
  lifestyleTips: string[];
  savedAt?: string;
  _isFallback?: boolean;
}

export interface SavedPractice {
  id: string;
  title: string;
  date: string;
  query: string;
  category: 'Yoga' | 'Ayurveda' | 'Breathwork' | 'Holistic';
  result: RecommendationResult;
}

// One finished practice. The log is the calendar's source of truth and, like
// the wellness profile, lives on-device only.
export interface PracticeLogEntry {
  id: string;
  kind: 'ritual' | 'breathwork';
  title: string;
  completedAt: string; // ISO timestamp
  localDate: string; // YYYY-MM-DD in the user's own timezone — the calendar key
  durationMinutes: number;
  result?: RecommendationResult; // snapshot so the day can reopen its ritual
  heart?: HeartSummary; // present when a heart-rate device was connected
}

// Heart rate across one practice, from a connected Bluetooth device.
export interface HeartSummary {
  startBpm: number;
  endBpm: number;
  avgBpm: number;
  minBpm: number;
  maxBpm: number;
  rmssd?: number; // HRV in ms, when the device reports beat-to-beat intervals
}

// One day of wearable readings from Google Health, kept on-device.
export interface HealthDay {
  date: string; // YYYY-MM-DD
  restingHeartRate?: number;
  hrv?: number; // daily average RMSSD, ms
  sleepMinutes?: number; // main sleep ending on this date
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

// --- Conversational Amrita ---

export interface WellnessProfile {
  name?: string;
  prakriti?: string;
  vikriti?: string;
  prakritiConfidence?: 'low' | 'medium' | 'high';
  doshaProfile?: DoshaProfileResult & { assessedDate?: string };
  goals?: string[];
  conditions?: string[];
  preferences?: string[];
  observations?: { date: string; note: string }[];
  practiceHistory?: { date: string; title: string; kind: 'ritual' | 'breathwork' }[];
}

export interface AnswerOption {
  label: string;
  emoji?: string;
  imageId?: string;
  description?: string;
}

export interface DoshaProfileResult {
  primary: 'Vata' | 'Pitta' | 'Kapha';
  secondary?: 'Vata' | 'Pitta' | 'Kapha';
  balance: { vata: number; pitta: number; kapha: number };
  essence: string;
  explanation: string;
  guidance: string[];
  confidence: 'low' | 'medium' | 'high';
}

export type ChatCard =
  | { kind: 'ritual'; result: RecommendationResult }
  | { kind: 'breathwork'; note?: string; pattern: BreathworkPattern }
  | ({ kind: 'dosha_profile' } & DoshaProfileResult)
  | { kind: 'options'; options: AnswerOption[] };

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: ChatCard[];
  streaming?: boolean;
  error?: boolean;
}
