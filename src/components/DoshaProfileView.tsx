import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wind, Flame, Droplet, Utensils, Sun, Moon, Leaf, ArrowRight, RefreshCw } from 'lucide-react';
import { WellnessProfile } from '../types';

interface DoshaProfileViewProps {
  profile: WellnessProfile;
  onStartDiscovery: () => void;
}

// Classical balancing reference per dosha (Dinacharya / Ritucharya / Ahara
// themes). DRAFT content for Niral's review — traditional Ayurvedic guidance,
// not medical advice, and the view says so.
const BALANCING: Record<
  string,
  {
    icon: typeof Wind;
    tagline: string;
    qualities: string;
    aggravatedBy: string;
    balancedBy: string;
    diet: string[];
    lifestyle: string[];
    breath: string;
    practiceStyle: string;
    rhythm: string;
    season: string;
  }
> = {
  Vata: {
    icon: Wind,
    tagline: 'Air & Space — movement, creativity, quickness',
    qualities: 'Light, dry, cold, mobile, subtle',
    aggravatedBy: 'Irregular routine, cold wind, overstimulation, travel, raw and dry foods, late nights',
    balancedBy: 'Warmth, routine, nourishment, grounding touch, rest',
    diet: [
      'Favor warm, moist, cooked foods — soups, stews, ghee, root vegetables',
      'Warming spices: ginger, cinnamon, cardamom, cumin',
      'Eat at regular times; avoid skipping meals even when appetite wanders',
      'Sip warm water or spiced teas; minimize cold and carbonated drinks',
    ],
    lifestyle: [
      'Keep a steady daily rhythm — regular sleep, meals, and practice times',
      'Daily self-massage (Abhyanga) with warm sesame oil',
      'Limit multitasking and sensory overload; single-task with breaks',
      'Keep warm — especially ears, neck, and feet in wind and cold',
    ],
    breath: 'Nadi Shodhana (alternate nostril) and Sama Vritti — slow, even, steadying rhythms',
    practiceStyle: 'Slow, grounding, floor-based practice with longer holds; steady standing poses; generous Savasana',
    rhythm: 'Rise gently, practice mid-morning; wind down early — in bed before 10pm',
    season: 'Extra care in autumn and early winter (Vata season): more warmth, oil, and routine',
  },
  Pitta: {
    icon: Flame,
    tagline: 'Fire & Water — transformation, focus, drive',
    qualities: 'Hot, sharp, light, oily, intense',
    aggravatedBy: 'Heat, competition, overwork, spicy and fried foods, midday sun, skipped meals',
    balancedBy: 'Coolness, moderation, play, sweetness, time in nature',
    diet: [
      'Favor cooling, mildly sweet foods — cucumber, coconut, leafy greens, rice, melons',
      'Soften heating spices; use coriander, fennel, mint, rose',
      'Do not skip meals — Pitta hunger turns sharp; lunch is the main meal',
      'Cool (not iced) drinks; coconut water and rose-infused water soothe',
    ],
    lifestyle: [
      'Build in unstructured, playful time — not everything is a goal',
      'Practice and exercise in the cooler parts of the day, never in peak heat',
      'Moonlight walks, time near water, and shade restore Pitta',
      'Watch the tendency to critique — of self as much as others',
    ],
    breath: 'Sheetali (cooling breath) and Chandra Bhedana (left-nostril moon breath)',
    practiceStyle: 'Moderate, non-competitive practice with forward folds and twists; release the drive to perfect the pose',
    rhythm: 'Avoid working late into the night; release the day before sleep',
    season: 'Extra care in summer (Pitta season): cooling foods, shade, and gentler effort',
  },
  Kapha: {
    icon: Droplet,
    tagline: 'Earth & Water — stability, endurance, devotion',
    qualities: 'Heavy, slow, cool, smooth, steady',
    aggravatedBy: 'Oversleeping, sedentary days, heavy and sweet foods, dampness, too much comfort',
    balancedBy: 'Movement, stimulation, lightness, warmth, variety',
    diet: [
      'Favor light, warm, well-spiced foods — legumes, bitter greens, astringent vegetables',
      'Kindling spices: black pepper, ginger, turmeric, chili in moderation',
      'Make the evening meal light; avoid heavy, cold, or fried foods',
      'Warm water with honey and ginger supports Kapha digestion',
    ],
    lifestyle: [
      'Move every day — vigorous exercise is Kapha\'s medicine',
      'Rise early (before 6am if possible); avoid daytime naps',
      'Invite newness: new routes, people, practices — inertia is the trap',
      'Dry brushing (Garshana) before bathing stimulates circulation',
    ],
    breath: 'Bhastrika (bellows) and Ujjayi — warming, energizing rhythms, practiced gently',
    practiceStyle: 'Dynamic, flowing practice with backbends and standing strength; keep it moving, shorter holds',
    rhythm: 'Strongest practice in the morning to break overnight heaviness',
    season: 'Extra care in late winter and spring (Kapha season): lighten food and increase movement',
  },
};

