// Classical balancing reference per dosha (Dinacharya / Ritucharya / Ahara
// themes), shown on the Dosha Profile screen. DRAFT content for Niral's
// review — traditional Ayurvedic guidance, not medical advice, and the screens
// say so.
//
// One copy for every client: the website imports it directly, and the native
// apps read it from GET /api/dosha-guide.

export type DoshaName = 'Vata' | 'Pitta' | 'Kapha';

export interface DoshaGuideEntry {
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

export const DOSHA_GUIDE: Record<DoshaName, DoshaGuideEntry> = {
  Vata: {
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
      "Move every day — vigorous exercise is Kapha's medicine",
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

/** The provenance line shown under the guide. */
export const DOSHA_GUIDE_NOTE =
  'Drawn from traditional Ayurvedic teaching (Dinacharya, Ritucharya, Ahara) — a lens for self-knowledge, not a medical diagnosis.';
