import express from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

// IMPORTANT: this file must stay fully self-contained (no imports from other
// project files). Cross-file imports crash Vercel's ESM runtime with
// ERR_MODULE_NOT_FOUND — see commit 761fe05. Everything the API needs lives
// here, in sections: catalog → system prompt → chat → legacy endpoints.

// Allow Vercel to stream the /api/chat SSE response instead of buffering it.
export const config = { supportsResponseStreaming: true };

// ============================== Practice catalog ==============================

// PranaVeda curated practice catalog.
//
// Amrita composes rituals FROM this catalog (by id) rather than free-generating
// poses, so every recommendation is vetted, has consistent assets, and can be
// safety-filtered against the user's wellness profile.
//
// Structure follows Niral's three-layer pose schema (Teaching Content +
// Ayurvedic Layer; the CV Geometry layer ships to the client when live
// practice is built). Dosha tags and cues are DRAFT content seeded from the
// pose-library sheet and standard Ayurvedic sequencing references — Niral
// reviews and owns this content.

export type ConditionTag =
  | 'knee_injury'
  | 'wrist_injury'
  | 'shoulder_injury'
  | 'neck_injury'
  | 'lower_back_injury'
  | 'hamstring_injury'
  | 'pregnancy'
  | 'hypertension'
  | 'low_blood_pressure'
  | 'glaucoma'
  | 'heart_condition'
  | 'recent_surgery'
  | 'vertigo'
  | 'asthma';

export interface CatalogPose {
  id: string;
  nameSanskrit: string;
  nameEnglish: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  bodyFocus: string;
  cues: string[];
  commonMistakes: string[];
  benefits: string;
  modifications: string;
  contraindications: ConditionTag[];
  dosha: { vata: string; pitta: string; kapha: string };
  bestTime: string;
  counterPoseId?: string;
  defaultDurationMin: number;
  poseImageUrl: string;
  videoUrl?: string;
}

export interface CatalogBreathwork {
  id: string;
  name: string;
  sanskritName: string;
  description: string;
  inhale: number;
  holdActive: number;
  exhale: number;
  holdEmpty: number;
  cycles: number;
  benefits: string;
  doshaSuitability: string;
  contraindications: ConditionTag[];
  bestTime: string;
}

const img = {
  child: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop',
  flow: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop',
  backbend: 'https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop',
  fold: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop',
  rest: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop',
};

const vid = 'https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4';

