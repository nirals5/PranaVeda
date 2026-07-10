import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatCard, ChatItem, WellnessProfile } from '../types';

const CHAT_KEY = 'pranaveda_chat';
const PROFILE_KEY = 'pranaveda_profile';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// The wellness profile lives on-device only: the server receives it per
// request, updates it via Amrita's tools, and returns it — nothing is stored
// remotely.
export function useAmritaChat() {
  const [items, setItems] = useState<ChatItem[]>(() => loadJson<ChatItem[]>(CHAT_KEY, []));
  const [profile, setProfile] = useState<WellnessProfile>(() => loadJson<WellnessProfile>(PROFILE_KEY, {}));
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(items.slice(-60)));
    } catch {}
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userItem: ChatItem = { id: `u_${Date.now()}`, role: 'user', text: trimmed, cards: [] };
      const assistantId = `a_${Date.now()}`;
      const assistantItem: ChatItem = { id: assistantId, role: 'assistant', text: '', cards: [], streaming: true };

      // History for the model: text turns; card-only turns become a marker so
      // Amrita retains continuity about what she presented.
      const history = [...items, userItem]
        .map((m) => ({
          role: m.role,
          content:
            m.text ||
            (m.cards.length
              ? `[Presented: ${m.cards
                  .map((c) => (c.kind === 'ritual' ? c.result.yogaPractice.title : c.pattern.name))
                  .join(', ')}]`
              : ''),
        }))
        .filter((m) => m.content);

      setItems((prev) => [...prev, userItem, assistantItem]);
      setIsStreaming(true);

      const patchAssistant = (patch: (item: ChatItem) => ChatItem) =>
        setItems((prev) => prev.map((m) => (m.id === assistantId ? patch(m) : m)));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, profile, localTime: new Date().toLocaleString() }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            let event: any;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (event.type === 'text') {
              patchAssistant((m) => ({ ...m, text: m.text + event.delta }));
            } else if (event.type === 'card') {
              patchAssistant((m) => ({ ...m, cards: [...m.cards, event.card as ChatCard] }));
            } else if (event.type === 'profile') {
              setProfile(event.profile ?? {});
            } else if (event.type === 'error') {
              patchAssistant((m) => ({
                ...m,
                error: true,
                text: m.text || event.message,
              }));
            }
          }
        }
      } catch (err) {
        console.error('Amrita chat failed:', err);
        patchAssistant((m) => ({
          ...m,
          error: true,
          text:
            m.text ||
            'I lost the thread of our connection for a moment. Please try sending that again — I am still here.',
        }));
      } finally {
        patchAssistant((m) => ({ ...m, streaming: false }));
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [items, profile, isStreaming]
  );

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setIsStreaming(false);
  }, []);

  return { items, profile, isStreaming, sendMessage, resetConversation };
}
