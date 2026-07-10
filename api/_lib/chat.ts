// Conversational Amrita: streaming chat with tool use.
//
// The client sends the conversation history plus the on-device wellness
// profile; the server streams back SSE events:
//   {type:'text', delta}        — Amrita's words, as they generate
//   {type:'card', card}         — a structured ritual/breathwork card
//   {type:'profile', profile}   — updated wellness profile (client persists it)
//   {type:'done'} / {type:'error', message}
//
// Claude decides WHEN to reach for structure (create_ritual /
// suggest_breathwork) and composes only from the curated catalog by id. The
// server joins catalog data and hard-rejects any pick whose contraindications
// match the user's known conditions, so safety does not depend on the model
// reading prose.

import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { POSES, BREATHWORK, poseById, breathworkById } from './catalog';
import { buildSystemPrompt, WellnessProfile } from './prompt';

const MODEL = 'claude-sonnet-5';
const MAX_LOOPS = 5;

const tools: Anthropic.Tool[] = [
  {
    name: 'create_ritual',
    description:
      'Present a full guided practice as a structured card. Use only when a complete practice genuinely serves the user better than conversation. Compose poses from the catalog by id; the app renders images, cues, and timers from the catalog.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Calm title for the practice' },
        description: { type: 'string', description: 'One line on the goal of this sequence' },
        summary: { type: 'string', description: 'Personal, compassionate overview tying the practice to what they shared' },
        doshaTendency: { type: 'string', description: 'Why this state maps to a dosha tendency, in one or two sentences' },
        primaryEnergy: { type: 'string', description: "Evocative two-word title for their current state, e.g. 'Scattered Wind'" },
        poses: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              poseId: { type: 'string', description: 'Catalog pose id' },
              durationMinutes: { type: 'number', description: 'Minutes for this pose' },
              note: { type: 'string', description: 'Optional personal note for this pose in their sequence' },
            },
            required: ['poseId', 'durationMinutes'],
            additionalProperties: false,
          },
        },
        breathworkId: { type: 'string', description: 'Catalog breathwork id to close or open the practice' },
        breathworkCycles: { type: 'integer', description: 'Override cycle count if needed' },
        ayurvedic: {
          type: 'object',
          properties: {
            assessment: { type: 'string' },
            doshaPrimary: { type: 'string', description: 'Vata, Pitta, Kapha, or Dual' },
            dietaryTips: { type: 'array', items: { type: 'string' } },
            lifestyleTips: { type: 'array', items: { type: 'string' } },
            recommendedHerbs: { type: 'array', items: { type: 'string' } },
          },
          required: ['assessment', 'doshaPrimary', 'dietaryTips', 'lifestyleTips', 'recommendedHerbs'],
          additionalProperties: false,
        },
        lifestyleTips: { type: 'array', items: { type: 'string' }, description: 'One or two general daily tips' },
      },
      required: ['title', 'description', 'summary', 'doshaTendency', 'primaryEnergy', 'poses', 'breathworkId', 'ayurvedic', 'lifestyleTips'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_breathwork',
    description:
      'Present a single breathing exercise as a card with a live timer — the minimum effective intervention when a full practice would be too much.',
    input_schema: {
      type: 'object',
      properties: {
        breathworkId: { type: 'string', description: 'Catalog breathwork id' },
        cycles: { type: 'integer', description: 'Override cycle count if needed' },
        note: { type: 'string', description: 'One personal line about why this breath, for this moment' },
      },
      required: ['breathworkId'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_wellness_profile',
    description:
      'Silently record durable learnings about the user. Use whenever you learn goals, injuries/conditions, preferences, constitution insights, or meaningful observations. Never announce it.',
    input_schema: {
      type: 'object',
      properties: {
        set: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            prakriti: { type: 'string', description: 'Dominant (and secondary) constitution, e.g. "Vata-Pitta"' },
            vikriti: { type: 'string', description: 'Current imbalance, if assessed' },
            prakritiConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          additionalProperties: false,
        },
        addGoals: { type: 'array', items: { type: 'string' } },
        removeGoals: { type: 'array', items: { type: 'string' } },
        addConditions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Injuries/conditions. Use catalog tags when applicable: knee_injury, wrist_injury, shoulder_injury, neck_injury, lower_back_injury, hamstring_injury, pregnancy, hypertension, low_blood_pressure, glaucoma, heart_condition, recent_surgery, vertigo, asthma. Free text allowed for others.',
        },
        removeConditions: { type: 'array', items: { type: 'string' } },
        addPreferences: { type: 'array', items: { type: 'string' }, description: 'e.g. "prefers evening practice", "dislikes fast flows"' },
        removePreferences: { type: 'array', items: { type: 'string' } },
        addObservation: { type: 'string', description: 'One meaningful longitudinal observation, e.g. "slept poorly three nights running"' },
      },
      additionalProperties: false,
    },
  },
];