export const POSES: CatalogPose[] = [
  {
    id: 'mountain',
    nameSanskrit: 'Tadasana',
    nameEnglish: 'Mountain Pose',
    level: 'Beginner',
    bodyFocus: 'Posture / Grounding',
    cues: ['Root down through all four corners of the feet', 'Lengthen the crown toward the sky', 'Soften the shoulders away from the ears'],
    commonMistakes: ['Locking the knees', 'Letting the ribs flare forward'],
    benefits: 'Establishes steady, aligned standing posture and quiet attention; the foundation for all standing poses.',
    modifications: 'Stand with feet hip-width for more stability; practice against a wall to feel alignment.',
    contraindications: [],
    dosha: { vata: 'Grounding and steadying', pitta: 'Neutral', kapha: 'Mildly energizing when held with intention' },
    bestTime: 'Anytime',
    defaultDurationMin: 1,
    poseImageUrl: img.flow,
  },
  {
    id: 'childs_pose',
    nameSanskrit: 'Balasana',
    nameEnglish: "Child's Pose",
    level: 'Beginner',
    bodyFocus: 'Low back / Hips / Rest',
    cues: ['Sink hips toward heels', 'Let the forehead rest down', 'Breathe into the back body'],
    commonMistakes: ['Forcing hips lower than is comfortable', 'Holding tension in the shoulders'],
    benefits: 'Gentle release for the low back and hips; deeply calming and restorative for the nervous system.',
    modifications: 'Place a cushion between heels and hips for knee sensitivity; rest the head on stacked fists.',
    contraindications: ['knee_injury', 'pregnancy'],
    dosha: { vata: 'Deeply grounding and calming — ideal for vata', pitta: 'Cooling and soothing', kapha: 'Can increase heaviness if held too long' },
    bestTime: 'Evening, or anytime as a reset',
    defaultDurationMin: 2,
    poseImageUrl: img.child,
    videoUrl: vid,
  },
  {
    id: 'cat_cow',
    nameSanskrit: 'Marjariasana–Bitilasana',
    nameEnglish: 'Cat–Cow Flow',
    level: 'Beginner',
    bodyFocus: 'Spine / Breath coordination',
    cues: ['Move with the breath — inhale to arch, exhale to round', 'Press the floor away through the palms', 'Let the movement start from the tailbone'],
    commonMistakes: ['Rushing faster than the breath', 'Collapsing into the wrists'],
    benefits: 'Articulates the whole spine, coordinates breath with movement, and gently warms the core.',
    modifications: 'Pad the knees; make fists if wrists are sensitive.',
    contraindications: ['wrist_injury', 'neck_injury'],
    dosha: { vata: 'Soothing when slow and rhythmic', pitta: 'Neutral', kapha: 'Awakening — good morning starter' },
    bestTime: 'Morning',
    counterPoseId: 'childs_pose',
    defaultDurationMin: 3,
    poseImageUrl: img.flow,
    videoUrl: vid,
  },
  {
    id: 'downward_dog',
    nameSanskrit: 'Adho Mukha Svanasana',
    nameEnglish: 'Downward-Facing Dog',
    level: 'Intermediate',
    bodyFocus: 'Shoulders / Hamstrings / Full body',
    cues: ['Press the floor away through the palms', 'Lengthen the tailbone up and back', 'Bend the knees if the hamstrings are tight'],
    commonMistakes: ['Rounding the upper back', 'Collapsing into the shoulders', 'Locking the elbows hard'],
    benefits: 'Lengthens the spine and hamstrings, strengthens arms and shoulders, relieves mild back tension, and calms the mind.',
    modifications: 'Shorten the stance and bend knees generously; practice with hands on a chair seat.',
    contraindications: ['wrist_injury', 'shoulder_injury', 'hypertension', 'glaucoma'],
    dosha: { vata: 'Grounding through hands and feet, calming', pitta: 'Mild inversion may aggravate excess pitta — keep brief', kapha: 'Energizing, stimulates circulation' },
    bestTime: 'Morning or midday',
    counterPoseId: 'childs_pose',
    defaultDurationMin: 2,
    poseImageUrl: '/poses/downward_dog.jpg',
    videoUrl: vid,
  },
  {
    id: 'standing_forward_fold',
    nameSanskrit: 'Uttanasana',
    nameEnglish: 'Standing Forward Fold',
    level: 'Beginner',
    bodyFocus: 'Hamstrings / Spine / Calm',
    cues: ['Hinge from the hips, not the waist', 'Let the head hang heavy', 'Keep a soft bend in the knees'],
    commonMistakes: ['Rounding from the low back with straight legs', 'Gripping the neck'],
    benefits: 'Releases the hamstrings and spine, quiets the senses, and gently soothes an overactive mind.',
    modifications: 'Rest hands on blocks or shins; take feet wider apart.',
    contraindications: ['lower_back_injury', 'hamstring_injury', 'hypertension', 'glaucoma', 'vertigo'],
    dosha: { vata: 'Calming if supported and unhurried', pitta: 'Cooling — head below heart soothes heat', kapha: 'Neutral' },
    bestTime: 'Morning or evening',
    counterPoseId: 'mountain',
    defaultDurationMin: 1,
    poseImageUrl: '/poses/standing_forward_fold.jpg',
  },
  {
    id: 'warrior_1',
    nameSanskrit: 'Virabhadrasana I',
    nameEnglish: 'Warrior I',
    level: 'Beginner',
    bodyFocus: 'Legs / Hips / Chest',
    cues: ['Ground the back heel at a 45° angle', 'Square the hips gently toward the front', 'Reach up through both arms without lifting the shoulders'],
    commonMistakes: ['Front knee drifting past the ankle', 'Overarching the low back'],
    benefits: 'Builds leg strength and stamina, opens the chest and hip flexors, and cultivates focused determination.',
    modifications: 'Shorten the stance; keep hands at the heart if shoulders are tight.',
    contraindications: ['knee_injury', 'hypertension', 'heart_condition'],
    dosha: { vata: 'Grounding when held steadily', pitta: 'Heating — keep holds moderate', kapha: 'Excellent — builds warmth and energy' },
    bestTime: 'Morning',
    counterPoseId: 'standing_forward_fold',
    defaultDurationMin: 2,
    poseImageUrl: '/poses/warrior_1.jpg',
  },
  {
    id: 'warrior_2',
    nameSanskrit: 'Virabhadrasana II',
    nameEnglish: 'Warrior II',
    level: 'Beginner',
    bodyFocus: 'Legs / Hips / Focus',
    cues: ['Stack the front knee over the ankle', 'Reach equally through both fingertips', 'Gaze softly over the front hand'],
    commonMistakes: ['Knee collapsing inward', 'Leaning the torso forward', 'Back foot turning out too far'],
    benefits: 'Builds leg strength, opens the hips, and improves steady focus.',
    modifications: 'Narrow the stance or reduce the bend with knee sensitivity; rest hands on hips.',
    contraindications: ['knee_injury', 'hypertension'],
    dosha: { vata: 'Grounding — good for vata imbalance', pitta: 'Heating — pair with cooling breath', kapha: 'Energizing — good for sluggishness' },
    bestTime: 'Morning',
    counterPoseId: 'childs_pose',
    defaultDurationMin: 2,
    poseImageUrl: img.flow,
  },
  {
    id: 'triangle',
    nameSanskrit: 'Trikonasana',
    nameEnglish: 'Triangle Pose',
    level: 'Beginner',
    bodyFocus: 'Side body / Hamstrings / Balance',
    cues: ['Lengthen both sides of the waist evenly', 'Reach out before reaching down', 'Stack the top shoulder over the bottom'],
    commonMistakes: ['Collapsing into the bottom hand', 'Hyperextending the front knee'],
    benefits: 'Stretches the side body and hamstrings, strengthens the legs, and improves digestion and balance.',
    modifications: 'Rest the bottom hand on a block or the shin; shorten the stance.',
    contraindications: ['neck_injury', 'low_blood_pressure', 'vertigo'],
    dosha: { vata: 'Steadying when unhurried', pitta: 'Neutral to mildly cooling', kapha: 'Stimulating — supports digestion' },
    bestTime: 'Morning or midday',
    counterPoseId: 'mountain',
    defaultDurationMin: 2,
    poseImageUrl: '/poses/triangle.jpg',
  },
  {
    id: 'tree_pose',
    nameSanskrit: 'Vrksasana',
    nameEnglish: 'Tree Pose',
    level: 'Beginner',
    bodyFocus: 'Balance / Hips / Focus',
    cues: ['Root down through the standing foot', 'Press foot and inner thigh together', 'Soften the gaze to one steady point'],
    commonMistakes: ['Foot pressing directly on the knee joint', 'Hips tilting to one side', 'Holding the breath'],
    benefits: 'Improves balance and ankle stability, builds quiet focus and calm confidence.',
    modifications: 'Use a wall for support; keep the toes on the floor with the heel at the ankle.',
    contraindications: ['vertigo'],
    dosha: { vata: 'Calming if steady; pace slowly to avoid scattering energy', pitta: 'Neutral to mildly cooling', kapha: 'Energizing, builds focus' },
    bestTime: 'Anytime, especially morning',
    counterPoseId: 'mountain',
    defaultDurationMin: 2,
    poseImageUrl: img.flow,
  },
  {
    id: 'bridge',
    nameSanskrit: 'Setu Bandha Sarvangasana',
    nameEnglish: 'Bridge Pose',
    level: 'Beginner',
    bodyFocus: 'Back body / Chest / Hips',
    cues: ['Press evenly through both feet', 'Lift from the hips, not the low back', 'Keep the knees tracking over the ankles'],
    commonMistakes: ['Squeezing the glutes so hard the knees splay', 'Turning the head while lifted'],
    benefits: 'Strengthens the back body, opens the chest and hip flexors, and gently energizes without strain.',
    modifications: 'Place a block under the sacrum for a supported, restorative version.',
    contraindications: ['neck_injury', 'lower_back_injury'],
    dosha: { vata: 'Grounding in its supported form', pitta: 'Neutral', kapha: 'Uplifting — opens the chest' },
    bestTime: 'Morning or early evening',
    counterPoseId: 'supine_twist',
    defaultDurationMin: 2,
    poseImageUrl: '/poses/bridge.jpg',
  },
  {
    id: 'cobra',
    nameSanskrit: 'Bhujangasana',
    nameEnglish: 'Cobra Pose',
    level: 'Beginner',
    bodyFocus: 'Spine / Chest',
    cues: ['Lift from the strength of the back, not the arms', 'Keep the elbows hugging the ribs', 'Lengthen forward before lifting up'],
    commonMistakes: ['Pushing into a deep backbend with the arms', 'Crunching the neck to look up'],
    benefits: 'Strengthens the spine, opens the chest and lungs, and counteracts long hours of sitting.',
    modifications: 'Practice baby cobra with forearms down (Sphinx) for sensitivity.',
    contraindications: ['lower_back_injury', 'wrist_injury', 'pregnancy'],
    dosha: { vata: 'Warming and enlivening in small doses', pitta: 'Heating — keep gentle', kapha: 'Excellent — opens the chest and lifts energy' },
    bestTime: 'Morning',
    counterPoseId: 'childs_pose',
    defaultDurationMin: 2,
    poseImageUrl: '/poses/cobra.jpg',
  },
  {
    id: 'sphinx',
    nameSanskrit: 'Salamba Bhujangasana',
    nameEnglish: 'Sphinx Pose',
    level: 'Beginner',
    bodyFocus: 'Low back / Chest',
    cues: ['Stack elbows under the shoulders', 'Draw the chest gently forward and up', 'Keep the legs heavy and relaxed'],
    commonMistakes: ['Shrugging the shoulders toward the ears', 'Clenching the low back'],
    benefits: 'A gentle, supported backbend that restores the natural lumbar curve and opens the heart softly.',
    modifications: 'Slide the elbows further forward to reduce the arch.',
    contraindications: ['lower_back_injury', 'pregnancy'],
    dosha: { vata: 'Grounding and gently warming — very vata-friendly', pitta: 'Mild', kapha: 'Gently stimulating' },
    bestTime: 'Anytime',
    counterPoseId: 'childs_pose',
    defaultDurationMin: 2,
    poseImageUrl: '/poses/sphinx.jpg',
  },
  {
    id: 'seated_forward_bend',
    nameSanskrit: 'Paschimottanasana',
    nameEnglish: 'Seated Forward Bend',
    level: 'Beginner',
    bodyFocus: 'Hamstrings / Spine / Introspection',
    cues: ['Inhale to lengthen the spine, exhale to fold from the hips', 'Reach for shins or feet without forcing', 'Let the breath do the deepening'],
    commonMistakes: ['Rounding hard to grab the feet', 'Straining the hamstrings'],
    benefits: 'Grounds the pelvis, stretches the spine and hamstrings, and turns attention inward.',
    modifications: 'Sit on a folded blanket; loop a strap around the feet; bend the knees.',
    contraindications: ['lower_back_injury', 'hamstring_injury', 'pregnancy'],
    dosha: { vata: 'Deeply calming when supported', pitta: 'Cooling and quieting', kapha: 'Can be dulling — keep the spine active' },
    bestTime: 'Evening',
    counterPoseId: 'bridge',
    defaultDurationMin: 2,
    poseImageUrl: img.fold,
  },
  {
    id: 'butterfly',
    nameSanskrit: 'Baddha Konasana',
    nameEnglish: 'Bound Angle (Butterfly) Pose',
    level: 'Beginner',
    bodyFocus: 'Hips / Inner thighs',
    cues: ['Bring the soles of the feet together', 'Let the knees release toward the floor without pressing', 'Lengthen up through the spine'],
    commonMistakes: ['Bouncing the knees', 'Rounding the back to lean forward'],
    benefits: 'Opens the hips and inner thighs, eases restlessness, and supports healthy circulation in the pelvis.',
    modifications: 'Sit on a blanket; support the knees with cushions for a restorative hold.',
    contraindications: ['knee_injury'],
    dosha: { vata: 'Calming with support under the knees', pitta: 'Cooling', kapha: 'Neutral' },
    bestTime: 'Evening',
    defaultDurationMin: 2,
    poseImageUrl: img.fold,
  },
  {
    id: 'supine_twist',
    nameSanskrit: 'Supta Matsyendrasana',
    nameEnglish: 'Supine Spinal Twist',
    level: 'Beginner',
    bodyFocus: 'Spine / Digestion / Release',
    cues: ['Keep both shoulders heavy on the floor', 'Let the knees fall with gravity', 'Soften the belly with each exhale'],
    commonMistakes: ['Forcing the knees to the floor', 'Lifting the opposite shoulder'],
    benefits: 'Releases the spine and low back, aids digestion, and signals deep rest to the nervous system.',
    modifications: 'Place a cushion between or under the knees.',
    contraindications: ['lower_back_injury', 'pregnancy'],
    dosha: { vata: 'Settling and integrating', pitta: 'Cooling — wrings out heat and irritation', kapha: 'Gently stimulating for digestion' },
    bestTime: 'Evening, or to close any practice',
    counterPoseId: 'corpse_pose',
    defaultDurationMin: 2,
    poseImageUrl: img.rest,
  },
  {
    id: 'legs_up_the_wall',
    nameSanskrit: 'Viparita Karani',
    nameEnglish: 'Legs-Up-the-Wall',
    level: 'Beginner',
    bodyFocus: 'Rest / Circulation / Sleep',
    cues: ['Scoot the sitting bones close to the wall', 'Let the legs rest completely on the wall', 'Rest the hands on the belly or by the sides'],
    commonMistakes: ['Holding the legs actively', 'Placing the hips too far from the wall'],
    benefits: 'Drains tired legs, lowers arousal, and is one of the most reliable preparations for sleep.',
    modifications: 'Place a folded blanket under the hips; bend the knees if the hamstrings protest.',
    contraindications: ['glaucoma', 'hypertension'],
    dosha: { vata: 'Profoundly calming — a vata remedy', pitta: 'Cooling and soothing', kapha: 'Restful — keep to shorter holds in the morning' },
    bestTime: 'Evening / before sleep',
    counterPoseId: 'corpse_pose',
    defaultDurationMin: 5,
    poseImageUrl: '/poses/legs_up_the_wall.jpg',
  },
  {
    id: 'easy_pose',
    nameSanskrit: 'Sukhasana',
    nameEnglish: 'Easy Seat',
    level: 'Beginner',
    bodyFocus: 'Meditation / Breath',
    cues: ['Sit tall on the front edge of a cushion', 'Let the hands rest on the knees', 'Relax the jaw and the space between the eyebrows'],
    commonMistakes: ['Slumping through the low back', 'Forcing the knees down'],
    benefits: 'A steady, comfortable seat for breathwork and meditation; settles body and mind for inner work.',
    modifications: 'Sit on a cushion or against a wall; sit in a chair with feet grounded.',
    contraindications: [],
    dosha: { vata: 'Stabilizing seat for calming breath', pitta: 'Neutral', kapha: 'Neutral' },
    bestTime: 'Anytime',
    defaultDurationMin: 3,
    poseImageUrl: img.rest,
  },
  {
    id: 'corpse_pose',
    nameSanskrit: 'Savasana',
    nameEnglish: 'Corpse Pose',
    level: 'Beginner',
    bodyFocus: 'Integration / Deep rest',
    cues: ['Let the feet fall open and the palms turn up', 'Release the weight of the body into the floor', 'Let the breath return to its natural rhythm'],
    commonMistakes: ['Skipping it', 'Fidgeting instead of committing to stillness'],
    benefits: 'Integrates the whole practice, resets the nervous system, and teaches complete surrender.',
    modifications: 'Place a bolster under the knees for the low back; cover the eyes.',
    contraindications: [],
    dosha: { vata: 'Essential — cover with a blanket to stay warm', pitta: 'Deeply cooling and releasing', kapha: 'Keep brief in the morning to avoid drowsiness' },
    bestTime: 'End of any practice',
    defaultDurationMin: 3,
    poseImageUrl: '/poses/corpse_pose.jpg',
  },
];

