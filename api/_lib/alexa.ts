import { X509Certificate, createVerify } from 'node:crypto';
import { rootCertificates } from 'node:tls';

// The Alexa skill (Phase 1.5a): no account linking, so Alexa never says who is
// speaking and nothing personal is ever spoken. A speaker is heard by the
// whole room. Pure pieces live here; the route is in api/index.ts.
//
// Amazon's rules for a skill on its own endpoint ("Host a custom skill as a
// web service"): every request is signed, and anything that fails a check
// below is refused with 400.

// ---------------------------- Request verification ----------------------------

// A request older or newer than this is a replay (Amazon allows 150 s).
export const MAX_SKEW_MS = 150 * 1000;

// https://s3.amazonaws.com(:443)/echo.api/… — the only place Amazon keeps its
// signing certificates. Case is ignored for the scheme and host, and the path
// is normalised first, so "/echo.api/../evil" is refused.
export function validCertUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 's3.amazonaws.com' &&
    (url.port === '' || url.port === '443') &&
    url.pathname.startsWith('/echo.api/')
  );
}

// "-----BEGIN CERTIFICATE----- …" × n → the signing certificate first.
export function parseChain(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((b) => new X509Certificate(b));
}

// The signing certificate names echo-api.amazon.com, and each certificate is
// signed by the next until one is signed by a root this server trusts. Amazon's
// chain runs on past that (Amazon Root CA 1, cross-signed by Starfield, then
// cross-signed again by a Starfield authority that trust stores have since
// dropped), so the chain is trusted at the first certificate a root vouches
// for; what follows it is not needed. Every certificate up to there must be
// current.
export function validChain(chain: X509Certificate[], now: Date, roots: readonly string[] = rootCertificates): boolean {
  if (!chain.length) return false;
  const current = (c: X509Certificate) => new Date(c.validFrom) <= now && now <= new Date(c.validTo);
  if (!chain[0].checkHost('echo-api.amazon.com', { subject: 'never' })) return false;
  const anchors = roots.map((pem) => new X509Certificate(pem)).filter(current);
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (!current(cert)) return false;
    if (anchors.some((root) => cert.checkIssued(root) && cert.verify(root.publicKey))) return true;
    const next = chain[i + 1];
    if (!next || !cert.checkIssued(next) || !cert.verify(next.publicKey)) return false;
  }
  return false;
}

export type VerifyInput = {
  rawBody: Buffer;
  certUrl: string | undefined;
  signature: string | undefined; // the Signature-256 header, base64
  fetchChain: (url: string) => Promise<string>;
  now?: Date;
  roots?: readonly string[];
  skillId?: string; // ALEXA_SKILL_ID; when set, other skills' requests are refused
};

// Why a request is refused, or undefined when it is genuinely from Amazon
// for this skill. The body is parsed only after the signature checks out.
export async function verifyAlexaRequest(input: VerifyInput): Promise<string | undefined> {
  const now = input.now ?? new Date();
  if (!validCertUrl(input.certUrl)) return 'certificate url';
  if (!input.signature) return 'signature missing';
  let chain: X509Certificate[];
  try {
    chain = parseChain(await input.fetchChain(input.certUrl!));
  } catch {
    return 'certificate unavailable';
  }
  if (!validChain(chain, now, input.roots)) return 'certificate chain';
  const verifier = createVerify('RSA-SHA256');
  verifier.update(input.rawBody);
  if (!verifier.verify(chain[0].publicKey, input.signature, 'base64')) return 'signature';
  let body: any;
  try {
    body = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    return 'body';
  }
  const at = Date.parse(body?.request?.timestamp ?? '');
  if (!Number.isFinite(at) || Math.abs(now.getTime() - at) > MAX_SKEW_MS) return 'timestamp';
  const appId = body?.context?.System?.application?.applicationId ?? body?.session?.application?.applicationId;
  if (input.skillId && appId !== input.skillId) return 'skill id';
  return undefined;
}

// --------------------------------- Responses ----------------------------------

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const say = (text: string) => escape(text);
export const pause = (seconds: number) => `<break time="${Math.min(10, Math.max(0, seconds))}s"/>`;

type Options = { reprompt?: string; end?: boolean; directives?: unknown[]; card?: unknown; attributes?: Record<string, unknown> };

// A spoken reply. `ssml` is already-escaped SSML without <speak>.
export function speak(ssml: string, { reprompt, end = true, directives, card, attributes }: Options = {}) {
  const handsOver = directives?.some((d: any) => d?.type === 'Connections.SendRequest');
  return {
    version: '1.0',
    ...(attributes ? { sessionAttributes: attributes } : {}),
    response: {
      outputSpeech: { type: 'SSML', ssml: `<speak>${ssml}</speak>` },
      ...(reprompt ? { reprompt: { outputSpeech: { type: 'SSML', ssml: `<speak>${reprompt}</speak>` } } } : {}),
      ...(card ? { card } : {}),
      ...(directives ? { directives } : {}),
      // A permission request hands the session to Alexa, so it must not set this.
      ...(handsOver ? {} : { shouldEndSession: end }),
    },
  };
}