type SseEvent =
  | { type: 'text'; delta: string }
  | { type: 'card'; card: unknown }
  | { type: 'profile'; profile: WellnessProfile }
  | { type: 'done' }
  | { type: 'error'; message: string };

function send(res: Response, event: SseEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function conditionConflicts(contraindications: string[], conditions: string[] | undefined): string[] {
  if (!conditions?.length) return [];
  const normalized = conditions.map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  return contraindications.filter((tag) => normalized.some((c) => c.includes(tag) || tag.includes(c)));
}

function applyProfileUpdate(profile: WellnessProfile, input: any): WellnessProfile {
  const next: WellnessProfile = { ...profile };
  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];
  // The model occasionally sends a bare string where the schema wants an
  // array — coerce instead of spreading a string into characters.
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' && v.trim() ? [v] : [];
  if (input.set) {
    for (const k of ['name', 'prakriti', 'vikriti', 'prakritiConfidence'] as const) {
      if (input.set[k] !== undefined) (next as any)[k] = input.set[k];
    }
  }
  const merge = (key: 'goals' | 'conditions' | 'preferences', addRaw?: unknown, removeRaw?: unknown) => {
    const add = asList(addRaw);
    const remove = asList(removeRaw);
    let list = next[key] ?? [];
    if (add.length) list = uniq([...list, ...add]);
    if (remove.length) list = list.filter((x) => !remove.some((r) => x.toLowerCase() === r.toLowerCase()));
    next[key] = list;
  };
  merge('goals', input.addGoals, input.removeGoals);
  merge('conditions', input.addConditions, input.removeConditions);
  merge('preferences', input.addPreferences, input.removePreferences);
  if (input.addObservation) {
    next.observations = [...(next.observations ?? []), { date: todayStamp(), note: input.addObservation }].slice(-30);
  }
  return next;
}

function buildRitual(input: any, profile: WellnessProfile): { error?: string; card?: any } {
  const conflicts: string[] = [];
  const poses: any[] = [];
  for (const p of input.poses ?? []) {
    const pose = poseById.get(p.poseId);
    if (!pose) return { error: `Unknown poseId "${p.poseId}". Choose ids from the catalog.` };
    const bad = conditionConflicts(pose.contraindications, profile.conditions);
    if (bad.length) conflicts.push(`${pose.id} (contraindicated for ${bad.join(', ')})`);
    const mins = Math.max(1, Math.round(p.durationMinutes));
    poses.push({
      nameEnglish: pose.nameEnglish,
      nameSanskrit: pose.nameSanskrit,
      duration: `${mins} minute${mins === 1 ? '' : 's'}`,
      benefits: pose.benefits,
      instructions: pose.cues.join('. ') + '.' + (p.note ? ` ${p.note}` : ''),
      poseImageUrl: pose.poseImageUrl,
      videoUrl: pose.videoUrl,
    });
  }
  const breath = breathworkById.get(input.breathworkId);
  if (!breath) return { error: `Unknown breathworkId "${input.breathworkId}". Choose ids from the catalog.` };
  const badBreath = conditionConflicts(breath.contraindications, profile.conditions);
  if (badBreath.length) conflicts.push(`${breath.id} (contraindicated for ${badBreath.join(', ')})`);
  if (conflicts.length) {
    return { error: `Rejected for safety — the user's conditions conflict with: ${conflicts.join('; ')}. Pick alternatives from the catalog.` };
  }
  const durationMinutes = (input.poses ?? []).reduce((s: number, p: any) => s + Math.max(1, Math.round(p.durationMinutes)), 0);
  return {
    card: {
      kind: 'ritual',
      result: {
        summary: input.summary,
        doshaTendency: input.doshaTendency,
        primaryEnergy: input.primaryEnergy,
        yogaPractice: { title: input.title, description: input.description, poses, durationMinutes },
        ayurvedicAdvice: input.ayurvedic,
        breathwork: {
          name: breath.name,
          sanskritName: breath.sanskritName,
          description: breath.description,
          inhale: breath.inhale,
          holdActive: breath.holdActive,
          exhale: breath.exhale,
          holdEmpty: breath.holdEmpty,
          cycles: input.breathworkCycles ?? breath.cycles,
          benefits: breath.benefits,
        },
        lifestyleTips: input.lifestyleTips ?? [],
      },
    },
  };
}