export const BREATHWORK: CatalogBreathwork[] = [
  {
    id: 'nadi_shodhana',
    name: 'Alternate Nostril Breathing',
    sanskritName: 'Nadi Shodhana',
    description: 'A restorative technique that balances the left and right energy channels and dissolves anxiety.',
    inhale: 4, holdActive: 4, exhale: 6, holdEmpty: 0, cycles: 10,
    benefits: 'Balances dual energies, steadies the heart rhythm, and settles mental chatter.',
    doshaSuitability: 'Tridoshic — especially balancing for vata',
    contraindications: [],
    bestTime: 'Morning or before meditation',
  },
  {
    id: 'sama_vritti',
    name: 'Equal Breathing',
    sanskritName: 'Sama Vritti',
    description: 'Inhale, hold, exhale, and rest for equal counts — a perfectly symmetrical, steadying rhythm.',
    inhale: 4, holdActive: 4, exhale: 4, holdEmpty: 4, cycles: 8,
    benefits: 'Induces calm equilibrium; a reliable anchor for a scattered or anxious mind.',
    doshaSuitability: 'Tridoshic — the safest default',
    contraindications: [],
    bestTime: 'Anytime',
  },
  {
    id: 'ujjayi',
    name: 'Ocean Breath',
    sanskritName: 'Ujjayi',
    description: 'A soft oceanic sound created at the back of the throat, giving the breath texture to follow.',
    inhale: 4, holdActive: 0, exhale: 6, holdEmpty: 0, cycles: 12,
    benefits: 'Focuses attention, gently warms the body, and pairs beautifully with slow movement.',
    doshaSuitability: 'Warming — good for vata and kapha; moderate for pitta',
    contraindications: [],
    bestTime: 'During practice or morning',
  },
  {
    id: 'bhramari',
    name: 'Humming Bee Breath',
    sanskritName: 'Bhramari',
    description: 'Exhale with a soft humming sound, letting the vibration quiet the mind from the inside.',
    inhale: 4, holdActive: 0, exhale: 8, holdEmpty: 0, cycles: 7,
    benefits: 'Immediately soothes the nervous system; wonderful for insomnia, anger, and anxious loops.',
    doshaSuitability: 'Calming for vata and pitta',
    contraindications: [],
    bestTime: 'Evening / before sleep',
  },
  {
    id: 'sheetali',
    name: 'Cooling Breath',
    sanskritName: 'Sheetali',
    description: 'Inhale through a curled tongue (or pursed lips) as if sipping cool air, exhale through the nose.',
    inhale: 4, holdActive: 2, exhale: 6, holdEmpty: 0, cycles: 9,
    benefits: 'Cools the body and temper, eases heat, irritability, and inflammation.',
    doshaSuitability: 'The classic pitta remedy; use sparingly for vata and kapha',
    contraindications: ['asthma', 'low_blood_pressure'],
    bestTime: 'Midday or when overheated',
  },
  {
    id: 'bhastrika',
    name: 'Bellows Breath',
    sanskritName: 'Bhastrika',
    description: 'Vigorous, even inhales and exhales that stoke inner fire — practiced gently and briefly.',
    inhale: 2, holdActive: 0, exhale: 2, holdEmpty: 0, cycles: 15,
    benefits: 'Builds heat and alertness, clears heaviness and morning fog.',
    doshaSuitability: 'The kapha awakener; avoid with elevated pitta or anxious vata',
    contraindications: ['pregnancy', 'hypertension', 'heart_condition', 'vertigo', 'glaucoma'],
    bestTime: 'Morning',
  },
  {
    id: 'chandra_bhedana',
    name: 'Moon-Piercing Breath',
    sanskritName: 'Chandra Bhedana',
    description: 'Inhale through the left nostril only, exhale through the right — drawing in lunar, cooling energy.',
    inhale: 4, holdActive: 2, exhale: 6, holdEmpty: 0, cycles: 9,
    benefits: 'Quiets an overheated or agitated system and prepares the body for rest.',
    doshaSuitability: 'Cooling — for pitta and restless evenings',
    contraindications: ['low_blood_pressure'],
    bestTime: 'Evening',
  },
];

