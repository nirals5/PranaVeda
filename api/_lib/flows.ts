// Video flows: full follow-along sequences, for the apps' Library → Flows and
// the website's Flows tab. Kept free of server code so the website can import
// it too (like explore.ts). The videos and their covers live in Cloudflare R2,
// served from media.pranaveda.app; they are cached for a year, so a changed
// video goes up under a new file name.

export const MEDIA_BASE = 'https://media.pranaveda.app';

export const FLOW_GROUPS = [
  'Sun salutations',
  'Back & spine',
  'Standing & warrior',
  'Hips',
  'With props',
  'Integrated',
  'Yin',
  'Free flow',
] as const;
export type FlowGroup = (typeof FLOW_GROUPS)[number];

export interface Flow {
  id: string;
  title: string;
  group: FlowGroup;
  minutes: number;
  videoUrl: string;
  coverUrl: string;
  // Catalog poses (by id) it features, so a pose page can offer the flow.
  poses: string[];
}

// [id (file name in R2's videos/), title, group, length in seconds, poses]
const FLOWS: [string, string, FlowGroup, number, string[]][] = [
  ['basic_surya_namaskar', 'Basic Surya Namaskar', 'Sun salutations', 119, []],
  ['sun_salutation_b', 'Sun Salutation B', 'Sun salutations', 252, []],
  ['spinal_wave', 'Spinal Wave', 'Back & spine', 92, []],
  ['lower_back_release_flow', 'Lower Back Release', 'Back & spine', 127, []],
  ['flow_for_the_back', 'Flow for the Back', 'Back & spine', 123, []],
  ['back_flow_no_instructions', 'Back Flow (no instructions)', 'Back & spine', 51, []],
  ['flow_for_the_sides_back', 'Flow for the Sides & Back', 'Back & spine', 122, []],
  ['back_opening_with_a_yoga_belt', 'Back Opening with a Yoga Belt', 'Back & spine', 212, []],
  ['standing_back_bend_to_chakrasan', 'Standing Back Bend to Wheel', 'Back & spine', 209, []],
  ['warrior_flow', 'Warrior Flow', 'Standing & warrior', 118, ['warrior_1', 'warrior_2']],
  ['flow_of_energy_with_the_asana_warrior_3_leg_dog', 'Flow of Energy – Warrior & Three-Legged Dog', 'Standing & warrior', 94, ['warrior_1', 'warrior_2', 'downward_dog']],
  ['hip_mobility_m_series_with_pigeon_double_pigeon', 'Hip Mobility – M Series with Pigeon', 'Hips', 154, ['pigeon']],
  ['cat_cow_series_with_bolster', 'Cat & Cow with a Bolster', 'With props', 128, ['cat_cow']],
  ['cat_cow_series_with_yoga_block', 'Cat & Cow with a Yoga Block', 'With props', 182, ['cat_cow']],
  ['setu_bandhasan_with_yoga_block', 'Bridge with a Yoga Block', 'With props', 148, ['bridge']],
  ['flow_with_a_stick', 'Flow with a Stick', 'With props', 255, []],
  ['integrated_yoga_basic', 'Integrated Yoga Basic', 'Integrated', 129, []],
  ['integrated_2_basic_with_dragon_malasana', 'Integrated 2 – Dragon & Garland', 'Integrated', 94, ['lizard']],
  ['integrated_3_malasana_with_twisting_warrior_twisting', 'Integrated 3 – Twisting Garland & Warrior', 'Integrated', 113, []],
  ['integrated_4_flow', 'Integrated 4', 'Integrated', 119, []],
  ['integrated_flow_with_the_yoga_belt', 'Integrated Flow with a Yoga Belt', 'Integrated', 121, []],
  ['yin_dragon_flow_with_puppy_pose', 'Yin Dragon with Puppy', 'Yin', 335, ['lizard']],
  ['yin_flow_with_yoga_belt', 'Yin Flow with a Yoga Belt', 'Yin', 245, []],
  ['yin_flow_for_inner_leg_outer_hip_with_dragon', 'Yin for Inner Leg & Outer Hip', 'Yin', 298, ['lizard']],
  ['yin_flow_with_2_yoga_blocks', 'Yin with 2 Yoga Blocks', 'Yin', 329, []],
  ['flow_no_instructions', 'Flow (no instructions)', 'Free flow', 227, []],
];

export const flows: Flow[] = FLOWS.map(([id, title, group, seconds, poses]) => ({
  id,
  title,
  group,
  minutes: Math.max(1, Math.round(seconds / 60)),
  videoUrl: `${MEDIA_BASE}/videos/${id}.mp4`,
  coverUrl: `${MEDIA_BASE}/videos/${id}.jpg`,
  poses,
}));

// The flows that feature a pose, for its page.
export const flowsWithPose = (poseId: string, list: Flow[] = flows) => list.filter((f) => f.poses.includes(poseId));
