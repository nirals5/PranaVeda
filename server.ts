import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = new Anthropic({ apiKey });

// Daily insights fallback in case API key is missing or model fails
const fallbacks = {
  insight: {
    headline: "Prana bridges body and mind.",
    quote: "Let your breath be the anchor of this moment.",
    focus: "Sama Vritti",
    tip: "Eat warm, cooked foods today to balance Vata energy."
  },
  recommendation: {
    summary: "Your energy feels slightly uneven, reflecting a classic Vata (wind) displacement. A grounding somatic ritual combines slow, intentional breath with stable postures to calm the nervous system and warm the core.",
    doshaTendency: "Vata (Wind & Air) is slightly elevated, leading to physical restlessness or mild cognitive overload.",
    primaryEnergy: "Scattered Wind",
    yogaPractice: {
      title: "Grounding and Calming Vata Ritual",
      description: "A slow, stabilizing Hatha sequence emphasizing floor poses, longer holdings, and smooth tactile awareness to settle restless energy.",
      poses: [
        {
          nameEnglish: "Child's Pose",
          nameSanskrit: "Balasana",
          duration: "2 minutes",
          benefits: "Instantly calms the brain, reduces stress, and releases tension in the lower back and shoulders.",
          instructions: "Kneel on the floor, touch your big toes together, sit on your heels, then separate your knees about hip-width. Fold forward, placing your forehead on the mat and extending your arms forward with palms facing down.",
          poseImageUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
          videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"
        },
        {
          nameEnglish: "Cat-Cow Pose",
          nameSanskrit: "Marjariasana-Bitilasana",
          duration: "3 minutes (slow flow)",
          benefits: "Articulates the entire spine, coordinates breath with movement, and activates core heat.",
          instructions: "Start on all fours. As you inhale, arch your back, drop your belly, and look up (Cow). As you exhale, round your spine toward the ceiling, tucking your chin to your chest (Cat).",
          poseImageUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop",
          videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4"
        },
        {
          nameEnglish: "Seated Forward Bend",
          nameSanskrit: "Paschimottanasana",
          duration: "2 minutes",
          benefits: "Grounds the pelvis, stretches the spine and hamstrings, and induces deep contemplation.",
          instructions: "Sit with legs extended. Inhale to lift your torso, then fold forward from the hips on an exhale. Reach for your shins or feet, keeping your spine elongated rather than completely rounded.",
          poseImageUrl: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop"
        },
        {
          nameEnglish: "Corpse Pose",
          nameSanskrit: "Savasana",
          duration: "3 minutes",
          benefits: "Complete surrender, integrates the practice benefits, and resets nervous system pathways.",
          instructions: "Lie flat on your back, legs separated slightly, feet relaxed outward. Place arms by your sides, palms up. Close your eyes and let your breath revert to its natural, unguided rhythm.",
          poseImageUrl: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop"
        }
      ],
      durationMinutes: 10
    },
    ayurvedicAdvice: {
      assessment: "Vata is balanced by warmth, heavy qualities, moisture, and consistent structure.",
      doshaPrimary: "Vata",
      dietaryTips: [
        "Prefer warm, cooked foods over raw salads and dry snacks.",
        "Include healthy warming spices like ginger, cardamom, and cinnamon.",
        "Stay hydrated with warm water or herbal teas throughout the day."
      ],
      lifestyleTips: [
        "Maintain a highly regular schedule for meals and rest.",
        "Perform a gentle self-massage (Abhyanga) using warm sesame oil before bathing.",
        "Minimize exposure to loud noises and quick multi-tasking."
      ],
      recommendedHerbs: [
        "Ashwagandha for stress relief and physical resilience.",
        "Ginger tea to kindle digestional fire (Agni)."
      ]
    },
    breathwork: {
      name: "Alternate Nostril Breathing",
      sanskritName: "Nadi Shodhana",
      description: "A restorative technique that balances left and right brain hemispheres and dissolves anxiety.",
      inhale: 4,
      holdActive: 4,
      exhale: 4,
      holdEmpty: 0,
      cycles: 10,
      benefits: "Balances dual energies, supports cardiac rhythm coherence, and settles mental chatter."
    },
    lifestyleTips: [
      "Limit screen time before sleep to restore neurological rhythm.",
      "Spend five minutes walking barefoot on the grass if possible, earthing your focus."
    ]
  }
};

