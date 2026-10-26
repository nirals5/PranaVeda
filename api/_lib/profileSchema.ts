import { z } from 'zod';

// What a stored wellness profile may look like. Every write is checked
// against this, so a buggy client (an old app version, say) is refused
// instead of corrupting the profile every other device then reads.
//
// Known fields are checked; unknown ones are allowed through, because Amrita's
// profile tool adds fields over time and an older server must not drop them.
// The whole profile is also capped in size.

export const MAX_PROFILE_BYTES = 48 * 1024;

// How much yoga someone has practised; only "experienced" unlocks the practices
// marked for experienced practitioners (G2).
export const EXPERIENCE_LEVELS = ['beginner', 'regular', 'experienced'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

const text = (max: number) => z.string().max(max);
const list = (items: number, length: number) => z.array(text(length)).max(items);
const day = text(32);

export const wellnessProfileSchema = z.looseObject({
  name: text(80).optional(),
  prakriti: text(60).optional(),
  vikriti: text(60).optional(),
  prakritiConfidence: z.enum(['low', 'medium', 'high']).optional(),
  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  experienceOfferedOn: day.optional(), // when Amrita last offered a move up
  doshaProfile: z
    .looseObject({
      primary: text(20),
      secondary: text(20).optional(),
      balance: z.looseObject({ vata: z.number(), pitta: z.number(), kapha: z.number() }),
      essence: text(2000),
      explanation: text(4000),
      guidance: list(20, 1000),
      confidence: text(20),
      assessedDate: day.optional(),
    })
    .optional(),
  goals: list(60, 300).optional(),
  conditions: list(60, 300).optional(),
  preferences: list(60, 300).optional(),
  observations: z.array(z.looseObject({ date: day, note: text(1000) })).max(60).optional(),
  practiceHistory: z
    .array(z.looseObject({ date: day, title: text(300), kind: z.enum(['ritual', 'breathwork']) }))
    .max(60)
    .optional(),
});

export type StoredProfile = z.infer<typeof wellnessProfileSchema>;

// Returns the profile if it may be stored, or null.
export function parseProfile(value: unknown): StoredProfile | null {
  if (JSON.stringify(value ?? null).length > MAX_PROFILE_BYTES) return null;
  const parsed = wellnessProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