export const OFFER = 'Would you like a short breathing practice, or a daily reminder to practise?';
export const HELP =
  'I can guide a short calming breath, or set a daily reminder to practise. Try saying, a breathing practice, or, remind me every evening at seven.';
export const GOODBYE = 'Be well.';
// Shown under Amazon's rules for wellness skills.
export const DISCLAIMER = 'PranaVeda offers general wellness guidance, not medical advice.';

// What the skill last offered, kept in the session so "yes" means it.
export type Offer = 'choice' | 'breath';

// ------------------------------- Guided breath --------------------------------

// A plain calming breath: in through the nose for 4, out for 6, six times.
// Gentle enough for anyone in the room (no holds, no forceful or heating
// breath), spoken from fixed text so no AI runs while it plays.
export const BREATH = { inhale: 4, exhale: 6, cycles: 6 } as const;

export function guidedBreath(): string {
  const { inhale, exhale, cycles } = BREATH;
  const parts = [
    say("Let's take a minute to breathe together. Sit comfortably, let your shoulders soften, and close your eyes if you like."),
    pause(2),
    say(`Breathe in through your nose for ${inhale}, and out slowly for ${exhale}.`),
    pause(1),
  ];
  for (let i = 1; i <= cycles; i++) {
    parts.push(say(i === 1 ? 'Breathe in.' : 'In.'), pause(inhale - 1));
    parts.push(say(i === 1 ? 'And slowly out.' : 'Out.'), pause(exhale - 1));
  }
  parts.push(
    say('Let your breath return to its own rhythm. Notice how you feel.'),
    pause(2),
    say('If you felt light-headed at any point, rest and breathe normally. Be well.')
  );
  return parts.join(' ');
}

// --------------------------------- Reminders ----------------------------------

export const REMINDERS_SCOPE = 'alexa::alerts:reminders:skill:readwrite';

// AMAZON.TIME → "HH:MM". It sends "19:00", or MO / AF / EV / NI for a part of
// the day; anything else is not a time we can set.
const PARTS: Record<string, string> = { MO: '07:00', AF: '14:00', EV: '19:00', NI: '21:00' };
export function reminderTime(slot: string | undefined): string | undefined {
  if (!slot) return undefined;
  if (PARTS[slot]) return PARTS[slot];
  const m = /^(\d{2}):(\d{2})$/.exec(slot);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return slot;
}

// "19:00" → "7 p.m.", "07:30" → "7:30 a.m.", for saying it back.
export function spokenTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 12 || 12;
  const suffix = h < 12 ? 'a.m.' : 'p.m.';
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
}

// A daily reminder at that time, in the Echo's own time zone (no timeZoneId).
export function reminderRequest(hhmm: string, now: Date) {
  const [h, m] = hhmm.split(':').map(Number);
  const day = now.toISOString().slice(0, 10);
  return {
    requestTime: now.toISOString().slice(0, 19),
    trigger: {
      type: 'SCHEDULED_ABSOLUTE',
      recurrence: {
        startDateTime: `${day}T00:00:00.000`,
        recurrenceRules: [`FREQ=DAILY;BYHOUR=${h};BYMINUTE=${m};BYSECOND=0;INTERVAL=1`],
      },
    },
    alertInfo: {
      spokenInfo: {
        content: [{ locale: 'en-US', text: 'Time for a moment of practice. Say, Alexa, ask Prana Veda for a breathing practice.' }],
      },
    },
    pushNotification: { status: 'ENABLED' },
  };
}

// Asks for reminder permission by voice. The time rides along in the token
// and comes back with Amazon's answer (a Connections.Response request).
export function askForReminders(hhmm: string) {
  return {
    type: 'Connections.SendRequest',
    name: 'AskFor',
    payload: { '@type': 'AskForPermissionsConsentRequest', '@version': '2', permissionScopes: [{ permissionScope: REMINDERS_SCOPE, consentLevel: 'ACCOUNT' }] },
    token: hhmm,
  };
}

// --------------------------------- Reflection ---------------------------------

// Spoken when no fresh reflection is ready within Alexa's time limit.
export const FALLBACK_REFLECTIONS = [
  'Let your breath be the anchor of this moment.',
  'Steadiness grows from small, daily returns to the breath.',
  'Rest is part of practice, not a pause from it.',
  'Move gently, and let the body tell you how much is enough.',
];
export const fallbackReflection = (date: string) =>
  FALLBACK_REFLECTIONS[[...date].reduce((n, c) => n + c.charCodeAt(0), 0) % FALLBACK_REFLECTIONS.length];

// The Echo's date and part of the day, from its time zone; without one, the
// UTC date and no part of the day.
export type PartOfDay = 'morning' | 'afternoon' | 'evening';
export function partOfDay(now: Date, timeZone?: string): { date: string; part?: PartOfDay } {
  if (!timeZone) return { date: now.toISOString().slice(0, 10) };
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    const hour = Number(p.hour);
    return { date: `${p.year}-${p.month}-${p.day}`, part: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening' };
  } catch {
    return { date: now.toISOString().slice(0, 10) };
  }
}