function BalanceBars({ balance }: { balance: { vata: number; pitta: number; kapha: number } }) {
  const doshas = [
    { name: 'Vata', value: balance.vata, icon: Wind, bar: 'bg-[#B7CFFB]', chip: 'bg-[#DFE8FA]/80 text-[#3B5B95]' },
    { name: 'Pitta', value: balance.pitta, icon: Flame, bar: 'bg-[#F2D0C6]', chip: 'bg-[#FBEDE9]/80 text-[#7E4F41]' },
    { name: 'Kapha', value: balance.kapha, icon: Droplet, bar: 'bg-[#A2E6D4]', chip: 'bg-[#DDF5EE]/80 text-[#2D5A4E]' },
  ];
  return (
    <div className="space-y-2.5">
      {doshas.map(({ name, value, icon: Icon, bar, chip }) => (
        <div key={name} className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 w-20 py-0.5 px-2 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold ${chip}`}>
            <Icon className="w-3 h-3" /> {name}
          </span>
          <div className="flex-1 h-2 rounded-full bg-white/70 border border-white overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${value}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={`h-full rounded-full ${bar}`}
            />
          </div>
          <span className="w-9 text-right text-[12px] font-mono text-stone-600">{value}%</span>
        </div>
      ))}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Wind; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/50 border border-white/30 p-6 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3.5">
        <Icon className="w-4 h-4 text-[#8A79A5]" />
        <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function DoshaProfileView({ profile, onStartDiscovery }: DoshaProfileViewProps) {
  const dosha = profile.doshaProfile;

  // No assessment yet (or an older partial one): invite the discovery.
  if (!dosha) {
    return (
      <div className="flex flex-col items-center text-center max-w-xl mx-auto px-6 py-16 space-y-6">
        <div className="w-24 h-24 rounded-full bg-white/70 border border-white/90 shadow-xl flex items-center justify-center">
          <div className="flex gap-1.5">
            <Wind className="w-5 h-5 text-[#3B5B95]/70" />
            <Flame className="w-5 h-5 text-[#7E4F41]/70" />
            <Droplet className="w-5 h-5 text-[#2D5A4E]/70" />
          </div>
        </div>
        <h2 className="text-3xl font-serif italic text-[#2D3436]">
          {profile.prakriti ? 'Complete your dosha portrait' : 'Discover your constitution'}
        </h2>
        <p className="text-[15px] text-stone-600 font-sans leading-relaxed max-w-md">
          {profile.prakriti
            ? `Amrita has noted your constitution as ${profile.prakriti}, but a short conversation will complete the full portrait — your elemental balance, its meaning, and how to keep it in harmony.`
            : 'In Ayurveda, your Prakriti is the unique balance of Vata, Pitta, and Kapha you were born with. A short conversation with Amrita — no quiz, just a few thoughtful questions — reveals yours and shapes every recommendation she makes.'}
        </p>
        <button
          onClick={onStartDiscovery}
          className="py-3 px-7 bg-[#8A79A5] hover:bg-[#72618F] text-white text-[12px] uppercase tracking-widest font-mono font-bold rounded-xl shadow-[0_8px_20px_rgba(138,121,165,0.3)] transition-all flex items-center gap-2 cursor-pointer hover:translate-y-[-1px]"
        >
          Begin discovery with Amrita <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const ref = BALANCING[dosha.primary] ?? BALANCING.Vata;
  const secondaryRef = dosha.secondary ? BALANCING[dosha.secondary] : undefined;

  return (
    <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-12 space-y-6">
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[28px] p-7 sm:p-8 shadow-[0_16px_44px_rgba(138,121,165,0.14)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="space-y-2.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-bold bg-[#E8E1F2] text-stone-700 uppercase">
              <Sparkles className="w-3 h-3 text-[#8A79A5]" /> Your Prakriti
            </span>
            <h1 className="text-4xl font-serif text-[#2D3436]">
              {dosha.primary}
              {dosha.secondary && <span className="text-stone-400"> · {dosha.secondary}</span>}
            </h1>
            <p className="text-[14px] text-stone-500 font-sans">{ref.tagline}</p>
            <p className="text-[15px] text-stone-700 font-serif italic leading-relaxed">"{dosha.essence}"</p>
          </div>
          <div className="w-full sm:w-72 flex-shrink-0">
            <BalanceBars balance={dosha.balance} />
            <p className="text-[11px] font-mono text-stone-400 uppercase tracking-wider mt-3 text-right">
              {dosha.confidence} confidence{dosha.assessedDate ? ` · ${dosha.assessedDate}` : ''}
            </p>
          </div>
        </div>
        <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed mt-5 pt-5 border-t border-stone-200/50">
          {dosha.explanation}
        </p>
      </motion.div>

      {/* Personal guidance from the assessment */}
      {dosha.guidance.length > 0 && (
        <Section icon={Sparkles} title="Amrita's guidance for you">
          <ul className="space-y-2">
            {dosha.guidance.map((tip) => (
              <li key={tip} className="text-[13.5px] text-stone-700 font-sans leading-relaxed flex gap-2">
                <span className="text-[#8A79A5]">·</span> {tip}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Balancing reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section icon={ref.icon} title={`Understanding ${dosha.primary}`}>
          <div className="space-y-3 text-[13.5px] text-stone-700 font-sans leading-relaxed">
            <p><span className="font-semibold text-stone-800">Qualities:</span> {ref.qualities}</p>
            <p><span className="font-semibold text-stone-800">Thrown off by:</span> {ref.aggravatedBy}</p>
            <p><span className="font-semibold text-stone-800">Balanced by:</span> {ref.balancedBy}</p>
            {secondaryRef && dosha.secondary && (
              <p className="pt-2 border-t border-stone-200/50 text-stone-600">
                Your secondary {dosha.secondary} adds: {secondaryRef.tagline.toLowerCase()}. When {dosha.primary} feels settled but something still stirs, tend the {dosha.secondary}.
              </p>
            )}
          </div>
        </Section>

        <Section icon={Utensils} title="Nourishment (Ahara)">
          <ul className="space-y-2">
            {ref.diet.map((tip) => (
              <li key={tip} className="text-[13.5px] text-stone-700 font-sans leading-relaxed flex gap-2">
                <span className="text-[#8A79A5]">·</span> {tip}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Sun} title="Daily rhythm (Dinacharya)">
          <ul className="space-y-2">
            {ref.lifestyle.map((tip) => (
              <li key={tip} className="text-[13.5px] text-stone-700 font-sans leading-relaxed flex gap-2">
                <span className="text-[#8A79A5]">·</span> {tip}
              </li>
            ))}
            <li className="text-[13.5px] text-stone-700 font-sans leading-relaxed flex gap-2">
              <span className="text-[#8A79A5]">·</span> {ref.rhythm}
            </li>
          </ul>
        </Section>

        <Section icon={Moon} title="Practice & breath">
          <div className="space-y-3 text-[13.5px] text-stone-700 font-sans leading-relaxed">
            <p><span className="font-semibold text-stone-800">Movement:</span> {ref.practiceStyle}</p>
            <p><span className="font-semibold text-stone-800">Breath:</span> {ref.breath}</p>
            <p className="flex gap-2 items-start"><Leaf className="w-3.5 h-3.5 text-[#6A9478] mt-0.5 flex-shrink-0" /> {ref.season}</p>
          </div>
        </Section>
      </div>

      {/* Footer: provenance + retake */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <p className="text-[12px] text-stone-400 italic font-sans max-w-lg">
          Drawn from traditional Ayurvedic teaching (Dinacharya, Ritucharya, Ahara) — a lens for self-knowledge, not a medical diagnosis.
        </p>
        <button
          onClick={onStartDiscovery}
          className="flex items-center gap-1.5 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800 bg-white/50 hover:bg-white/80 border border-white/70 transition-all cursor-pointer flex-shrink-0"
        >
          <RefreshCw className="w-3 h-3" /> Revisit with Amrita
        </button>
      </div>
    </div>
  );
}