function buildBreathworkCard(input: any, profile: WellnessProfile): { error?: string; card?: any } {
  const breath = breathworkById.get(input.breathworkId);
  if (!breath) return { error: `Unknown breathworkId "${input.breathworkId}". Choose ids from the catalog.` };
  const bad = conditionConflicts(breath.contraindications, profile.conditions);
  if (bad.length) {
    return { error: `Rejected for safety — ${breath.id} is contraindicated for ${bad.join(', ')}. Pick an alternative.` };
  }
  return {
    card: {
      kind: 'breathwork',
      note: input.note,
      pattern: {
        name: breath.name,
        sanskritName: breath.sanskritName,
        description: breath.description,
        inhale: breath.inhale,
        holdActive: breath.holdActive,
        exhale: breath.exhale,
        holdEmpty: breath.holdEmpty,
        cycles: input.cycles ?? breath.cycles,
        benefits: breath.benefits,
      },
    },
  };
}

export function registerChatRoute(app: import('express').Express, client: Anthropic, apiKey: string | undefined) {
  app.post('/api/chat', async (req: Request, res: Response) => {
    const { messages, profile: rawProfile, localTime, inputMode } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!apiKey) {
      // Honest fallback: no fake personalization when Amrita can't actually think.
      send(res, {
        type: 'text',
        delta:
          "I'm resting right now — my connection to deeper guidance isn't available (the server is missing its API key). While I recharge, a simple Equal Breathing rhythm — in for 4, hold 4, out 4, rest 4 — is always a safe place to return to.",
      });
      send(res, { type: 'done' });
      return res.end();
    }

    let profile: WellnessProfile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
    let profileChanged = false;

    const history: Anthropic.MessageParam[] = messages
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-30)
      .map((m: any) => ({ role: m.role, content: m.content }));

    const system = buildSystemPrompt(
      profile,
      localTime || new Date().toLocaleString(),
      inputMode === 'voice' ? 'voice' : 'text'
    );

    try {
      for (let loop = 0; loop < MAX_LOOPS; loop++) {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 3000,
          system,
          messages: history,
          tools,
        });

        stream.on('text', (delta) => send(res, { type: 'text', delta }));

        const message = await stream.finalMessage();

        if (message.stop_reason !== 'tool_use') break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of message.content) {
          if (block.type !== 'tool_use') continue;
          let resultText = 'ok';
          let isError = false;

          if (block.name === 'update_wellness_profile') {
            profile = applyProfileUpdate(profile, block.input);
            profileChanged = true;
            resultText = 'Profile updated.';
          } else if (block.name === 'create_ritual') {
            const { error, card } = buildRitual(block.input, profile);
            if (error) {
              resultText = error;
              isError = true;
            } else {
              send(res, { type: 'card', card });
              profile = {
                ...profile,
                practiceHistory: [
                  ...(profile.practiceHistory ?? []),
                  { date: todayStamp(), title: (block.input as any).title, kind: 'ritual' as const },
                ].slice(-30),
              };
              profileChanged = true;
              resultText = 'Ritual card shown to the user. Continue with one or two warm sentences; do not restate its contents.';
            }
          } else if (block.name === 'suggest_breathwork') {
            const { error, card } = buildBreathworkCard(block.input, profile);
            if (error) {
              resultText = error;
              isError = true;
            } else {
              send(res, { type: 'card', card });
              profile = {
                ...profile,
                practiceHistory: [
                  ...(profile.practiceHistory ?? []),
                  { date: todayStamp(), title: (card as any).pattern.name, kind: 'breathwork' as const },
                ].slice(-30),
              };
              profileChanged = true;
              resultText = 'Breathwork card shown to the user. Continue with one warm sentence; do not restate its contents.';
            }
          } else {
            resultText = `Unknown tool ${block.name}`;
            isError = true;
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText, is_error: isError });
        }

        history.push({ role: 'assistant', content: message.content });
        history.push({ role: 'user', content: toolResults });
      }

      if (profileChanged) send(res, { type: 'profile', profile });
      send(res, { type: 'done' });
    } catch (err: any) {
      console.error('[chat] stream failed:', err?.message || err);
      send(res, {
        type: 'error',
        message: 'The connection to Amrita faltered mid-thought. Please send that again in a moment.',
      });
    }
    res.end();
  });
}
