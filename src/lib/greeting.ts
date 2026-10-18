export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

// Which greeting fits the hour (0–23, local). Morning starts at 5, so someone
// up after midnight is wished a good evening rather than a good morning. The
// iOS and Android apps use the same hours (ChatView.swift, ChatScreen.kt).
export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}
