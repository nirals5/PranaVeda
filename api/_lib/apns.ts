import { connect } from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';

// Push nudges to the iPhone app through Apple's push service (APNs), as one
// more channel of the nudge check in push.ts (KAN-31). Token-based: one key
// (.p8) from the Apple Developer account signs a short token for every
// request. Off until APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY are set.

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  key: string; // the .p8 file's PEM text
  topic: string; // the app's bundle id
}

export type ApnsEnvironment = 'sandbox' | 'production';

// A phone's address at APNs. Builds signed for development talk to the
// sandbox; TestFlight and App Store builds to the live service.
export interface AppToken {
  token: string;
  environment: ApnsEnvironment;
}

export interface Nudge {
  title: string;
  body: string;
  url: string;
}

export type SendResult = 'ok' | 'gone' | 'failed';
export type AppSender = (token: AppToken, nudge: Nudge, now?: number) => Promise<SendResult>;
export type Post = (url: string, headers: Record<string, string>, body: string) => Promise<{ status: number; reason?: string }>;

// A nudge that arrives late is worse than none.
const TTL_SECONDS = 15 * 60;
// Apple wants a token reused for at least 20 minutes and refuses one older than an hour.
const TOKEN_REUSE_MS = 40 * 60 * 1000;

export function apnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const key = env.APNS_KEY?.replace(/\\n/g, '\n').trim();
  if (!keyId || !teamId || !key) return null;
  return { keyId, teamId, key: key.endsWith('\n') ? key : `${key}\n`, topic: env.APNS_TOPIC?.trim() || 'com.pranaveda.app' };
}

export function parseDeviceToken(raw: unknown): AppToken | null {
  const { token, environment } = (raw ?? {}) as { token?: unknown; environment?: unknown };
  if (typeof token !== 'string' || !/^[0-9a-fA-F]{64,200}$/.test(token)) return null;
  if (environment !== 'sandbox' && environment !== 'production') return null;
  return { token: token.toLowerCase(), environment };
}

let cached: { keyId: string; at: number; jwt: string } | null = null;

export async function providerToken(config: ApnsConfig, now = Date.now()): Promise<string> {
  if (cached && cached.keyId === config.keyId && now - cached.at >= 0 && now - cached.at < TOKEN_REUSE_MS) return cached.jwt;
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(Math.floor(now / 1000))
    .sign(await importPKCS8(config.key, 'ES256'));
  cached = { keyId: config.keyId, at: now, jwt };
  return jwt;
}

export async function apnsRequest(config: ApnsConfig, to: AppToken, nudge: Nudge, now = Date.now()) {
  const host = to.environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  return {
    url: `${host}/3/device/${to.token}`,
    headers: {
      authorization: `bearer ${await providerToken(config, now)}`,
      'apns-topic': config.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(now / 1000) + TTL_SECONDS),
      // A newer nudge replaces one still on screen.
      'apns-collapse-id': 'pranaveda-nudge',
    },
    body: JSON.stringify({
      aps: { alert: { title: nudge.title, body: nudge.body }, sound: 'default', 'thread-id': 'pranaveda-nudge' },
      url: nudge.url,
    }),
  };
}

// 410: the app was deleted or push was turned off. 400 with these reasons:
// the token was never valid here (another app, or the wrong environment).
export function outcomeOf(status: number, reason?: string): SendResult {
  if (status === 200) return 'ok';
  if (status === 410) return 'gone';
  if (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')) return 'gone';
  return 'failed';
}

export const http2Post: Post = (url, headers, body) =>
  new Promise((resolve, reject) => {
    const { origin, pathname } = new URL(url);
    const session = connect(origin);
    session.on('error', reject);
    const req = session.request({ ':method': 'POST', ':path': pathname, ...headers });
    let status = 0;
    let text = '';
    req.setEncoding('utf8');
    req.on('response', (h) => (status = Number(h[':status'])));
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => {
      session.close();
      let reason: string | undefined;
      try {
        reason = text ? JSON.parse(text).reason : undefined;
      } catch {}
      resolve({ status, reason });
    });
    req.on('error', (err) => {
      session.close();
      reject(err);
    });
    req.setTimeout(10_000, () => req.close());
    req.end(body);
  });

export function apnsSender(config: ApnsConfig | null = apnsConfig(), post: Post = http2Post): AppSender {
  return async (to, nudge, now = Date.now()) => {
    if (!config) return 'failed';
    try {
      const { url, headers, body } = await apnsRequest(config, to, nudge, now);
      const { status, reason } = await post(url, headers, body);
      const outcome = outcomeOf(status, reason);
      if (outcome === 'failed') console.error('[push] apns send failed:', status, reason ?? '');
      return outcome;
    } catch (err: any) {
      console.error('[push] apns send failed:', err?.message || err);
      return 'failed';
    }
  };
}