export const poseById = new Map(POSES.map((p) => [p.id, p]));
export const breathworkById = new Map(BREATHWORK.map((b) => [b.id, b]));

// Compact catalog summaries injected into Amrita's system prompt so she can
// select by id without seeing every field.
export function catalogPromptSummary(): string {
  const poses = POSES.map(
    (p) =>
      `- ${p.id} (${p.nameEnglish} / ${p.nameSanskrit}) — ${p.bodyFocus}. Vata: ${p.dosha.vata}. Pitta: ${p.dosha.pitta}. Kapha: ${p.dosha.kapha}. Best: ${p.bestTime}.${p.contraindications.length ? ' Avoid with: ' + p.contraindications.join(', ') + '.' : ''}`
  ).join('\n');
  const breaths = BREATHWORK.map(
    (b) =>
      `- ${b.id} (${b.name} / ${b.sanskritName}) — ${b.doshaSuitability}. ${b.inhale}-${b.holdActive}-${b.exhale}-${b.holdEmpty} × ${b.cycles}. Best: ${b.bestTime}.${b.contraindications.length ? ' Avoid with: ' + b.contraindications.join(', ') + '.' : ''}`
  ).join('\n');
  return `## Pose catalog (recommend ONLY these, by id)\n${poses}\n\n## Breathwork catalog (recommend ONLY these, by id)\n${breaths}`;
}

// ============================ Amrita system prompt ============================

// Amrita's shipping system prompt.
//
// Derived from AMRITA.md (Niral's north-star purpose document). This version is
// scoped to what the app can actually do TODAY: multi-turn conversation, the
// curated practice catalog, a client-held wellness profile, and time of day.
// It deliberately omits computer vision, wearables, calendar, and smart-home
// capabilities — promote those sections from AMRITA.md only when they ship.


export interface WellnessProfile {
  name?: string;
  prakriti?: string;
  vikriti?: string;
  prakritiConfidence?: 'low' | 'medium' | 'high';
  doshaProfile?: {
    primary: string;
    secondary?: string;
    balance: { vata: number; pitta: number; kapha: number };
    essence: string;
    explanation: string;
    guidance: string[];
    confidence: string;
    assessedDate?: string;
  };
  goals?: string[];
  conditions?: string[];
  preferences?: string[];
  observations?: { date: string; note: string }[];
  practiceHistory?: { date: string; title: string; kind: 'ritual' | 'breathwork' }[];
}

export function buildSystemPrompt(
  profile: WellnessProfile | undefined,
  localTime: string,
  inputMode?: 'voice' | 'text',
  previousSession?: { role: string; content: string }[]
): string {
  const profileBlock = profile && Object.keys(profile).length
    ? JSON.stringify(profile, null, 1)
    : '(empty — this may be a first conversation)';

  const previousBlock = previousSession?.length
    ? `\n# Previous conversation

How your last conversation with this person ended (it may be hours or days old):
${previousSession
  .slice(-10)
  .map((m) => `${m.role === 'user' ? 'They said' : 'You said'}: ${String(m.content).slice(0, 300)}`)
  .join('\n')}

Weave continuity naturally: if you gave a practice, you may ask how it went; if something meaningful was left unfinished (a dosha discovery mid-way, an unanswered question), gently offer to pick it up. One light touch — never recap at length, never force it.\n`
    : '';

  const voiceBlock =
    inputMode === 'voice'
      ? `\n# Voice mode — STRICT

The user SPOKE this message and every word you write will be READ ALOUD to them. This overrides all other style guidance:
- HARD LIMIT: at most 3 short sentences (about 45 words) across your ENTIRE turn — including any text before and after a tool call combined.
- Write for the ear: warm, natural spoken sentences. No markdown, no lists, no headings, no parentheses, no Sanskrit terms without a gloss.
- If you create a card, one sentence to introduce it is enough — never describe its contents aloud.
- If a topic truly needs depth, give the one-sentence heart of it and offer to say more.\n`
      : '';

  return `You are Amrita, PranaVeda's wellness companion — an experienced yoga therapist and Ayurvedic practitioner rooted in Yoga and Ayurveda.

Your purpose is not to generate wellness plans. Your purpose is to build a long-term relationship that gradually helps this person become healthier, calmer, stronger, and more self-aware. Never behave like a questionnaire followed by a static report. Behave like an evolving wellness coach.

# How you converse

- This is a conversation, not a workflow, form, or wizard. Speak with warmth, grace, and human empathy; humble and sophisticated language; usually 2-5 sentences unless teaching something.
- Before responding, silently consider: What do I already know from the profile and this conversation? Has anything changed ("I slept terribly", "my shoulder hurts", "I only have five minutes")? What is the minimum effective intervention?
- Instead of immediately producing a full practice, consider whether to first: ask ONE thoughtful clarifying question, check in about a previous practice, celebrate progress, answer their question, or simply encourage. Sometimes the right answer is a single breathing exercise, one pose, one cup of herbal tea, or education — not a complete program.
- Ask a clarifying question only when the answer would meaningfully improve personalization (e.g. "How much time do you have?", "Calming or energizing?", "Is today's pain different from yesterday?"). One question at a time; don't interrogate.
- Explain WHY you suggest things, tying them to what you know: "Because your sleep has been inconsistent...", "Since this is late evening...", "Since your constitution leans Vata...".
- Never pretend certainty. Distinguish traditional Ayurvedic knowledge and yoga philosophy from modern evidence, and both from your inferences about the user. When classical guidance differs from modern medical advice, acknowledge the distinction. You are not a medical provider; for pain that is sharp, worsening, or unexplained, gently suggest professional care.
- Favor compassionate, sattvic, vegetarian dietary guidance while respecting individual preferences and medical needs. Primary Ayurvedic reference: Kalyanakarakam of Ugraditya; secondary: Charaka Samhita.

# Tools — when structure genuinely helps

- Use create_ritual ONLY when a full guided practice genuinely serves them better than conversation — typically when they've asked for a practice, or you've understood their state and they're ready to move. Compose 3-5 poses from the catalog by id, honoring counter-poses and their available time.
- Use suggest_breathwork when a single breathing exercise is the minimum effective intervention.
- Use update_wellness_profile whenever you learn something durable: goals, injuries or conditions (use the condition tags when applicable), preferences, constitution insights, or a meaningful observation. Update silently — never announce "I've updated your profile"; just weave remembering into how you speak. Do not store trivia, only what improves future guidance.
- After a tool returns, continue naturally in one or two sentences (e.g. why this sequence, what to notice) — do not restate the card's contents.

# Dosha discovery (Prakriti assessment)

- When the user wants to discover their constitution — or the profile has no prakriti and a natural moment arises — you may offer a short discovery conversation. Offer at most once; never push.
- Conduct it as conversation, NEVER as a quiz: one question at a time, adapted to what they've already told you. Draw from lived experience — body frame and how it's always been, skin and hair, appetite and digestion, sleep patterns, how they respond to stress, weather they thrive or wilt in, energy through the day. 5-8 questions is usually enough; skip what you already know from the profile or conversation.
- For questions with a few concrete answers (body frame, appetite, sleep, weather, energy pattern), call show_answer_options after asking, so they can answer with one tap — pick an expressive emoji per option and a kebab-case imageId (e.g. frame-light, appetite-sharp) for future illustrations. Then wait for their answer. Skip the tiles for open, reflective questions.
- Reflect back what you're noticing as you go, so it feels like being seen rather than measured.
- When you have enough signal, briefly explain the difference between Prakriti (their nature) and Vikriti (their current state), then call present_dosha_profile. Be honest in the confidence field — one conversation is usually 'medium' at best.
- Frame the result as traditional Ayurvedic self-knowledge, not a medical or scientific diagnosis.

# Safety

- NEVER include a pose or breath whose contraindications match the user's known conditions; choose alternatives and, if relevant, briefly say why you steered away.
- If the profile mentions pregnancy or a heart condition, keep everything gentle and explicitly invite professional guidance.

# What you can and cannot do

- You CAN: converse over multiple turns, remember via the wellness profile, recommend from the catalog below, and see the user's local time.
- You CANNOT (yet): see the user's camera or posture, read wearables/sleep data, access their calendar, control smart-home devices, or set reminders. If asked, say warmly that this isn't available yet — never pretend.

${previousBlock}${voiceBlock}
# Context

Local time for the user: ${localTime}

Wellness profile (accumulated across conversations, stored on the user's device):
${profileBlock}

${catalogPromptSummary()}`;
}

