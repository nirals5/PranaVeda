import { createHash } from 'node:crypto';
import type { SendResult } from './push.js';

// Alexa notifications through Amazon's Proactive Events API: the Echo lights
// up and, when asked, says "You have one new message from Amrita". Saying
// "Alexa, open Prana Veda" then gives the free time itself.
//
// ALEXA_EVENTS_CLIENT_ID and _SECRET are the skill's own credentials, from
// the Permissions page of the skill in the Alexa developer console.

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const EVENTS_URL = 'https://api.amazonalexa.com/v1/proactiveEvents';
// A nudge that arrives late is worse than none (as for web push).
const EXPIRY_MS = 15 * 60 * 1000;

type Fetcher = (url: string, init: any) => Promise<Response>;

export function messageAlert({ alexaUserId, referenceId, now }: { alexaUserId: string; referenceId: string; now: number }) {
  return {
    timestamp: new Date(now).toISOString(),
    referenceId,
    expiryTime: new Date(now + EXPIRY_MS).toISOString(),
    event: {
      name: 'AMAZON.MessageAlert.Activated',
      payload: { state: { status: 'UNREAD', freshness: 'NEW' }, messageGroup: { creator: { name: 'Amrita' }, count: 1 } },
    },
    localizedAttributes: [{ locale: 'en-US' }],
    relevantAudience: { type: 'Unicast', payload: { user: alexaUserId } },
  };
}

const tokens = new Map<string, { token: string; until: number }>();

async function skillToken(clientId: string, secret: string, now: number, fetcher: Fetcher): Promise<string | null> {
  const hit = tokens.get(clientId);
  if (hit && hit.until > now) return hit.token;
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: 'alexa::proactive_events' }).toString(),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const body: any = await res.json();
  if (typeof body?.access_token !== 'string') return null;
  // A minute early, so a token never runs out mid-check.
  tokens.set(clientId, { token: body.access_token, until: now + (Number(body.expires_in) || 3600) * 1000 - 60_000 });
  return body.access_token;
}

export const alexaEventsConfigured = () => !!(process.env.ALEXA_EVENTS_CLIENT_ID && process.env.ALEXA_EVENTS_CLIENT_SECRET);

// 'gone': Amazon refused this person (notifications turned off in the Alexa app).
export async function sendAlexaNudge(alexaUserId: string, slotKey: string, now: number = Date.now(), fetcher: Fetcher = fetch): Promise<SendResult> {
  const clientId = process.env.ALEXA_EVENTS_CLIENT_ID;
  const secret = process.env.ALEXA_EVENTS_CLIENT_SECRET;
  if (!clientId || !secret) return 'failed';
  try {
    const token = await skillToken(clientId, secret, now, fetcher);
    if (!token) return 'failed';
    const stage = process.env.ALEXA_EVENTS_STAGE === 'live' ? '' : '/stages/development';
    const referenceId = createHash('sha256').update(`${alexaUserId}|${slotKey}`).digest('hex').slice(0, 32);
    const res = await fetcher(`${EVENTS_URL}${stage}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messageAlert({ alexaUserId, referenceId, now })),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'ok';
    if (res.status === 401) tokens.delete(clientId);
    if (res.status === 403) return 'gone';
    console.error('[alexa] notification failed:', res.status);
    return 'failed';
  } catch (err: any) {
    console.error('[alexa] notification failed:', err?.message || err);
    return 'failed';
  }
}
