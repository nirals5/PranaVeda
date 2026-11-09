import { afterEach, describe, expect, it } from 'vitest';
import { clientCredentials, readAuthorizeRequest, validRedirect } from '../api/_lib/oauth.js';
import { messageAlert, sendAlexaNudge } from '../api/_lib/alexaEvents.js';

// Alexa account linking: the checks on what Amazon sends, and the
// notification Alexa is asked to give.

const REDIRECT = 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA';
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const useClient = () => {
  process.env.ALEXA_OAUTH_CLIENT_ID = 'alexa-skill';
  process.env.ALEXA_OAUTH_CLIENT_SECRET = 'a-long-shared-secret-for-alexa-0123456789';
};

describe('where a code may be sent', () => {
  it("accepts only Amazon's three account-linking addresses", () => {
    expect(validRedirect(REDIRECT)).toBe(true);
    expect(validRedirect('https://layla.amazon.com/api/skill/link/M2AAAAAAAAAAAA')).toBe(true);
    expect(validRedirect('https://alexa.amazon.co.jp/api/skill/link/M2AAAAAAAAAAAA')).toBe(true);
    expect(validRedirect('http://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA')).toBe(false);
    expect(validRedirect('https://pitangui.amazon.com.evil.example/api/skill/link/M2AAAAAAAAAAAA')).toBe(false);
    expect(validRedirect('https://pitangui.amazon.com:8443/api/skill/link/M2AAAAAAAAAAAA')).toBe(false);
    expect(validRedirect('https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA/../x')).toBe(false);
    expect(validRedirect('https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA?next=evil')).toBe(false);
    expect(validRedirect('not a url')).toBe(false);
  });

  it('accepts only this developer account when ALEXA_VENDOR_ID is set', () => {
    process.env.ALEXA_VENDOR_ID = 'M2AAAAAAAAAAAA';
    expect(validRedirect(REDIRECT)).toBe(true);
    expect(validRedirect('https://pitangui.amazon.com/api/skill/link/M2BBBBBBBBBBBB')).toBe(false);
  });
});

