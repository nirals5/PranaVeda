import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { registerChatRoute, textBlockSeparator } from '../api/index.js';

type Scripted = { texts: string[]; snapshots?: boolean; message: any };

// A stand-in for the Anthropic client: each call to messages.stream plays the
// next scripted turn, emitting its text deltas. With `snapshots`, the deltas
// come with the block's text so far, as the real SDK sends them.
function fakeClaude(turns: Scripted[]) {
  return {
    messages: {
      stream: () => {
        const turn = turns.shift()!;
        return {
          on: (event: string, cb: (delta: string, snapshot?: string) => void) => {
            if (event !== 'text') return;
            let snapshot = '';
            for (const delta of turn.texts) {
              snapshot += delta;
              turn.snapshots ? cb(delta, snapshot) : cb(delta);
            }
          },
          finalMessage: async () => turn.message,
        };
      },
    },
  } as any;
}

const optionsTool = {
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 't1', name: 'show_answer_options', input: { options: [{ label: 'Calm' }] } }],
};
const done = { stop_reason: 'end_turn', content: [] };

async function replyText(turns: Scripted[]) {
  const app = express();
  app.use(express.json());
  registerChatRoute(app, fakeClaude(turns), 'test-key');
  const res = await request(app)
    .post('/api/chat')
    .send({ messages: [{ role: 'user', content: 'I feel restless' }], profile: {}, localTime: 'now', localDate: '2026-10-15' });
  return res.text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)))
    .filter((event) => event.type === 'text')
    .map((event) => event.delta)
    .join('');
}

describe('text blocks in one reply', () => {
  it('starts a new paragraph only when nothing already separates two blocks', () => {
    expect(textBlockSeparator('more easily.', 'Let the breath')).toBe('\n\n');
    expect(textBlockSeparator('more easily. ', 'Let the breath')).toBe('');
    expect(textBlockSeparator('more easily.\n', 'Let the breath')).toBe('');
    expect(textBlockSeparator('more easily.', '\n\nLet the breath')).toBe('');
    expect(textBlockSeparator('', 'Let the breath')).toBe('');
    expect(textBlockSeparator('more easily.', '')).toBe('');
  });

  it('keeps a reply that resumes after a tool call from running together', async () => {
    const text = await replyText([
      { texts: ['Let us bring the energy ', 'downward so sleep comes more easily.'], message: optionsTool },
      { texts: ['Let the humming breath ', 'be the turning point.'], message: done },
    ]);
    expect(text).toBe('Let us bring the energy downward so sleep comes more easily.\n\nLet the humming breath be the turning point.');
  });

  it('splits at block starts only, as the real SDK reports them, never mid-block', async () => {
    const text = await replyText([
      { texts: ['Is it a racing mind', ' or a restless body?'], snapshots: true, message: optionsTool },
      { texts: ["I'll wait", ' to hear which.'], snapshots: true, message: done },
    ]);
    expect(text).toBe("Is it a racing mind or a restless body?\n\nI'll wait to hear which.");
  });

  it('leaves a single-block reply untouched', async () => {
    const text = await replyText([{ texts: ['Breathe in.', 'Breathe out.'], message: done }]);
    expect(text).toBe('Breathe in.Breathe out.');
  });
});
