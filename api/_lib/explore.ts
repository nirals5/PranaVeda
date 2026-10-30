// Explore poses and the "Not for you" check, kept free of server code so the
// website can import it too (like doshaGuide.ts). The iOS and Android apps
// carry the same check in Swift and Kotlin.

// An advanced pose that is never offered (G3: where_shown = explore_only), for
// the apps' Library → Explore and the website's Explore tab, shown with an
// at-your-own-risk caveat. Amrita only knows the names, so she can point to
// it; she never puts one in a card.
export interface ExplorePose {
  id: string;
  nameSanskrit: string;
  nameEnglish: string;
  bodyFocus: string;
  benefits: string;
  cues: string[];
  commonMistakes: string[];
  modifications: string;
  // The conditions it must be avoided with, with the everyday words a profile
  // may use for them, so an app can say "Not for you: you've said …".
  avoidWith: { code: string; label: string; words: string[] }[];
  // Who the source warns, in its own words.
  sourceCaution?: string;
  // The pose to follow it with, by name.
  followWith?: string;
  avoidAfterMeal?: true;
}

// "Bad Knee!" → " bad knee " (spaces at both ends, so a phrase matches only as
// whole words: "knee" is found in "bad knee", "knee" is not found in "kneel").
export const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

// The labels of the pose's conditions a profile mentions, by code, label or
// everyday words, plus the older underscore match the server keeps:
// ["bad knee"] → ["Knee injury"].
export function exploreNotFor(pose: ExplorePose, profileConditions: string[] | undefined): string[] {
  if (!profileConditions?.length) return [];
  const said = profileConditions.map(words);
  const older = profileConditions.map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  return pose.avoidWith
    .filter((c) => {
      const terms = [c.code, c.label, ...c.words].map(words).filter((t) => t.trim());
      return said.some((s) => terms.some((t) => s.includes(t))) || older.some((o) => o.includes(c.code) || c.code.includes(o));
    })
    .map((c) => c.label);
}