describe('the request to link', () => {
  const query = (over: Record<string, unknown> = {}) => ({ response_type: 'code', client_id: 'alexa-skill', redirect_uri: REDIRECT, state: 'abc', scope: 'nudges', ...over });

  it('is read when it comes from the skill, for a known scope', () => {
    useClient();
    expect(readAuthorizeRequest(query())).toEqual({ ok: true, clientId: 'alexa-skill', redirectUri: REDIRECT, state: 'abc', scope: ['nudges'] });
    expect(readAuthorizeRequest(query({ scope: undefined }))).toMatchObject({ ok: true, scope: ['nudges'] });
  });

  it('is refused without sending anyone anywhere when the client or address is wrong', () => {
    useClient();
    expect(readAuthorizeRequest(query({ client_id: 'other' }))).toEqual({ ok: false, error: 'invalid_client' });
    expect(readAuthorizeRequest(query({ redirect_uri: 'https://evil.example/cb' }))).toEqual({ ok: false, error: 'invalid_redirect_uri' });
    delete process.env.ALEXA_OAUTH_CLIENT_ID;
    expect(readAuthorizeRequest(query())).toEqual({ ok: false, error: 'linking_unavailable' });
  });

  it("keeps Amazon's state whole, however long (it is over 1,000 characters and signed)", () => {
    useClient();
    const state = `Amase${'eyJ2YWxpZGF0aW9uQ29kZSI6'.repeat(80)}+/=AAAACfdYGTDq`;
    expect(readAuthorizeRequest(query({ state }))).toMatchObject({ ok: true, state });
    expect(readAuthorizeRequest(query({ state: 'x'.repeat(8193) }))).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('sends other mistakes back to Amazon, with the state', () => {
    useClient();
    expect(readAuthorizeRequest(query({ response_type: 'token' }))).toEqual({ ok: false, error: 'unsupported_response_type', redirectUri: REDIRECT, state: 'abc' });
    expect(readAuthorizeRequest(query({ scope: 'nudges profile' }))).toEqual({ ok: false, error: 'invalid_scope', redirectUri: REDIRECT, state: 'abc' });
  });
});

describe("the skill's credentials at the token endpoint", () => {
  it('are read from HTTP Basic or from the body', () => {
    const basic = `Basic ${Buffer.from('alexa-skill:s%3Acret').toString('base64')}`;
    expect(clientCredentials(basic, {})).toEqual({ id: 'alexa-skill', secret: 's:cret' });
    expect(clientCredentials(undefined, { client_id: 'alexa-skill', client_secret: 'x' })).toEqual({ id: 'alexa-skill', secret: 'x' });
    expect(clientCredentials('Basic !!!', {})).toBeNull();
    expect(clientCredentials(undefined, { client_id: 'alexa-skill' })).toBeNull();
  });
});

describe('Alexa notifications', () => {
  const NOW = Date.parse('2026-11-10T22:00:00Z');

  it('are "a new message from Amrita", for one person, gone within 15 minutes', () => {
    const body = messageAlert({ alexaUserId: 'amzn1.ask.account.A', referenceId: 'ref-1', now: NOW }) as any;
    expect(body.event).toEqual({
      name: 'AMAZON.MessageAlert.Activated',
      payload: { state: { status: 'UNREAD', freshness: 'NEW' }, messageGroup: { creator: { name: 'Amrita' }, count: 1 } },
    });
    expect(body.relevantAudience).toEqual({ type: 'Unicast', payload: { user: 'amzn1.ask.account.A' } });
    expect(body.timestamp).toBe('2026-11-10T22:00:00.000Z');
    expect(body.expiryTime).toBe('2026-11-10T22:15:00.000Z');
    expect(body.localizedAttributes).toEqual([{ locale: 'en-US' }]);
  });

  it('are sent with a token for the skill, to the stage set up', async () => {
    process.env.ALEXA_EVENTS_CLIENT_ID = 'amzn1.application-oa2-client.x';
    process.env.ALEXA_EVENTS_CLIENT_SECRET = 'secret';
    const calls: { url: string; init: any }[] = [];
    const fetcher = async (url: string, init: any) => {
      calls.push({ url, init });
      if (url.includes('/auth/o2/token')) return new Response(JSON.stringify({ access_token: 'lwa', expires_in: 3600 }));
      return new Response(null, { status: 202 });
    };
    expect(await sendAlexaNudge('amzn1.ask.account.A', 'k1', NOW, fetcher)).toBe('ok');
    expect(await sendAlexaNudge('amzn1.ask.account.A', 'k2', NOW, fetcher)).toBe('ok');
    expect(calls.filter((c) => c.url.includes('/auth/o2/token'))).toHaveLength(1); // the token is reused
    expect(String(calls[0].init.body)).toContain('scope=alexa%3A%3Aproactive_events');
    expect(calls[1].url).toBe('https://api.amazonalexa.com/v1/proactiveEvents/stages/development');
    expect(calls[1].init.headers.Authorization).toBe('Bearer lwa');
  });

  it('report a person who turned notifications off as gone, and do nothing unconfigured', async () => {
    process.env.ALEXA_EVENTS_CLIENT_ID = 'amzn1.application-oa2-client.y';
    process.env.ALEXA_EVENTS_CLIENT_SECRET = 'secret';
    process.env.ALEXA_EVENTS_STAGE = 'live';
    const urls: string[] = [];
    const fetcher = async (url: string) => {
      urls.push(url);
      return url.includes('/auth/o2/token') ? new Response(JSON.stringify({ access_token: 'lwa2', expires_in: 3600 })) : new Response(null, { status: 403 });
    };
    expect(await sendAlexaNudge('amzn1.ask.account.A', 'k1', NOW, fetcher)).toBe('gone');
    expect(urls[1]).toBe('https://api.amazonalexa.com/v1/proactiveEvents');
    delete process.env.ALEXA_EVENTS_CLIENT_ID;
    expect(await sendAlexaNudge('amzn1.ask.account.A', 'k1', NOW, fetcher)).toBe('failed');
  });
});
