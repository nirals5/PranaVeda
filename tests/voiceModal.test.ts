// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceModal, { VOICE_PROBLEM_TEXT, voiceProblemFor } from '../src/components/VoiceModal';

// The website's voice window. When the browser can't listen, it says so plainly
// and sends nothing: it must never make up words on the person's behalf.

/** A stand-in for the browser's speech recognition, driven by the test. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn();
  constructor() { FakeRecognition.last = this; }
  hear(...parts: string[]) {
    this.onresult?.({ resultIndex: parts.length - 1, results: parts.map((t) => [{ transcript: t }]) });
  }
}

const open = () => {
  const onSubmitPrompt = vi.fn();
  const onClose = vi.fn();
  render(createElement(VoiceModal, { isOpen: true, onClose, onSubmitPrompt }));
  return { onSubmitPrompt, onClose };
};
const submit = () => screen.getByRole('button', { name: /submit voice query/i });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // jsdom has no matchMedia, which the motion library asks for.
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  FakeRecognition.last = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});

describe('voiceProblemFor', () => {
  it('maps the browser error codes to what we tell the person', () => {
    expect(voiceProblemFor('not-allowed')).toBe('blocked');
    expect(voiceProblemFor('service-not-allowed')).toBe('blocked');
    expect(voiceProblemFor('audio-capture')).toBe('no-microphone');
    expect(voiceProblemFor('network')).toBe('failed');
    expect(voiceProblemFor('no-speech')).toBeNull();
    expect(voiceProblemFor('aborted')).toBeNull();
  });
});

describe('VoiceModal', () => {
  it('says voice is unavailable in a browser without speech recognition, and types nothing', () => {
    const { onSubmitPrompt } = open();
    act(() => { vi.advanceTimersByTime(20_000); });

    expect(screen.getByText(VOICE_PROBLEM_TEXT.unsupported)).toBeTruthy();
    expect(screen.getByText('Nothing heard.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/stressed|lower back|simulated/i);
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit());
    expect(onSubmitPrompt).not.toHaveBeenCalled();
  });

  it('says the microphone is blocked when permission is refused, and sends nothing', () => {
    (window as any).webkitSpeechRecognition = FakeRecognition;
    const { onSubmitPrompt } = open();
    act(() => { FakeRecognition.last!.onerror?.({ error: 'not-allowed' }); });
    act(() => { vi.advanceTimersByTime(20_000); });

    expect(screen.getByText(VOICE_PROBLEM_TEXT.blocked)).toBeTruthy();
    expect(screen.getByText('VOICE UNAVAILABLE')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/stressed|lower back|simulated/i);
    fireEvent.click(submit());
    expect(onSubmitPrompt).not.toHaveBeenCalled();
  });

  it('keeps listening through silence', () => {
    (window as any).SpeechRecognition = FakeRecognition;
    open();
    act(() => { FakeRecognition.last!.onerror?.({ error: 'no-speech' }); });
    expect(screen.getByText('LISTENING')).toBeTruthy();
  });

  it('does not send a made-up question when nothing was said', () => {
    (window as any).SpeechRecognition = FakeRecognition;
    const { onSubmitPrompt } = open();
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit());
    expect(onSubmitPrompt).not.toHaveBeenCalled();
  });

  it('sends exactly what was heard, every sentence of it', () => {
    (window as any).SpeechRecognition = FakeRecognition;
    const { onSubmitPrompt, onClose } = open();
    act(() => { FakeRecognition.last!.hear('My shoulders are tight.', ' I slept badly.'); });

    expect(screen.getByText('My shoulders are tight. I slept badly.')).toBeTruthy();
    fireEvent.click(submit());
    expect(onSubmitPrompt).toHaveBeenCalledWith('My shoulders are tight. I slept badly.');
    expect(onClose).toHaveBeenCalled();
    expect(FakeRecognition.last!.stop).toHaveBeenCalled();
  });
});
