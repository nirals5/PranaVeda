// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AmritaChat from '../src/components/AmritaChat';
import { getFallbackPoseImage, poseFlatUrl, posePictureUrl } from '../src/lib/poseImages';
import type { ChatItem, RecommendationResult, YogaPose } from '../src/types';

// The practice card in the website's chat shows each pose as a picture, the
// same picture the practice page shows, falling back to the flat photo when a
// room scene is missing.

const pose = (p: Partial<YogaPose> & { nameEnglish: string }): YogaPose => ({
  nameSanskrit: '', duration: '3 minutes', benefits: '', instructions: '', ...p,
});

const ritual = (poses: YogaPose[]): RecommendationResult => ({
  summary: '', doshaTendency: 'Vata', primaryEnergy: 'Settling dusk',
  yogaPractice: { title: 'Evening Wind Down', description: 'A gentle close to the day', poses, durationMinutes: 19 },
  ayurvedicAdvice: {} as RecommendationResult['ayurvedicAdvice'],
  breathwork: { name: 'Humming Bee Breath', description: '', inhale: 4, holdActive: 0, exhale: 6, holdEmpty: 0, cycles: 6, benefits: '' },
  lifestyleTips: [],
});

const showCard = (result: RecommendationResult) => {
  const items: ChatItem[] = [{ id: 'a1', role: 'assistant', text: 'Sleep well.', cards: [{ kind: 'ritual', result }] }];
  render(createElement(AmritaChat, {
    items, isStreaming: false, onSend: vi.fn(), onOpenRitual: vi.fn(), onOpenVoice: vi.fn(),
    onReset: vi.fn(), voiceMuted: true, onToggleVoiceMuted: vi.fn(),
  }));
  return screen.getByRole('list', { name: 'Poses in this practice' });
};

beforeEach(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

describe('pose pictures', () => {
  it('prefers the room scene, then the pose photo, then a stock photo', () => {
    const scene = pose({ nameEnglish: 'Bridge Pose', poseId: 'bridge', sceneImageUrl: 'https://pranaveda.app/poses_with_background/web/bridge.webp', poseImageUrl: 'https://pranaveda.app/poses/bridge.jpg' });
    expect(posePictureUrl(scene)).toBe('https://pranaveda.app/poses_with_background/web/bridge.webp');

    const flat = pose({ nameEnglish: 'Bridge Pose', poseImageUrl: 'https://pranaveda.app/poses/bridge.jpg' });
    expect(posePictureUrl(flat)).toBe('https://pranaveda.app/poses/bridge.jpg');

    const none = pose({ nameEnglish: "Child's Pose" });
    expect(posePictureUrl(none)).toBe(getFallbackPoseImage(none));
    expect(posePictureUrl(none)).toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  it('works out the scene for rituals saved before the server named it', () => {
    expect(posePictureUrl(pose({ nameEnglish: 'Triangle', poseId: 'triangle' }))).toBe('/poses_with_background/web/triangle_wide.webp');
  });
});

describe('the chat practice card', () => {
  it('shows every pose as a picture with its name and minutes, in order', () => {
    const list = showCard(ritual([
      pose({ nameEnglish: 'Bound Angle (Butterfly) Pose', poseId: 'bound_angle', sceneImageUrl: 'https://pranaveda.app/poses_with_background/web/bound_angle.webp' }),
      pose({ nameEnglish: 'Corpse Pose', duration: '5 minutes', poseImageUrl: 'https://pranaveda.app/poses/corpse.jpg' }),
    ]));

    const tiles = within(list).getAllByRole('listitem');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].querySelector('img')!.getAttribute('src')).toBe('https://pranaveda.app/poses_with_background/web/bound_angle.webp');
    expect(within(tiles[0]).getByText('Bound Angle (Butterfly) Pose')).toBeTruthy();
    expect(within(tiles[0]).getByText('3 min')).toBeTruthy();
    expect(tiles[1].querySelector('img')!.getAttribute('src')).toBe('https://pranaveda.app/poses/corpse.jpg');
    expect(within(tiles[1]).getByText('5 min')).toBeTruthy();
    // The breath practice is still named on the card.
    expect(screen.getByText('Humming Bee Breath')).toBeTruthy();
  });

  it('falls back to the flat photo when the room scene cannot load', () => {
    const p = pose({ nameEnglish: 'Seated Forward Bend', poseId: 'seated_forward_bend', poseImageUrl: 'https://pranaveda.app/poses/seated_forward_bend.jpg' });
    const img = showCard(ritual([p])).querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/poses_with_background/web/seated_forward_bend.webp');

    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(poseFlatUrl(p));
    // Only once: a broken flat photo doesn't loop.
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(poseFlatUrl(p));
  });
});