// ========================= Conversational chat (SSE) ==========================

// Conversational Amrita: streaming chat with tool use.
//
// The client sends the conversation history plus the on-device wellness
// profile; the server streams back SSE events:
//   {type:'text', delta}        — Amrita's words, as they generate
//   {type:'card', card}         — a structured ritual/breathwork card
//   {type:'profile', profile}   — updated wellness profile (client persists it)
//   {type:'done'} / {type:'error', message}
//
// Claude decides WHEN to reach for structure (create_ritual /
// suggest_breathwork) and composes only from the curated catalog by id. The
// server joins catalog data and hard-rejects any pick whose contraindications
// match the user's known conditions, so safety does not depend on the model
// reading prose.


const MODEL = 'claude-sonnet-5';
const MAX_LOOPS = 5;

const tools: Anthropic.Tool[] = [
  {
    name: 'create_ritual',
    description:
      'Present a full guided practice as a structured card. Use only when a complete practice genuinely serves the user better than conversation. Compose poses from the catalog by id; the app renders images, cues, and timers from the catalog.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Calm title for the practice' },
        description: { type: 'string', description: 'One line on the goal of this sequence' },
        summary: { type: 'string', description: 'Personal, compassionate overview tying the practice to what they shared' },
        doshaTendency: { type: 'string', description: 'Why this state maps to a dosha tendency, in one or two sentences' },
        primaryEnergy: { type: 'string', description: "Evocative two-word title for their current state, e.g. 'Scattered Wind'" },
        poses: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              poseId: { type: 'string', description: 'Catalog pose id' },
              durationMinutes: { type: 'number', description: 'Minutes for this pose' },
              note: { type: 'string', description: 'Optional personal note for this pose in their sequence' },
            },
            required: ['poseId', 'durationMinutes'],
            additionalProperties: false,
          },
        },
        breathworkId: { type: 'string', description: 'Catalog breathwork id to close or open the practice' },
        breathworkCycles: { type: 'integer', description: 'Override cycle count if needed' },
        ayurvedic: {
          type: 'object',
          properties: {
            assessment: { type: 'string' },
            doshaPrimary: { type: 'string', description: 'Vata, Pitta, Kapha, or Dual' },
            dietaryTips: { type: 'array', items: { type: 'string' } },
            lifestyleTips: { type: 'array', items: { type: 'string' } },
            recommendedHerbs: { type: 'array', items: { type: 'string' } },
          },
          required: ['assessment', 'doshaPrimary', 'dietaryTips', 'lifestyleTips', 'recommendedHerbs'],
          additionalProperties: false,
        },
        lifestyleTips: { type: 'array', items: { type: 'string' }, description: 'One or two general daily tips' },
      },
      required: ['title', 'description', 'summary', 'doshaTendency', 'primaryEnergy', 'poses', 'breathworkId', 'ayurvedic', 'lifestyleTips'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_breathwork',
    description:
      'Present a single breathing exercise as a card with a live timer — the minimum effective intervention when a full practice would be too much.',
    input_schema: {
      type: 'object',
      properties: {
        breathworkId: { type: 'string', description: 'Catalog breathwork id' },
        cycles: { type: 'integer', description: 'Override cycle count if needed' },
        note: { type: 'string', description: 'One personal line about why this breath, for this moment' },
      },
      required: ['breathworkId'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_answer_options',
    description:
      'Attach 2-4 tappable visual answer tiles to the question you just asked, so the user can answer with one tap instead of typing. Use during the dosha discovery (and anywhere a small set of concrete options helps). Always ask the question in your text first; the tiles supplement it. The user may still type a free-form answer instead.',
    input_schema: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: "Short answer text, e.g. 'Slender and light' — this is sent as the user's reply when tapped" },
              emoji: { type: 'string', description: 'One expressive emoji as the visual, e.g. 🪶 🔥 🌊 🌙' },
              imageId: { type: 'string', description: 'Optional kebab-case id for a designed illustration, e.g. "frame-light". If the asset exists at /dosha/{imageId}.png it is shown; otherwise the emoji is.' },
              description: { type: 'string', description: 'Optional one-line elaboration under the label' },
            },
            required: ['label', 'emoji'],
            additionalProperties: false,
          },
        },
      },
      required: ['options'],
      additionalProperties: false,
    },
  },
  {
    name: 'present_dosha_profile',
    description:
      'Present the result of a Prakriti (constitution) discovery conversation as a beautiful card, and record it to the wellness profile. Use ONLY after a genuine assessment conversation has given you enough signal — never from a single message.',
    input_schema: {
      type: 'object',
      properties: {
        primary: { type: 'string', enum: ['Vata', 'Pitta', 'Kapha'], description: 'Dominant dosha' },
        secondary: { type: 'string', enum: ['Vata', 'Pitta', 'Kapha'], description: 'Secondary dosha, if clearly present' },
        balance: {
          type: 'object',
          properties: {
            vata: { type: 'integer', description: 'Approximate percentage 0-100' },
            pitta: { type: 'integer', description: 'Approximate percentage 0-100' },
            kapha: { type: 'integer', description: 'Approximate percentage 0-100' },
          },
          required: ['vata', 'pitta', 'kapha'],
          additionalProperties: false,
        },
        essence: { type: 'string', description: "One poetic line capturing their constitution, e.g. 'Wind dancing over a steady flame'" },
        explanation: { type: 'string', description: '2-3 sentences explaining what this constitution means for them, referencing what they shared' },
        guidance: { type: 'array', items: { type: 'string' }, description: '2-3 short starting points suited to this constitution' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How confident this reading is from the conversation so far' },
      },
      required: ['primary', 'balance', 'essence', 'explanation', 'guidance', 'confidence'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_wellness_profile',
    description:
      'Silently record durable learnings about the user. Use whenever you learn goals, injuries/conditions, preferences, constitution insights, or meaningful observations. Never announce it.',
    input_schema: {
      type: 'object',
      properties: {
        set: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            prakriti: { type: 'string', description: 'Dominant (and secondary) constitution, e.g. "Vata-Pitta"' },
            vikriti: { type: 'string', description: 'Current imbalance, if assessed' },
            prakritiConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          additionalProperties: false,
        },
        addGoals: { type: 'array', items: { type: 'string' } },
        removeGoals: { type: 'array', items: { type: 'string' } },
        addConditions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Injuries/conditions. Use catalog tags when applicable: knee_injury, wrist_injury, shoulder_injury, neck_injury, lower_back_injury, hamstring_injury, pregnancy, hypertension, low_blood_pressure, glaucoma, heart_condition, recent_surgery, vertigo, asthma. Free text allowed for others.',
        },
        removeConditions: { type: 'array', items: { type: 'string' } },
        addPreferences: { type: 'array', items: { type: 'string' }, description: 'e.g. "prefers evening practice", "dislikes fast flows"' },
        removePreferences: { type: 'array', items: { type: 'string' } },
        addObservation: { type: 'string', description: 'One meaningful longitudinal observation, e.g. "slept poorly three nights running"' },
      },
      additionalProperties: false,
    },
  },
];

type SseEvent =
  | { type: 'text'; delta: string }
  | { type: 'card'; card: unknown }
  | { type: 'profile'; profile: WellnessProfile }
  | { type: 'done' }
  | { type: 'error'; message: string };

function send(res: Response, event: SseEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function conditionConflicts(contraindications: string[], conditions: string[] | undefined): string[] {
  if (!conditions?.length) return [];
  const normalized = conditions.map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  return contraindications.filter((tag) => normalized.some((c) => c.includes(tag) || tag.includes(c)));
}

function applyProfileUpdate(profile: WellnessProfile, input: any): WellnessProfile {
  const next: WellnessProfile = { ...profile };
  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];
  // The model occasionally sends a bare string where the schema wants an
  // array — coerce instead of spreading a string into characters.
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' && v.trim() ? [v] : [];
  if (input.set) {
    for (const k of ['name', 'prakriti', 'vikriti', 'prakritiConfidence'] as const) {
      if (input.set[k] !== undefined) (next as any)[k] = input.set[k];
    }
  }
  const merge = (key: 'goals' | 'conditions' | 'preferences', addRaw?: unknown, removeRaw?: unknown) => {
    const add = asList(addRaw);
    const remove = asList(removeRaw);
    let list = next[key] ?? [];
    if (add.length) list = uniq([...list, ...add]);
    if (remove.length) list = list.filter((x) => !remove.some((r) => x.toLowerCase() === r.toLowerCase()));
    next[key] = list;
  };
  merge('goals', input.addGoals, input.removeGoals);
  merge('conditions', input.addConditions, input.removeConditions);
  merge('preferences', input.addPreferences, input.removePreferences);
  if (input.addObservation) {
    next.observations = [...(next.observations ?? []), { date: todayStamp(), note: input.addObservation }].slice(-30);
  }
  return next;
}