// Words that would make a shared-room reflection personal or clinical.
const NOT_FOR_A_SPEAKER = /\b(diagnos\w*|disease|illness|symptom\w*|medication|medicine|pregnan\w*|blood pressure|injur\w*|pain|anxiety|depress\w*|weight|cure\w*|treat\w*)\b/i;
export const speakerSafe = (text: string) => !NOT_FOR_A_SPEAKER.test(text) && text.length <= 300;

// ------------------------------ Handling a request ------------------------------

export type AlexaDeps = {
  // Today's short reflection for a part of the day, never waiting long.
  reflection: (when: { date: string; part?: PartOfDay }) => Promise<string>;
  // The Echo's time zone (Alexa Settings API), or undefined.
  timeZone: (apiEndpoint: string, deviceId: string, token: string) => Promise<string | undefined>;
  // POST /v1/alerts/reminders; resolves to the HTTP status.
  createReminder: (apiEndpoint: string, token: string, body: unknown) => Promise<number>;
  now?: () => Date;
};

const end = () => ({ version: '1.0', response: {} });

// Hands the conversation to Alexa to ask for reminder permission by voice.
// Alexa speaks the question itself, so the reply carries no speech.
function askPermission(hhmm: string) {
  return { version: '1.0', response: { directives: [askForReminders(hhmm)] } };
}

const granted = (body: any) => body?.context?.System?.user?.permissions?.scopes?.[REMINDERS_SCOPE]?.status === 'GRANTED';

async function setReminder(body: any, hhmm: string, deps: AlexaDeps, mayAsk: boolean) {
  const system = body?.context?.System ?? {};
  const now = deps.now?.() ?? new Date();
  let status = 0;
  try {
    status = await deps.createReminder(system.apiEndpoint, system.apiAccessToken, reminderRequest(hhmm, now));
  } catch {
    status = 0;
  }
  if (status >= 200 && status < 300) {
    return speak(say(`Done. I'll remind you every day at ${spokenTime(hhmm)} to take a moment for practice. Be well.`));
  }
  if ((status === 401 || status === 403) && mayAsk) return askPermission(hhmm);
  if (status === 401 || status === 403) return speak(say('I need permission to set reminders. You can allow it for Prana Veda in the Alexa app.'));
  return speak(say("I couldn't set the reminder just now. Please try again a little later."));
}

// The reply to one verified request from Alexa.
export async function handleAlexa(body: any, deps: AlexaDeps): Promise<unknown> {
  const request = body?.request ?? {};
  const attributes = body?.session?.attributes ?? {};
  switch (request.type) {
    case 'LaunchRequest': {
      const system = body?.context?.System ?? {};
      const now = deps.now?.() ?? new Date();
      const zone = await deps
        .timeZone(system.apiEndpoint, system.device?.deviceId, system.apiAccessToken)
        .catch(() => undefined);
      const reflection = await deps.reflection(partOfDay(now, zone));
      return speak(`${say(reflection)} ${pause(1)} ${say(OFFER)}`, {
        reprompt: say(OFFER),
        end: false,
        attributes: { offer: 'choice' satisfies Offer },
        card: { type: 'Simple', title: 'PranaVeda', content: `${reflection}\n\n${DISCLAIMER}` },
      });
    }
    case 'IntentRequest': {
      const intent = request.intent ?? {};
      switch (intent.name) {
        case 'BreathIntent':
          return speak(guidedBreath());
        case 'AMAZON.YesIntent':
          // "Yes" to "a breathing practice, or a daily reminder?" starts the breath.
          return speak(guidedBreath());
        case 'ReminderIntent': {
          const hhmm = reminderTime(intent.slots?.time?.value);
          if (!hhmm) {
            const ask = say('What time each day? For example, seven in the evening.');
            return speak(ask, { reprompt: ask, end: false, attributes: { ...attributes, offer: undefined } });
          }
          if (!granted(body)) return askPermission(hhmm);
          return setReminder(body, hhmm, deps, true);
        }
        case 'AMAZON.HelpIntent':
          return speak(say(HELP), { reprompt: say(OFFER), end: false });
        case 'AMAZON.FallbackIntent':
          return speak(say(`I can't help with that one. ${HELP}`), { reprompt: say(OFFER), end: false });
        case 'AMAZON.NoIntent':
        case 'AMAZON.StopIntent':
        case 'AMAZON.CancelIntent':
        case 'AMAZON.NavigateHomeIntent':
          return speak(say(GOODBYE));
        default:
          return speak(say(HELP), { reprompt: say(OFFER), end: false });
      }
    }
    // Amazon's answer to the permission question; the time is in the token.
    case 'Connections.Response': {
      const hhmm = reminderTime(request.token);
      if (request.name === 'AskFor' && request.payload?.status === 'ACCEPTED' && hhmm) return setReminder(body, hhmm, deps, false);
      return speak(say('No problem. You can allow reminders for Prana Veda in the Alexa app any time.'));
    }
    case 'SessionEndedRequest':
      return end();
    default:
      return end();
  }
}
