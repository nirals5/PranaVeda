import { SignJWT, importPKCS8 } from 'jose';
import type { Nudge, SendResult } from './apns.js';

// Push nudges to the Android app through Firebase Cloud Messaging (FCM), as
// one more channel of the nudge check in push.ts (KAN-31). The HTTP v1 API,
// signed in as the Firebase project's service account. Off until
// FCM_SERVICE_ACCOUNT holds that account's JSON file.

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string; // PEM
  tokenUri: string;
}

export type FcmSender = (token: string, nudge: Nudge, now?: number) => Promise<SendResult>;
export type Fetcher = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number; json(): Promise<any> }>;

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
// A nudge that arrives late is worse than none.
const TTL = '900s';
// Asked for again this long before Google's hour runs out.
const RENEW_BEFORE_MS = 5 * 60 * 1000;

export function fcmConfig(env: Record<string, string | undefined> = process.env): FcmConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  let account: Record<string, unknown>;
  try {
    account = JSON.parse(raw);
  } catch {
    return null;
  }
  const { project_id, client_email, private_key, token_uri } = account;
  if (typeof project_id !== 'string' || typeof client_email !== 'string' || typeof private_key !== 'string') return null;
  return {
    projectId: project_id,
    clientEmail: client_email,
    privateKey: private_key.replace(/\\n/g, '\n'),
    tokenUri: typeof token_uri === 'string' ? token_uri : 'https://oauth2.googleapis.com/token',
  };
}

// FCM registration tokens: letters, digits, ':', '_' and '-', usually ~160 long.
export function parseFcmToken(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9:_-]{100,4096}$/.test(raw) ? raw : null;
}

export async function serviceAssertion(config: FcmConfig, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.clientEmail)
    .setAudience(config.tokenUri)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(await importPKCS8(config.privateKey, 'RS256'));
}

const cache = new Map<string, { token: string; until: number }>();

export async function googleAccessToken(config: FcmConfig, now = Date.now(), fetcher: Fetcher = fetch as unknown as Fetcher): Promise<string> {
  const held = cache.get(config.clientEmail);
  if (held && now < held.until) return held.token;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: await serviceAssertion(config, now),
  }).toString();
  const res = await fetcher(config.tokenUri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(() => ({}));
  if (res.status !== 200 || typeof json.access_token !== 'string') throw new Error(`google sign-in failed: ${res.status}`);
  const lifetime = (Number(json.expires_in) || 3600) * 1000;
  cache.set(config.clientEmail, { token: json.access_token, until: now + lifetime - RENEW_BEFORE_MS });
  return json.access_token;
}

// A data message: the app shows it itself, and not while PranaVeda is on screen.
export function fcmMessage(config: FcmConfig, token: string, nudge: Nudge) {
  return {
    url: `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
    body: JSON.stringify({
      message: {
        token,
        data: { title: nudge.title, body: nudge.body, url: nudge.url },
        android: { priority: 'HIGH', ttl: TTL, collapse_key: 'pranaveda-nudge' },
      },
    }),
  };
}

// UNREGISTERED: the app was removed or its token replaced. SENDER_ID_MISMATCH:
// a token from another Firebase project. Anything else may pass.
export function fcmOutcome(status: number, errorCode?: string): SendResult {
  if (status === 200) return 'ok';
  if (errorCode === 'UNREGISTERED' || errorCode === 'SENDER_ID_MISMATCH') return 'gone';
  return 'failed';
}

const errorCodeOf = (json: any): string | undefined =>
  (json?.error?.details as any[] | undefined)?.find((d) => typeof d?.errorCode === 'string')?.errorCode;

export function fcmSender(config: FcmConfig | null = fcmConfig(), fetcher: Fetcher = fetch as unknown as Fetcher): FcmSender {
  return async (token, nudge, now = Date.now()) => {
    if (!config) return 'failed';
    try {
      const access = await googleAccessToken(config, now, fetcher);
      const { url, body } = fcmMessage(config, token, nudge);
      const res = await fetcher(url, { method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body });
      const json = res.status === 200 ? null : await res.json().catch(() => null);
      const outcome = fcmOutcome(res.status, errorCodeOf(json));
      if (outcome === 'failed') console.error('[push] fcm send failed:', res.status, errorCodeOf(json) ?? json?.error?.status ?? '');
      return outcome;
    } catch (err: any) {
      console.error('[push] fcm send failed:', err?.message || err);
      return 'failed';
    }
  };
}
