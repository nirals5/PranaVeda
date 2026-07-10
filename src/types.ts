export type DoshaType = 'Vata' | 'Pitta' | 'Kapha' | 'Anami' | 'Dual' | 'Unknown';

export interface YogaPose {
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
