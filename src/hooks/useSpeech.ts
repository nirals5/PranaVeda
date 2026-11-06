import { useRef, useCallback } from 'react';

export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Paused with a guided practice: what is being said waits, and so does a new
  // line (Back or Next while paused), until resume().
  const pausedRef = useRef(false);
  const queuedRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    queuedRef.current = null;
    // Cancel any in-flight ElevenLabs fetch before it can create a new Audio element
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback(async (text: string) => {
    // stop() aborts the previous controller so any pending fetch is cancelled immediately
    stop();
    if (pausedRef.current) {
      queuedRef.current = text;
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      // Guard after every await: a newer speak() may have already called stop()
      if (controller.signal.aborted) return;

      if (res.ok) {
        const blob = await res.blob();
        if (controller.signal.aborted) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; };
        audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; };
        // Paused while it was on its way: resume() plays it.
        if (!pausedRef.current) audio.play();
        return;
      }
    } catch (err: any) {
      // AbortError means stop() was called deliberately — don't fall back to browser TTS
      if (err?.name === 'AbortError') return;
    }

    // Browser speech synthesis fallback — only if this call is still the active one
    if (abortRef.current !== controller) return;
    if (!('speechSynthesis' in window)) return;
    if (pausedRef.current) {
      queuedRef.current = text;
      return;
    }

    // ElevenLabs pause markup would be read literally by browser TTS — strip it
    const utterance = new SpeechSynthesisUtterance(text.replace(/<break[^>]*\/>/g, '. . .'));
    utterance.rate = 0.8;
    utterance.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter(v => v.lang.startsWith('en'));
    const pool = english.length ? english : voices;
    const best = pool.find(v =>
      ['Natural', 'Google', 'Premium', 'Siri', 'Samantha', 'Daniel'].some(n => v.name.includes(n))
    ) ?? pool[0];
    if (best) utterance.voice = best;
    window.speechSynthesis.speak(utterance);
  }, [stop]);

  // With a guided practice's pause: Amrita stops mid-word, to carry on from there.
  const pause = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    audioRef.current?.pause();
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    const queued = queuedRef.current;
    queuedRef.current = null;
    if (queued !== null) {
      void speak(queued);
    } else if (audioRef.current) {
      audioRef.current.play()?.catch?.(() => {});
    } else if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, [speak]);

  return { speak, stop, pause, resume };
}
