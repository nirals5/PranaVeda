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
    poseImageUrl: img.child,
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
    poseImageUrl: img.fold,
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
    poseImageUrl: img.flow,
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
    poseImageUrl: img.flow,
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
    poseImageUrl: img.backbend,
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
    poseImageUrl: img.backbend,
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
    poseImageUrl: img.backbend,
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
    poseImageUrl: img.rest,
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
    poseImageUrl: img.rest,
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