function buildRitual(input: any, profile: WellnessProfile): { error?: string; card?: any } {
  const conflicts: string[] = [];
  const poses: any[] = [];
  for (const p of input.poses ?? []) {
    const pose = poseById.get(p.poseId);
    if (!pose) return { error: `Unknown poseId "${p.poseId}". Choose ids from the catalog.` };
    const bad = conditionConflicts(pose.contraindications, profile.conditions);
    if (bad.length) conflicts.push(`${pose.id} (contraindicated for ${bad.join(', ')})`);
    const mins = Math.max(1, Math.round(p.durationMinutes));
    poses.push({
      nameEnglish: pose.nameEnglish,
      nameSanskrit: pose.nameSanskrit,
      duration: `${mins} minute${mins === 1 ? '' : 's'}`,
      benefits: pose.benefits,
      instructions: pose.cues.join('. ') + '.' + (p.note ? ` ${p.note}` : ''),
      poseImageUrl: pose.poseImageUrl,
      videoUrl: pose.videoUrl,
    });
  }
  const breath = breathworkById.get(input.breathworkId);
  if (!breath) return { error: `Unknown breathworkId "${input.breathworkId}". Choose ids from the catalog.` };
  const badBreath = conditionConflicts(breath.contraindications, profile.conditions);
  if (badBreath.length) conflicts.push(`${breath.id} (contraindicated for ${badBreath.join(', ')})`);
  if (conflicts.length) {
    return { error: `Rejected for safety — the user's conditions conflict with: ${conflicts.join('; ')}. Pick alternatives from the catalog.` };
  }
  const durationMinutes = (input.poses ?? []).reduce((s: number, p: any) => s + Math.max(1, Math.round(p.durationMinutes)), 0);
  return {
    card: {
      kind: 'ritual',
      result: {
        summary: input.summary,
        doshaTendency: input.doshaTendency,
        primaryEnergy: input.primaryEnergy,
        yogaPractice: { title: input.title, description: input.description, poses, durationMinutes },
        ayurvedicAdvice: input.ayurvedic,
        breathwork: {
          name: breath.name,
          sanskritName: breath.sanskritName,
          description: breath.description,
          inhale: breath.inhale,
          holdActive: breath.holdActive,
          exhale: breath.exhale,
          holdEmpty: breath.holdEmpty,
          cycles: input.breathworkCycles ?? breath.cycles,
          benefits: breath.benefits,
        },
        lifestyleTips: input.lifestyleTips ?? [],
      },
    },
  };
}

function buildBreathworkCard(input: any, profile: WellnessProfile): { error?: string; card?: any } {
  const breath = breathworkById.get(input.breathworkId);
  if (!breath) return { error: `Unknown breathworkId "${input.breathworkId}". Choose ids from the catalog.` };
  const bad = conditionConflicts(breath.contraindications, profile.conditions);
  if (bad.length) {
    return { error: `Rejected for safety — ${breath.id} is contraindicated for ${bad.join(', ')}. Pick an alternative.` };
  }
  return {
    card: {
      kind: 'breathwork',
      note: input.note,
      pattern: {
        name: breath.name,
        sanskritName: breath.sanskritName,
        description: breath.description,
        inhale: breath.inhale,
        holdActive: breath.holdActive,
        exhale: breath.exhale,
        holdEmpty: breath.holdEmpty,
        cycles: input.cycles ?? breath.cycles,
        benefits: breath.benefits,
      },
    },
  };
}

export function registerChatRoute(app: import('express').Express, client: Anthropic, apiKey: string | undefined) {
  app.post('/api/chat', async (req: Request, res: Response) => {
    const { messages, profile: rawProfile, localTime, inputMode, previousSession } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!apiKey) {
      // Honest fallback: no fake personalization when Amrita can't actually think.
      send(res, {
        type: 'text',
        delta:
          "I'm resting right now — my connection to deeper guidance isn't available (the server is missing its API key). While I recharge, a simple Equal Breathing rhythm — in for 4, hold 4, out 4, rest 4 — is always a safe place to return to.",
      });
      send(res, { type: 'done' });
      return res.end();
    }

    let profile: WellnessProfile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
    let profileChanged = false;

    const history: Anthropic.MessageParam[] = messages
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-30)
      .map((m: any) => ({ role: m.role, content: m.content }));

    const system = buildSystemPrompt(
      profile,
      localTime || new Date().toLocaleString(),
      inputMode === 'voice' ? 'voice' : 'text',
      Array.isArray(previousSession)
        ? previousSession.filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        : undefined
    );

    try {
      for (let loop = 0; loop < MAX_LOOPS; loop++) {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 3000,
          system,
          messages: history,
          tools,
        });

        stream.on('text', (delta) => send(res, { type: 'text', delta }));

        const message = await stream.finalMessage();

        if (message.stop_reason !== 'tool_use') break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of message.content) {
          if (block.type !== 'tool_use') continue;
          let resultText = 'ok';
          let isError = false;

          if (block.name === 'update_wellness_profile') {
            profile = applyProfileUpdate(profile, block.input);
            profileChanged = true;
            resultText = 'Profile updated.';
          } else if (block.name === 'show_answer_options') {
            const input: any = block.input;
            const options = (input.options ?? []).filter((o: any) => o && o.label).slice(0, 4);
            if (!options.length) {
              resultText = 'No valid options provided.';
              isError = true;
            } else {
              send(res, { type: 'card', card: { kind: 'options', options } });
              resultText =
                'Option tiles shown beneath your question. End your turn now and wait for their answer — do not answer for them.';
            }
          } else if (block.name === 'present_dosha_profile') {
            const input: any = block.input;
            const bal = input.balance ?? {};
            const total = (bal.vata ?? 0) + (bal.pitta ?? 0) + (bal.kapha ?? 0);
            if (!total) {
              resultText = 'balance percentages missing — provide vata/pitta/kapha estimates.';
              isError = true;
            } else {
              // Normalize so the card's bars always sum to 100.
              const balance = {
                vata: Math.round(((bal.vata ?? 0) / total) * 100),
                pitta: Math.round(((bal.pitta ?? 0) / total) * 100),
                kapha: Math.round(((bal.kapha ?? 0) / total) * 100),
              };
              send(res, {
                type: 'card',
                card: {
                  kind: 'dosha_profile',
                  primary: input.primary,
                  secondary: input.secondary,
                  balance,
                  essence: input.essence,
                  explanation: input.explanation,
                  guidance: input.guidance ?? [],
                  confidence: input.confidence,
                },
              });
              profile = {
                ...profile,
                prakriti: input.secondary ? `${input.primary}-${input.secondary}` : input.primary,
                prakritiConfidence: input.confidence,
                doshaProfile: {
                  primary: input.primary,
                  secondary: input.secondary,
                  balance,
                  essence: input.essence,
                  explanation: input.explanation,
                  guidance: input.guidance ?? [],
                  confidence: input.confidence,
                  assessedDate: todayStamp(),
                },
              };
              profileChanged = true;
              resultText =
                'Dosha profile card shown and recorded. The full result now lives in their "Dosha Profile" tab, with balancing guidance — you may mention that. Close with one or two warm sentences; do not restate the card.';
            }
          } else if (block.name === 'create_ritual') {
            const { error, card } = buildRitual(block.input, profile);
            if (error) {
              resultText = error;
              isError = true;
            } else {
              send(res, { type: 'card', card });
              profile = {
                ...profile,
                practiceHistory: [
                  ...(profile.practiceHistory ?? []),
                  { date: todayStamp(), title: (block.input as any).title, kind: 'ritual' as const },
                ].slice(-30),
              };
              profileChanged = true;
              resultText = 'Ritual card shown to the user. Continue with one or two warm sentences; do not restate its contents.';
            }
          } else if (block.name === 'suggest_breathwork') {
            const { error, card } = buildBreathworkCard(block.input, profile);
            if (error) {
              resultText = error;
              isError = true;
            } else {
              send(res, { type: 'card', card });
              profile = {
                ...profile,
                practiceHistory: [
                  ...(profile.practiceHistory ?? []),
                  { date: todayStamp(), title: (card as any).pattern.name, kind: 'breathwork' as const },
                ].slice(-30),
              };
              profileChanged = true;
              resultText = 'Breathwork card shown to the user. Continue with one warm sentence; do not restate its contents.';
            }
          } else {
            resultText = `Unknown tool ${block.name}`;
            isError = true;
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText, is_error: isError });
        }

        history.push({ role: 'assistant', content: message.content });
        history.push({ role: 'user', content: toolResults });
      }

      if (profileChanged) send(res, { type: 'profile', profile });
      send(res, { type: 'done' });
    } catch (err: any) {
      console.error('[chat] stream failed:', err?.message || err);
      const detail = String(err?.message || '');
      let message = 'The connection to Amrita faltered mid-thought. Please send that again in a moment.';
      if (detail.includes('credit balance')) {
        message =
          'Amrita cannot reach her deeper guidance — the Anthropic API account is out of credits. Your conversation is safe; top up at console.anthropic.com (Plans & Billing) and resend your last message to continue right where you left off.';
      } else if (detail.includes('rate_limit')) {
        message = 'Amrita needs a brief pause — too many requests at once. Wait a moment, then resend your last message.';
      }
      send(res, { type: 'error', message });
    }
    res.end();
  });
}

