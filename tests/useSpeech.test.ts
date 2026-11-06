// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeech } from '../src/hooks/useSpeech';

// Pausing a guided practice pauses Amrita's voice too, and Play carries on.

class FakeAudio {
  static made: FakeAudio[] = [];
  played = 0;
  paused = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    FakeAudio.made.push(this);
  }
  play() {
    this.played++;
    return Promise.resolve();
  }
  pause() {
    this.paused++;
  }
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('useSpeech pause and resume', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    FakeAudio.made = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(new Blob(['mp3']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', FakeAudio);
    URL.createObjectURL = vi.fn(() => 'blob:clip');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('pauses the clip being played, and carries on with it', async () => {
    const { result } = renderHook(() => useSpeech());
    await act(async () => { await result.current.speak('Entering posture: Mountain.'); });
    const clip = FakeAudio.made[0];
    expect(clip.played).toBe(1);
    act(() => result.current.pause());
    expect(clip.paused).toBe(1);
    act(() => result.current.resume());
    expect(clip.played).toBe(2);
    expect(FakeAudio.made).toHaveLength(1);
  });

  it('holds a clip that arrives while paused until Play', async () => {
    const { result } = renderHook(() => useSpeech());
    let speaking!: Promise<void>;
    act(() => { speaking = result.current.speak('Breathe in'); });
    act(() => result.current.pause());
    await act(async () => { await speaking; });
    expect(FakeAudio.made[0].played).toBe(0);
    act(() => result.current.resume());
    expect(FakeAudio.made[0].played).toBe(1);
  });

  it('keeps a new line (Back or Next while paused) for Play', async () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.pause());
    await act(async () => { await result.current.speak('Returning to posture: Cobra.'); });
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => result.current.resume());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: 'Returning to posture: Cobra.' });
    expect(FakeAudio.made[0].played).toBe(1);
  });

  it('says nothing on Play after the practice was closed', async () => {
    const { result } = renderHook(() => useSpeech());
    await act(async () => { await result.current.speak('Hold'); });
    act(() => result.current.pause());
    act(() => result.current.stop());
    act(() => result.current.resume());
    await settle();
    expect(FakeAudio.made[0].played).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