// JSON Schema for coaching response (Claude structured outputs format)
const coachResponseSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "A highly personal, wise, compassionate wellness overview based on what the user shared. Acknowledge their state and explain the somatic path forward."
    },
    doshaTendency: {
      type: "string",
      description: "Ayurvedic analysis of why this state is manifesting in terms of Vata, Pitta, or Kapha tendencies."
    },
    primaryEnergy: {
      type: "string",
      description: "A beautiful, evocative two-word title for their current state, e.g. 'Scattered Wind', 'Flickering Hearth', 'Heavy Water', 'Fires of Autumn'."
    },
    yogaPractice: {
      type: "object",
      properties: {
        title: { type: "string", description: "Calm title for the 10-minute yoga practice" },
        description: { type: "string", description: "A few words outlining the goal of this sequence" },
        poses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nameEnglish: { type: "string" },
              nameSanskrit: { type: "string" },
              duration: { type: "string", description: "e.g., '2 minutes' or '5 deep breaths'" },
              benefits: { type: "string" },
              instructions: { type: "string" }
            },
            required: ["nameEnglish", "nameSanskrit", "duration", "benefits", "instructions"],
            additionalProperties: false
          }
        },
        durationMinutes: { type: "integer", description: "Total duration, must sum to exactly 10 minutes" }
      },
      required: ["title", "description", "poses", "durationMinutes"],
      additionalProperties: false
    },
    ayurvedicAdvice: {
      type: "object",
      properties: {
        assessment: { type: "string", description: "Direct assessment of their energy from an Ayurvedic standpoint" },
        doshaPrimary: { type: "string", description: "The most active dosha in this state: Vata, Pitta, Kapha, or Dual" },
        dietaryTips: { type: "array", items: { type: "string" }, description: "3 warm, highly actionable food recommendations" },
        lifestyleTips: { type: "array", items: { type: "string" }, description: "3 grounding self-care practices" },
        recommendedHerbs: { type: "array", items: { type: "string" }, description: "1-2 gentle Ayurvedic herbs or infusions suited for this state" }
      },
      required: ["assessment", "doshaPrimary", "dietaryTips", "lifestyleTips", "recommendedHerbs"],
      additionalProperties: false
    },
    breathwork: {
      type: "object",
      properties: {
        name: { type: "string", description: "English name of recommended breathing technique" },
        sanskritName: { type: "string", description: "Sanskrit name of standard breathing technique (e.g. Nadi Shodhana, Sheetali, Bhastrika)" },
        description: { type: "string" },
        inhale: { type: "integer", description: "Exact inhale block duration in seconds (usually 4)" },
        holdActive: { type: "integer", description: "Exact hold duration after inhaling in seconds (or 0 for simple breath)" },
        exhale: { type: "integer", description: "Exact exhale duration in seconds (usually 4 to 6)" },
        holdEmpty: { type: "integer", description: "Exact hold duration on empty lungs in seconds (usually 0 to 4)" },
        cycles: { type: "integer", description: "Recommended cycle repetitions" },
        benefits: { type: "string" }
      },
      required: ["name", "sanskritName", "description", "inhale", "holdActive", "exhale", "holdEmpty", "cycles", "benefits"],
      additionalProperties: false
    },
    lifestyleTips: { type: "array", items: { type: "string" }, description: "General daily tips" }
  },
  required: ["summary", "doshaTendency", "primaryEnergy", "yogaPractice", "ayurvedicAdvice", "breathwork", "lifestyleTips"],
  additionalProperties: false
};

// JSON Schema for insight response
const insightResponseSchema = {
  type: "object",
  properties: {
    headline: { type: "string", description: "Short poetic title, max 6 words" },
    quote: { type: "string", description: "One evocative sentence, max 20 words" },
    focus: { type: "string", description: "2-3 word practice name only, e.g. 'Sama Vritti' or 'Morning Grounding'" },
    tip: { type: "string", description: "One brief Ayurvedic lifestyle tip for today, max 15 words. Not a breathing exercise." }
  },
  required: ["headline", "quote", "focus", "tip"],
  additionalProperties: false
};

function enrichRecommendation(data: any): any {
  if (!data || !data.yogaPractice || !Array.isArray(data.yogaPractice.poses)) {
    return data;
  }

  data.yogaPractice.poses = data.yogaPractice.poses.map((pose: any) => {
    const englishLower = (pose.nameEnglish || "").toLowerCase();
    const sanskritLower = (pose.nameSanskrit || "").toLowerCase();

    let poseImageUrl = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop";
    let videoUrl = "";

    if (englishLower.includes("child") || sanskritLower.includes("balasana")) {
      poseImageUrl = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop";
      videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4";
    } else if (englishLower.includes("cat") || englishLower.includes("cow") || sanskritLower.includes("marjari") || sanskritLower.includes("bitila")) {
      poseImageUrl = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop";
      videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4";
    } else if (englishLower.includes("forward bend") || englishLower.includes("forward fold") || sanskritLower.includes("paschimottan") || sanskritLower.includes("uttanasana")) {
      poseImageUrl = "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop";
    } else if (englishLower.includes("corpse") || englishLower.includes("savasana") || englishLower.includes("shavasana")) {
      poseImageUrl = "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop";
    } else if (englishLower.includes("sphinx") || englishLower.includes("cobra") || sanskritLower.includes("bhujanga")) {
      poseImageUrl = "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop";
    } else if (englishLower.includes("downward") || sanskritLower.includes("adho mukha")) {
      poseImageUrl = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop";
      videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-woman-doing-yoga-on-a-wooden-dock-42289-large.mp4";
    } else if (englishLower.includes("mountain") || sanskritLower.includes("tadasana")) {
      poseImageUrl = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop";
    } else if (englishLower.includes("bridge") || sanskritLower.includes("setu bandha")) {
      poseImageUrl = "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop";
    } else {
      const placeholders = [
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=800&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?q=80&w=800&auto=format&fit=crop"
      ];
      let hash = 0;
      for (let i = 0; i < englishLower.length; i++) {
        hash += englishLower.charCodeAt(i);
      }
      poseImageUrl = placeholders[hash % placeholders.length];
    }

    return {
      ...pose,
      poseImageUrl: pose.poseImageUrl || poseImageUrl,
      videoUrl: pose.videoUrl || videoUrl || undefined
    };
  });

  return data;
}