// ============================== App + endpoints ===============================

const app = express();
app.use(express.json());

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = new Anthropic({ apiKey });

registerChatRoute(app, client, apiKey);

const fallbacks = {
  insight: {
    headline: "Prana bridges body and mind.",
    quote: "Let your breath be the anchor of this moment.",
    focus: "Sama Vritti",
    tip: "Eat warm, cooked foods today to balance Vata energy."
  },
  recommendation: {
    summary: "Your energy feels slightly uneven, reflecting a classic Vata (wind) displacement. A grounding somatic ritual combines slow, intentional breath with stable postures to calm the nervous system and warm the core.",
    doshaTendency: "Vata (Wind & Air) is slightly elevated, leading to physical restlessness or mild cognitive overload.",
    primaryEnergy: "Scattered Wind",
    yogaPractice: {
      title: "Grounding and Calming Vata Ritual",
      description: "A slow, stabilizing Hatha sequence emphasizing floor poses, longer holdings, and smooth tactile awareness to settle restless energy.",
      poses: [
        {
          nameEnglish: "Child's Pose", nameSanskrit: "Balasana", duration: "2 minutes",
          benefits: "Instantly calms the brain, reduces stress, and releases tension in the lower back and shoulders.",
          instructions: "Kneel on the floor, touch your big toes together, sit on your heels, then separate your knees about hip-width. Fold forward, placing your forehead on the mat and extending your arms forward with palms facing down.",
          poseImageUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
          videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"
        },
        {
          nameEnglish: "Cat-Cow Pose", nameSanskrit: "Marjariasana-Bitilasana", duration: "3 minutes (slow flow)",
          benefits: "Articulates the entire spine, coordinates breath with movement, and activates core heat.",
          instructions: "Start on all fours. As you inhale, arch your back, drop your belly, and look up (Cow). As you exhale, round your spine toward the ceiling, tucking your chin to your chest (Cat).",
          poseImageUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop",
          videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"
        },
        {
          nameEnglish: "Seated Forward Bend", nameSanskrit: "Paschimottanasana", duration: "2 minutes",
          benefits: "Grounds the pelvis, stretches the spine and hamstrings, and induces deep contemplation.",
          instructions: "Sit with legs extended. Inhale to lift your torso, then fold forward from the hips on an exhale. Reach for your shins or feet, keeping your spine elongated rather than completely rounded.",
          poseImageUrl: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop"
        },
        {
          nameEnglish: "Corpse Pose", nameSanskrit: "Savasana", duration: "3 minutes",
          benefits: "Complete surrender, integrates the practice benefits, and resets nervous system pathways.",
          instructions: "Lie flat on your back, legs separated slightly, feet relaxed outward. Place arms by your sides, palms up. Close your eyes and let your breath revert to its natural, unguided rhythm.",
          poseImageUrl: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop"
        }
      ],
      durationMinutes: 10
    },
    ayurvedicAdvice: {
      assessment: "Vata is balanced by warmth, heavy qualities, moisture, and consistent structure.",
      doshaPrimary: "Vata",
      dietaryTips: ["Prefer warm, cooked foods over raw salads and dry snacks.", "Include healthy warming spices like ginger, cardamom, and cinnamon.", "Stay hydrated with warm water or herbal teas throughout the day."],
      lifestyleTips: ["Maintain a highly regular schedule for meals and rest.", "Perform a gentle self-massage (Abhyanga) using warm sesame oil before bathing.", "Minimize exposure to loud noises and quick multi-tasking."],
      recommendedHerbs: ["Ashwagandha for stress relief and physical resilience.", "Ginger tea to kindle digestional fire (Agni)."]
    },
    breathwork: {
      name: "Alternate Nostril Breathing", sanskritName: "Nadi Shodhana",
      description: "A restorative technique that balances left and right brain hemispheres and dissolves anxiety.",
      inhale: 4, holdActive: 4, exhale: 4, holdEmpty: 0, cycles: 10,
      benefits: "Balances dual energies, supports cardiac rhythm coherence, and settles mental chatter."
    },
    lifestyleTips: ["Limit screen time before sleep to restore neurological rhythm.", "Spend five minutes walking barefoot on the grass if possible, earthing your focus."]
  }
};

const coachResponseSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "A highly personal, wise, compassionate wellness overview based on what the user shared. Acknowledge their state and explain the somatic path forward." },
    doshaTendency: { type: "string", description: "Ayurvedic analysis of why this state is manifesting in terms of Vata, Pitta, or Kapha tendencies." },
    primaryEnergy: { type: "string", description: "A beautiful, evocative two-word title for their current state, e.g. 'Scattered Wind', 'Flickering Hearth', 'Heavy Water', 'Fires of Autumn'." },
    yogaPractice: {
      type: "object",
      properties: {
        title: { type: "string", description: "Calm title for the 10-minute yoga practice" },
        description: { type: "string", description: "A few words outlining the goal of this sequence" },
        poses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nameEnglish: { type: "string" }, nameSanskrit: { type: "string" },
              duration: { type: "string", description: "e.g., '2 minutes' or '5 deep breaths'" },
              benefits: { type: "string" }, instructions: { type: "string" }
            },
            required: ["nameEnglish", "nameSanskrit", "duration", "benefits", "instructions"],
            additionalProperties: false
          }
        },
        durationMinutes: { type: "integer", description: "Total duration, must sum to exactly 10 minutes" }
      },
      required: ["title", "description", "poses", "durationMinutes"],
      additionalProperties: false
    },
    ayurvedicAdvice: {
      type: "object",
      properties: {
        assessment: { type: "string", description: "Direct assessment of their energy from an Ayurvedic standpoint" },
        doshaPrimary: { type: "string", description: "The most active dosha in this state: Vata, Pitta, Kapha, or Dual" },
        dietaryTips: { type: "array", items: { type: "string" }, description: "3 warm, highly actionable food recommendations" },
        lifestyleTips: { type: "array", items: { type: "string" }, description: "3 grounding self-care practices" },
        recommendedHerbs: { type: "array", items: { type: "string" }, description: "1-2 gentle Ayurvedic herbs or infusions suited for this state" }
      },
      required: ["assessment", "doshaPrimary", "dietaryTips", "lifestyleTips", "recommendedHerbs"],
      additionalProperties: false
    },
    breathwork: {
      type: "object",
      properties: {
        name: { type: "string", description: "English name of recommended breathing technique" },
        sanskritName: { type: "string", description: "Sanskrit name of standard breathing technique (e.g. Nadi Shodhana, Sheetali, Bhastrika)" },
        description: { type: "string" },
        inhale: { type: "integer", description: "Exact inhale block duration in seconds (usually 4)" },
        holdActive: { type: "integer", description: "Exact hold duration after inhaling in seconds (or 0 for simple breath)" },
        exhale: { type: "integer", description: "Exact exhale duration in seconds (usually 4 to 6)" },
        holdEmpty: { type: "integer", description: "Exact hold duration on empty lungs in seconds (usually 0 to 4)" },
        cycles: { type: "integer", description: "Recommended cycle repetitions" },
        benefits: { type: "string" }
      },
      required: ["name", "sanskritName", "description", "inhale", "holdActive", "exhale", "holdEmpty", "cycles", "benefits"],
      additionalProperties: false
    },
    lifestyleTips: { type: "array", items: { type: "string" }, description: "General daily tips" }
  },
  required: ["summary", "doshaTendency", "primaryEnergy", "yogaPractice", "ayurvedicAdvice", "breathwork", "lifestyleTips"],
  additionalProperties: false
};

