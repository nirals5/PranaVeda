import { timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb, schema } from './db.js';
import { hashToken, newOpaqueToken } from './tokens.js';

// PranaVeda as an OAuth 2.0 authorization server for one client: the Alexa
// skill (account linking, authorization-code grant). Routes are in api/auth.ts.

const { oauthCodes } = schema;

export const ALEXA_SCOPES = ['nudges'] as const;
const CODE_TTL_MS = 5 * 60 * 1000;

export interface OAuthClient {
  id: string;
  secret: string;
}

// ALEXA_OAUTH_CLIENT_ID and _SECRET: made up here, and given to Amazon in
// the skill's account-linking settings.
export function alexaClient(): OAuthClient | null {
  const id = process.env.ALEXA_OAUTH_CLIENT_ID;
  const secret = process.env.ALEXA_OAUTH_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

const LINK_HOSTS = new Set(['pitangui.amazon.com', 'layla.amazon.com', 'alexa.amazon.co.jp']);

// Amazon's "Alexa Redirect URLs": https://<one of three hosts>/api/skill/link/<vendor id>.
export function validRedirect(raw: string, vendorId = process.env.ALEXA_VENDOR_ID): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const m = /^\/api\/skill\/link\/([A-Z0-9]+)$/.exec(url.pathname);
  return (
    url.protocol === 'https:' &&
    LINK_HOSTS.has(url.hostname) &&
    url.port === '' &&
    !url.search &&
    !url.hash &&
    url.href === raw &&
    !!m &&
    (!vendorId || m[1] === vendorId)
  );
}

export type AuthorizeRequest =
  | { ok: true; clientId: string; redirectUri: string; state: string; scope: string[] }
  // With redirectUri, the error goes back to Amazon; without, it is shown here.
  | { ok: false; error: string; redirectUri?: string; state?: string };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function readAuthorizeRequest(q: Record<string, unknown>): AuthorizeRequest {
  const client = alexaClient();
  if (!client) return { ok: false, error: 'linking_unavailable' };
  if (str(q.client_id) !== client.id) return { ok: false, error: 'invalid_client' };
  const redirectUri = str(q.redirect_uri);
  if (!validRedirect(redirectUri)) return { ok: false, error: 'invalid_redirect_uri' };
  const state = str(q.state).slice(0, 1024);
  const back = (error: string) => ({ ok: false as const, error, redirectUri, state });
  if (q.response_type !== 'code') return back('unsupported_response_type');
  const scope = str(q.scope).split(/\s+/).filter(Boolean);
  if (scope.some((s) => !(ALEXA_SCOPES as readonly string[]).includes(s))) return back('invalid_scope');
  return { ok: true, clientId: client.id, redirectUri, state, scope: scope.length ? scope : [...ALEXA_SCOPES] };
}

export function redirectWith(uri: string, params: Record<string, string | undefined>): string {
  const query = Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return query ? `${uri}?${query}` : uri;
}

// HTTP Basic (form-encoded parts, RFC 6749 §2.3.1) or the request body.
export function clientCredentials(authorization: string | undefined, body: Record<string, unknown>): OAuthClient | null {
  const m = /^Basic\s+(\S+)$/i.exec(authorization?.trim() ?? '');
  if (m) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 1) return null;
    try {
      return { id: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) };
    } catch {
      return null;
    }
  }
  const id = str(body.client_id);
  const secret = str(body.client_secret);
  return id && secret ? { id, secret } : null;
}

export function sameClient(given: OAuthClient, expected: OAuthClient): boolean {
  const a = Buffer.from(given.secret);
  const b = Buffer.from(expected.secret);
  return given.id === expected.id && a.length === b.length && timingSafeEqual(a, b);
}

export async function issueCode(grant: { userId: string; clientId: string; redirectUri: string; scope: string[] }, now = new Date()): Promise<string> {
  const code = newOpaqueToken();
  await getDb()
    .insert(oauthCodes)
    .values({
      codeHash: hashToken(code),
      userId: grant.userId,
      clientId: grant.clientId,
      redirectUri: grant.redirectUri,
      scope: grant.scope.join(' '),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
  return code;
}

// Single use: one statement marks it used, so two exchanges cannot both win.
export async function redeemCode(code: string, clientId: string, redirectUri: string, now = new Date()): Promise<{ userId: string; scope: string[] } | null> {
  const [row] = await getDb()
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(and(eq(oauthCodes.codeHash, hashToken(code)), isNull(oauthCodes.usedAt), gt(oauthCodes.expiresAt, now)))
    .returning();
  if (!row || row.clientId !== clientId || row.redirectUri !== redirectUri) return null;
  return { userId: row.userId, scope: row.scope ? row.scope.split(' ') : [] };
}
