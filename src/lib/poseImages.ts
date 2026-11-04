import type React from 'react';

// Which picture to show for a pose, shared by the practice page and the chat
// card so both always show the same one.

/** A stock photo for a pose that has no photo of its own yet. */
export const getFallbackPoseImage = (pose: { nameEnglish: string; nameSanskrit?: string }) => {
  const name = (pose.nameEnglish || '').toLowerCase();
  const sanskrit = (pose.nameSanskrit || '').toLowerCase();

  if (name.includes("child") || sanskrit.includes("balasana")) {
    return "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("cat") || name.includes("cow") || sanskrit.includes("marjari") || sanskrit.includes("bitila")) {
    return "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("forward bend") || name.includes("forward fold") || sanskrit.includes("paschi") || sanskrit.includes("uttana")) {
    return "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("corpse") || name.includes("savasana") || sanskrit.includes("savasana")) {
    return "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("sphinx") || name.includes("cobra") || sanskrit.includes("bhujanga")) {
    return "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop";
  }
  if (name.includes("meditation") || name.includes("easy pose") || sanskrit.includes("sukhasana")) {
    return "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop";
  }

  // Consistent background rotating based on length
  const placeholders = [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop"
  ];
  const charSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return placeholders[charSum % placeholders.length];
};

// Niral's composited room scenes are her final art, shown verbatim. The
// server names the right file for each pose (sceneImageUrl). Rituals saved
// before it did are worked out here the same way; if a pose has no scene,
// onError falls back to the flat photo.
const WIDE_SCENES = new Set(['triangle', 'dancer', 'seated_twist']);

export const poseSceneUrl = (pose: { poseId?: string; sceneImageUrl?: string }) =>
  pose.sceneImageUrl ??
  (pose.poseId ? `/poses_with_background/web/${pose.poseId}${WIDE_SCENES.has(pose.poseId) ? '_wide' : ''}.webp` : undefined);

export const fallbackToFlatImage = (e: React.SyntheticEvent<HTMLImageElement>, flatUrl: string) => {
  if (e.currentTarget.src !== flatUrl && !e.currentTarget.dataset.fellBack) {
    e.currentTarget.dataset.fellBack = '1';
    e.currentTarget.src = flatUrl;
  }
};

/** The flat photo for a pose: its own, or a stock one until it has one. */
export const poseFlatUrl = (pose: { nameEnglish: string; nameSanskrit?: string; poseImageUrl?: string }) =>
  pose.poseImageUrl || getFallbackPoseImage(pose);

/** The picture to try first: the room scene when there is one, else the flat
 *  photo. Pair it with fallbackToFlatImage(e, poseFlatUrl(pose)) as onError. */
export const posePictureUrl = (pose: { poseId?: string; sceneImageUrl?: string; nameEnglish: string; nameSanskrit?: string; poseImageUrl?: string }) =>
  poseSceneUrl(pose) || poseFlatUrl(pose);