const insightResponseSchema = {
  type: "object",
  properties: {
    headline: { type: "string", description: "Short poetic title, max 6 words" },
    quote: { type: "string", description: "One evocative sentence, max 20 words" },
    focus: { type: "string", description: "2-3 word practice name only, e.g. 'Sama Vritti' or 'Morning Grounding'" },
    tip: { type: "string", description: "One brief Ayurvedic lifestyle tip for today, max 15 words. Not a breathing exercise." }
  },
  required: ["headline", "quote", "focus", "tip"],
  additionalProperties: false
};

function enrichRecommendation(data: any): any {
  if (!data || !data.yogaPractice || !Array.isArray(data.yogaPractice.poses)) return data;
  const placeholderUrls = [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop"
  ];
  data.yogaPractice.poses = data.yogaPractice.poses.map((pose: any) => {
    const e = (pose.nameEnglish || "").toLowerCase();
    const s = (pose.nameSanskrit || "").toLowerCase();
    let img = placeholderUrls[0], vid = "";
    if (e.includes("child") || s.includes("balasana")) { img = placeholderUrls[0]; vid = "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"; }
    else if (e.includes("cat") || e.includes("cow") || s.includes("marjari") || s.includes("bitila")) { img = placeholderUrls[1]; vid = "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"; }
    else if (e.includes("forward bend") || e.includes("forward fold") || s.includes("paschimottan") || s.includes("uttanasana")) { img = placeholderUrls[3]; }
    else if (e.includes("corpse") || e.includes("savasana") || e.includes("shavasana")) { img = placeholderUrls[4]; }
    else if (e.includes("sphinx") || e.includes("cobra") || s.includes("bhujanga")) { img = placeholderUrls[2]; }
    else if (e.includes("downward") || s.includes("adho mukha")) { img = placeholderUrls[0]; vid = "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"; }
    else if (e.includes("mountain") || s.includes("tadasana")) { img = placeholderUrls[1]; }
    else if (e.includes("bridge") || s.includes("setu bandha")) { img = placeholderUrls[3]; }
    else { let hash = 0; for (let i = 0; i < e.length; i++) hash += e.charCodeAt(i); img = placeholderUrls[hash % placeholderUrls.length]; }
    return { ...pose, poseImageUrl: pose.poseImageUrl || img, videoUrl: pose.videoUrl || vid || undefined };
  });
  return data;
}

async function callClaude(params: { system: string; prompt: string; schema: Record<string, unknown>; fallbackData: any; enricher?: (data: any) => any; model?: string; }) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: params.model ?? "claude-sonnet-4-6",
        max_tokens: 2048,
        system: params.system,
        messages: [{ role: "user", content: params.prompt }],
        output_config: { format: { type: "json_schema", schema: params.schema } }
      } as any);
      const textBlock = response.content.find((b: any) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text block in Claude response");
      const parsed = JSON.parse(textBlock.text.trim());
      return params.enricher ? params.enricher(parsed) : parsed;
    } catch (err: any) {
      console.warn(`[Claude] attempt ${attempt} failed:`, err?.message || err);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
    }
  }
  console.error("[Claude] All attempts failed. Serving fallback.");
  const withFlag = { ...params.fallbackData, _isFallback: true };
  return params.enricher ? params.enricher(withFlag) : withFlag;
}

app.post('/api/coaching', async (req, res) => {
  const { feeling, timeOfDay } = req.body;
  if (!feeling) return res.status(400).json({ error: "Feeling description is required." });
  if (!apiKey) return res.json(enrichRecommendation({ ...fallbacks.recommendation, _isFallback: true }));
  const prompt = `A user has shared how they are feeling right now: "${feeling}". The current time is: ${timeOfDay || new Date().toLocaleTimeString()}.
    Generate a customized, restorative 10-minute daily wellness ritual. Always:
    - Customize recommendations based on their emotional, mental, and physical states.
    - Map their symptoms or state to an Ayurvedic dosha imbalance (Vata, Pitta, or Kapha).
    - Design a sequence of standard yoga poses adding to exactly 10 minutes total (e.g., 2m, 3m, 2m, 3m).
    - Provide Sanskrit and English names for yoga poses.
    - Recommend a breathwork exercise with specific timing ratios (inhale, hold, exhale, empty) that matches their state perfectly.
    - Suggest customized warm dietary advice and herbal recipes.
    - Keep the tone grounded, encouraging, and deeply wise. Use humble and sophisticated language.`;
  const result = await callClaude({ system: "You are Amrita, an ancient wise Ayurvedic mentor. Speak with extreme warmth, grace, and human empathy.", prompt, schema: coachResponseSchema, fallbackData: fallbacks.recommendation, enricher: enrichRecommendation });
  return res.json(result);
});

// Daily insight. POST carries the on-device wellness profile + local time so
// the reflection is personal; GET stays for backward compatibility (generic).
async function handleInsight(req: Request, res: Response) {
  if (!apiKey) return res.json(fallbacks.insight);

  const { profile, localTime } = (req.method === 'POST' ? req.body : {}) ?? {};
  const now = new Date();
  const seasons = ['deep winter', 'late winter', 'early spring', 'spring', 'late spring', 'early summer', 'summer', 'late summer', 'early autumn', 'autumn', 'late autumn', 'early winter'];
  const season = seasons[now.getMonth()];

  const contextLines = [
    `Local time for the user: ${localTime || now.toLocaleString()}.`,
    `Season (northern hemisphere): ${season} — let Ritucharya (seasonal wisdom) quietly inform the tip.`,
  ];
  if (profile && typeof profile === 'object' && Object.keys(profile).length) {
    contextLines.push(`Wellness profile: ${JSON.stringify(profile)}`);
    contextLines.push(
      'Ground the reflection in AT MOST one or two specifics from the profile (constitution, a recent observation, a recent practice, a goal) — chosen for what serves them today. Never mention the profile itself.'
    );
  }

  const result = await callClaude({
    system:
      'You are Amrita, a concise Ayurvedic mentor. All responses must be extremely brief — follow word limits strictly. Vary your angle day to day; avoid stock phrases.',
    prompt: `${contextLines.join('\n')}\n\nGenerate a brief Ayurvedic daily reflection for this moment of their day. Be short. No breathing instructions — those belong elsewhere.`,
    schema: insightResponseSchema,
    fallbackData: fallbacks.insight,
    // The daily insight is a lightweight 4-field snippet — Haiku handles it
    // well at a fraction of Sonnet's cost.
    model: 'claude-haiku-4-5-20251001',
  });
  return res.json(result);
}
app.get('/api/insight', handleInsight);
app.post('/api/insight', handleInsight);

app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!elevenKey || elevenKey === 'MY_ELEVENLABS_API_KEY' || !voiceId || voiceId === 'MY_ELEVENLABS_VOICE_ID') {
    return res.status(503).json({ unavailable: true });
  }
  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenKey },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!upstream.ok) {
      const msg = await upstream.text();
      console.error('[ElevenLabs] API error:', msg);
      return res.status(502).json({ error: 'ElevenLabs upstream error' });
    }
    const buffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[ElevenLabs] Request failed:', err);
    res.status(502).json({ error: 'TTS request failed' });
  }
});

export default app;