async function callClaude(params: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  fallbackData: any;
  enricher?: (data: any) => any;
}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[Claude] claude-opus-4-8 - attempt ${attempt}/2`);
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: params.system,
        messages: [{ role: "user", content: params.prompt }],
        output_config: {
          format: {
            type: "json_schema",
            schema: params.schema,
          }
        }
      } as any);

      const textBlock = response.content.find((b: any) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in Claude response");
      }

      const parsed = JSON.parse(textBlock.text.trim());
      return params.enricher ? params.enricher(parsed) : parsed;
    } catch (err: any) {
      console.warn(`[Claude] attempt ${attempt} failed:`, err?.message || err);
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  console.error("[Claude] All attempts failed. Serving offline fallback content.");
  const withFlag = { ...params.fallbackData, _isFallback: true };
  return params.enricher ? params.enricher(withFlag) : withFlag;
}

// Coaching endpoint
app.post('/api/coaching', async (req, res) => {
  const { feeling, timeOfDay } = req.body;

  if (!feeling) {
    return res.status(400).json({ error: "Feeling description is required." });
  }

  if (!apiKey) {
    console.info("ANTHROPIC_API_KEY not set — serving fallback coaching data.");
    return res.json(enrichRecommendation({ ...fallbacks.recommendation, _isFallback: true }));
  }

  const prompt = `
    A user has shared how they are feeling right now: "${feeling}".
    The current time is: ${timeOfDay || new Date().toLocaleTimeString()}.

    Generate a customized, restorative 10-minute daily wellness ritual.
    Always:
    - Customize recommendations based on their emotional, mental, and physical states.
    - Map their symptoms or state to an Ayurvedic dosha imbalance (Vata, Pitta, or Kapha).
    - Design a sequence of standard yoga poses adding to exactly 10 minutes total (e.g., 2m, 3m, 2m, 3m).
    - Provide Sanskrit and English names for yoga poses.
    - Recommend a breathwork exercise with specific timing ratios (inhale, hold, exhale, empty) that matches their state perfectly.
    - Suggest customized warm dietary advice and herbal recipes.
    - Keep the tone grounded, encouraging, and deeply wise. Use humble and sophisticated language.
  `;

  const result = await callClaude({
    system: "You are Amrita, an ancient wise Ayurvedic mentor. Speak with extreme warmth, grace, and human empathy.",
    prompt,
    schema: coachResponseSchema,
    fallbackData: fallbacks.recommendation,
    enricher: enrichRecommendation,
  });

  return res.json(result);
});

// Daily Insight endpoint
app.get('/api/insight', async (req, res) => {
  if (!apiKey) {
    return res.json(fallbacks.insight);
  }

  const result = await callClaude({
    system: "You are Amrita, a concise Ayurvedic mentor. All responses must be extremely brief — follow word limits strictly.",
    prompt: "Generate a brief morning Ayurvedic daily reflection. Be short. No breathing instructions — those belong elsewhere.",
    schema: insightResponseSchema,
    fallbackData: fallbacks.insight,
  });

  return res.json(result);
});

// ElevenLabs TTS proxy
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!elevenKey || elevenKey === 'MY_ELEVENLABS_API_KEY' || !voiceId || voiceId === 'MY_ELEVENLABS_VOICE_ID') {
    return res.status(503).json({ unavailable: true });
  }

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!upstream.ok) {
      const msg = await upstream.text();
      console.error('[ElevenLabs] API error:', msg);
      return res.status(502).json({ error: 'ElevenLabs upstream error' });
    }

    const buffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[ElevenLabs] Request failed:', err);
    res.status(502).json({ error: 'TTS request failed' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PranaVeda server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
