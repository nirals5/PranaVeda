import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../api/index.js';
import {
  BREATH,
  REMINDERS_SCOPE,
  freeTimeLine,
  greeting,
  handleAlexa,
  historyLine,
  partOfDay,
  reminderRequest,
  reminderTime,
  speakerSafe,
  spokenTime,
  validCertUrl,
  verifyAlexaRequest,
} from '../api/_lib/alexa.js';
import type { AlexaDeps } from '../api/_lib/alexa.js';

// The Alexa skill, Phase 1.5a: only Amazon's signed requests are answered,
// and nothing personal is ever spoken.

const NOW = new Date('2026-10-29T19:00:00Z');
const SKILL = 'amzn1.ask.skill.test';
const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-12.pem';

const alexaBody = (requestPart: Record<string, unknown>, extra: { attributes?: Record<string, unknown>; granted?: boolean } = {}) => ({
  version: '1.0',
  session: { new: true, application: { applicationId: SKILL }, attributes: extra.attributes ?? {} },
  context: {
    System: {
      application: { applicationId: SKILL },
      device: { deviceId: 'device-1' },
      apiEndpoint: 'https://api.amazonalexa.com',
      apiAccessToken: 'token-1',
      user: extra.granted ? { permissions: { scopes: { [REMINDERS_SCOPE]: { status: 'GRANTED' } } } } : {},
    },
  },
  request: { requestId: 'r1', timestamp: NOW.toISOString(), locale: 'en-US', ...requestPart },
});

function fakeDeps(over: Partial<AlexaDeps> = {}) {
  const calls: { reminders: unknown[] } = { reminders: [] };
  const deps: AlexaDeps = {
    reflection: async () => 'Let the evening settle gently around you.',
    timeZone: async () => 'America/Los_Angeles',
    createReminder: async (_endpoint, _token, body) => {
      calls.reminders.push(body);
      return 201;
    },
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}

const ssml = (reply: any) => String(reply?.response?.outputSpeech?.ssml ?? '');

// A throwaway root and an "Amazon" signing certificate under it, so the real
// verification runs end to end without reaching Amazon.
let pki: { rootPem: string; leafPem: string; leafKey: string; wrongHostPem: string; wrongHostKey: string };
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'alexa-pki-'));
  const f = (name: string) => join(dir, name);
  // The first openssl that runs (a Mac may have a stale one first on PATH).
  const bin = ['openssl', '/usr/bin/openssl', '/opt/homebrew/bin/openssl'].find((b) => {
    try {
      execFileSync(b, ['version'], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  });
  if (!bin) throw new Error('openssl is needed to make test certificates');
  const ssl = (...args: string[]) => execFileSync(bin, args, { stdio: 'pipe' });
  writeFileSync(f('ca.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=v3\n[dn]\n[v3]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('ca.key'), '-out', f('ca.pem'), '-days', '2', '-subj', '/CN=PranaVeda Test Root', '-config', f('ca.cnf'));
  const leaf = (name: string, host: string) => {
    writeFileSync(f(`${name}.ext`), `subjectAltName=DNS:${host}\nkeyUsage=digitalSignature\n`);
    ssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', f(`${name}.key`), '-out', f(`${name}.csr`), '-subj', `/CN=${host}`);
    ssl('x509', '-req', '-in', f(`${name}.csr`), '-CA', f('ca.pem'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f(`${name}.pem`), '-days', '1', '-extfile', f(`${name}.ext`));
  };
  leaf('leaf', 'echo-api.amazon.com');
  leaf('wrong', 'evil.example.com');
  const read = (name: string) => readFileSync(f(name), 'utf8');
  pki = { rootPem: read('ca.pem'), leafPem: read('leaf.pem'), leafKey: read('leaf.key'), wrongHostPem: read('wrong.pem'), wrongHostKey: read('wrong.key') };
});

const sign = (raw: Buffer, key: string) => createSign('RSA-SHA256').update(raw).sign(key, 'base64');
const verifyWith = (raw: Buffer, over: Partial<Parameters<typeof verifyAlexaRequest>[0]> = {}) =>
  verifyAlexaRequest({
    rawBody: raw,
    certUrl: CERT_URL,
    signature: sign(raw, pki.leafKey),
    fetchChain: async () => pki.leafPem,
    now: new Date(),
    roots: [pki.rootPem],
    skillId: SKILL,
    ...over,
  });
const fresh = () => Buffer.from(JSON.stringify(alexaBody({ type: 'LaunchRequest', timestamp: new Date().toISOString() })));

describe('verifying a request from Amazon', () => {
  it('accepts only https://s3.amazonaws.com/echo.api/ certificate addresses', () => {
    expect(validCertUrl('https://s3.amazonaws.com/echo.api/echo-api-cert.pem')).toBe(true);
    expect(validCertUrl('HTTPS://S3.AMAZONAWS.COM/echo.api/echo-api-cert.pem')).toBe(true);
    expect(validCertUrl('https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem')).toBe(true);
    expect(validCertUrl('http://s3.amazonaws.com/echo.api/echo-api-cert.pem')).toBe(false);
    expect(validCertUrl('https://notamazon.com/echo.api/echo-api-cert.pem')).toBe(false);
    expect(validCertUrl('https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem')).toBe(false);
    expect(validCertUrl('https://s3.amazonaws.com/invalid.path/echo-api-cert.pem')).toBe(false);
    expect(validCertUrl('https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem')).toBe(false);
    expect(validCertUrl('https://s3.amazonaws.com/echo.api/../evil/cert.pem')).toBe(false);
    expect(validCertUrl(undefined)).toBe(false);
  });

  it('accepts a genuine, fresh request for this skill', async () => {
    expect(await verifyWith(fresh())).toBeUndefined();
  });

  it('refuses a changed body, a missing signature, or the wrong signer', async () => {
    const raw = fresh();
    const tampered = Buffer.from(raw.toString().replace('LaunchRequest', 'IntentRequest'));
    expect(await verifyWith(tampered, { signature: sign(raw, pki.leafKey) })).toBe('signature');
    expect(await verifyWith(raw, { signature: undefined })).toBe('signature missing');
    expect(await verifyWith(raw, { signature: sign(raw, pki.wrongHostKey), fetchChain: async () => pki.wrongHostPem })).toBe('certificate chain');
  });

  it('trusts the chain at the first certificate a root vouches for, as Amazon\'s cross-signed chain needs', async () => {
    // Amazon's chain ends in a cross-signature from an authority trust stores
    // have dropped; an untrusted certificate after the trusted link is ignored.
    const raw = fresh();
    expect(await verifyWith(raw, { fetchChain: async () => pki.leafPem + pki.rootPem + pki.wrongHostPem })).toBeUndefined();
    // …but every link before it must hold.
    expect(await verifyWith(raw, { fetchChain: async () => pki.leafPem + pki.wrongHostPem + pki.rootPem, roots: [pki.wrongHostPem] })).toBe('certificate chain');
  });

  it('refuses a certificate not issued by a trusted root', async () => {
    expect(await verifyWith(fresh(), { roots: [] })).toBe('certificate chain');
  });

  it("refuses a stale request and another skill's request", async () => {
    const old = Buffer.from(JSON.stringify(alexaBody({ type: 'LaunchRequest', timestamp: new Date(Date.now() - 200_000).toISOString() })));
    expect(await verifyWith(old)).toBe('timestamp');
    const other = Buffer.from(
      JSON.stringify({ ...alexaBody({ type: 'LaunchRequest', timestamp: new Date().toISOString() }), session: {}, context: { System: { application: { applicationId: 'someone-else' } } } })
    );
    expect(await verifyWith(other)).toBe('skill id');
  });

  it('lets a skill event (account linked, notifications turned on) be up to an hour old, as Amazon sends them', async () => {
    const event = (age: number, type = 'AlexaSkillEvent.ProactiveSubscriptionChanged') =>
      Buffer.from(JSON.stringify(alexaBody({ type, timestamp: new Date(Date.now() - age).toISOString() })));
    expect(await verifyWith(event(30 * 60 * 1000))).toBeUndefined();
    expect(await verifyWith(event(61 * 60 * 1000))).toBe('timestamp');
    expect(await verifyWith(event(30 * 60 * 1000, 'LaunchRequest'))).toBe('timestamp');
  });

  it('answers unsigned requests to /api/alexa with 400 and says nothing', async () => {
    const res = await request(app).post('/api/alexa').set('Content-Type', 'application/json').send(JSON.stringify(alexaBody({ type: 'LaunchRequest' })));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
  });
});

describe('what the skill says', () => {
  it('opens with a reflection for this part of the day, then offers breath or a reminder', async () => {
    const asked: unknown[] = [];
    const { deps } = fakeDeps({ reflection: async (when) => (asked.push(when), 'Let the evening settle gently around you.') });
    const reply: any = await handleAlexa(alexaBody({ type: 'LaunchRequest' }), deps);
    expect(asked).toEqual([{ date: '2026-10-29', part: 'afternoon' }]); // noon in Los Angeles
    expect(ssml(reply)).toContain('Let the evening settle gently around you.');
    expect(ssml(reply)).toContain('a short breathing practice, or a daily reminder');
    expect(reply.response.shouldEndSession).toBe(false);
    expect(reply.response.card.content).toContain('not medical advice');
  });

  it('greets a linked person by name, with their free time and practice history', async () => {
    const seen: unknown[] = [];
    const { deps } = fakeDeps({
      personal: async (body, zone) => (seen.push([body.context.System.user.accessToken, zone]), { name: 'Hetan', free: 'You have 40 open minutes, until 12:40 PM.', history: 'You last practised yesterday.' }),
    });
    const body = alexaBody({ type: 'LaunchRequest' });
    body.context.System.user = { userId: 'amzn1.ask.account.A', accessToken: 'linked-token' } as any;
    const reply: any = await handleAlexa(body, deps);
    expect(seen).toEqual([['linked-token', 'America/Los_Angeles']]);
    const said = ssml(reply);
    expect(said.indexOf('Good afternoon, Hetan.')).toBe(7); // right after <speak>
    expect(said).toContain('You have 40 open minutes, until 12:40 PM.');
    expect(said).toContain('You last practised yesterday.');
    expect(said.indexOf('Let the evening settle')).toBeLessThan(said.indexOf('40 open minutes'));
    expect(said).toContain('a short breathing practice, or a daily reminder');
    expect(reply.response.card.content).toContain('40 open minutes');
  });

  it('opens as before when not linked, and asks to link again when the link was ended on the website', async () => {
    const { deps } = fakeDeps({ personal: async () => undefined });
    const unlinked: any = await handleAlexa(alexaBody({ type: 'LaunchRequest' }), deps);
    expect(ssml(unlinked)).not.toContain('Good');
    expect(unlinked.response.card.type).toBe('Simple');

    const ended: any = await handleAlexa(alexaBody({ type: 'LaunchRequest' }), fakeDeps({ personal: async () => null }).deps);
    expect(ssml(ended)).toContain('link your PranaVeda account in the Alexa app');
    expect(ended.response.card).toEqual({ type: 'LinkAccount' });
  });

  it('still opens when the personal lines fail', async () => {
    const { deps } = fakeDeps({ personal: () => Promise.reject(new Error('db down')) });
    const reply: any = await handleAlexa(alexaBody({ type: 'LaunchRequest' }), deps);
    expect(ssml(reply)).toContain('Let the evening settle gently around you.');
  });

  it('hands skill events to be recorded, and says nothing', async () => {
    const events: unknown[] = [];
    const { deps } = fakeDeps({ skillEvent: async (body) => void events.push(body.request.type) });
    for (const type of ['AlexaSkillEvent.ProactiveSubscriptionChanged', 'AlexaSkillEvent.SkillAccountLinked', 'AlexaSkillEvent.SkillDisabled']) {
      expect(await handleAlexa(alexaBody({ type }), deps)).toEqual({ version: '1.0', response: {} });
    }
    expect(events).toEqual(['AlexaSkillEvent.ProactiveSubscriptionChanged', 'AlexaSkillEvent.SkillAccountLinked', 'AlexaSkillEvent.SkillDisabled']);
  });

  it('still opens when the time zone cannot be read', async () => {
    const asked: unknown[] = [];
    const { deps } = fakeDeps({ timeZone: () => Promise.reject(new Error('down')), reflection: async (when) => (asked.push(when), 'Rest.') });
    await handleAlexa(alexaBody({ type: 'LaunchRequest' }), deps);
    expect(asked).toEqual([{ date: '2026-10-29' }]);
  });

  it('guides a calming breath from fixed text, with pauses Alexa allows', async () => {
    const { deps } = fakeDeps();
    for (const name of ['BreathIntent', 'AMAZON.YesIntent']) {
      const reply: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name } }), deps);
      const text = ssml(reply);
      expect(text.startsWith('<speak>')).toBe(true);
      const breaks = [...text.matchAll(/<break time="(\d+)s"\/>/g)].map((m) => Number(m[1]));
      expect(breaks.length).toBeGreaterThanOrEqual(BREATH.cycles * 2);
      expect(Math.max(...breaks)).toBeLessThanOrEqual(10);
      expect(text).toContain('light-headed');
      expect(reply.response.shouldEndSession).toBe(true);
    }
  });

  it('asks what time when a reminder has none', async () => {
    const { deps } = fakeDeps();
    const reply: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name: 'ReminderIntent', slots: { time: { name: 'time' } } } }), deps);
    expect(ssml(reply)).toContain('What time each day?');
    expect(reply.response.shouldEndSession).toBe(false);
  });

  it('asks for permission by voice first, carrying the time', async () => {
    const { deps, calls } = fakeDeps();
    const reply: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name: 'ReminderIntent', slots: { time: { value: 'EV' } } } }), deps);
    expect(calls.reminders).toEqual([]);
    expect(reply.response.outputSpeech).toBeUndefined();
    expect(reply.response.shouldEndSession).toBeUndefined();
    expect(reply.response.directives).toEqual([
      expect.objectContaining({
        type: 'Connections.SendRequest',
        name: 'AskFor',
        token: '19:00',
        payload: expect.objectContaining({ permissionScopes: [{ permissionScope: REMINDERS_SCOPE, consentLevel: 'ACCOUNT' }] }),
      }),
    ]);
  });

  it('sets a daily reminder once permission is given', async () => {
    const { deps, calls } = fakeDeps();
    const granted: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name: 'ReminderIntent', slots: { time: { value: '07:30' } } } }, { granted: true }), deps);
    expect(ssml(granted)).toContain('every day at 7:30 a.m.');
    const answered: any = await handleAlexa(alexaBody({ type: 'Connections.Response', name: 'AskFor', payload: { status: 'ACCEPTED' }, token: '19:00' }), deps);
    expect(ssml(answered)).toContain('every day at 7 p.m.');
    expect(calls.reminders).toHaveLength(2);
    expect((calls.reminders[1] as any).trigger.recurrence.recurrenceRules).toEqual(['FREQ=DAILY;BYHOUR=19;BYMINUTE=0;BYSECOND=0;INTERVAL=1']);
  });

  it('accepts a no to permission, and a failed reminder, gracefully', async () => {
    const { deps } = fakeDeps({ createReminder: async () => 500 });
    const declined: any = await handleAlexa(alexaBody({ type: 'Connections.Response', name: 'AskFor', payload: { status: 'DENIED' }, token: '19:00' }), deps);
    expect(ssml(declined)).toContain('allow reminders for Prana Veda in the Alexa app');
    const failed: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name: 'ReminderIntent', slots: { time: { value: '19:00' } } } }, { granted: true }), deps);
    expect(ssml(failed)).toContain("couldn't set the reminder");
  });

  it('asks again by voice if Amazon says permission was withdrawn', async () => {
    const { deps } = fakeDeps({ createReminder: async () => 401 });
    const reply: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name: 'ReminderIntent', slots: { time: { value: '19:00' } } } }, { granted: true }), deps);
    expect(reply.response.directives[0].type).toBe('Connections.SendRequest');
  });

  it('helps, stops, and ends quietly', async () => {
    const { deps } = fakeDeps();
    const help: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name: 'AMAZON.HelpIntent' } }), deps);
    expect(help.response.shouldEndSession).toBe(false);
    for (const name of ['AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NoIntent']) {
      const reply: any = await handleAlexa(alexaBody({ type: 'IntentRequest', intent: { name } }), deps);
      expect(ssml(reply)).toContain('Be well.');
      expect(reply.response.shouldEndSession).toBe(true);
    }
    expect(await handleAlexa(alexaBody({ type: 'SessionEndedRequest' }), deps)).toEqual({ version: '1.0', response: {} });
  });
});

describe('pieces', () => {
  it('reads AMAZON.TIME values', () => {
    expect(reminderTime('19:00')).toBe('19:00');
    expect(reminderTime('EV')).toBe('19:00');
    expect(reminderTime('MO')).toBe('07:00');
    expect(reminderTime('25:00')).toBeUndefined();
    expect(reminderTime('2026-10-29')).toBeUndefined();
    expect(spokenTime('00:15')).toBe('12:15 a.m.');
    expect(spokenTime('12:00')).toBe('12 p.m.');
  });

  it("sets the reminder in the Echo's own time zone", () => {
    const body = reminderRequest('19:00', NOW) as any;
    expect(body.trigger.timeZoneId).toBeUndefined();
    expect(body.trigger.recurrence.startDateTime).toBe('2026-10-29T00:00:00.000');
    expect(body.alertInfo.spokenInfo.content[0].text).toContain('ask Prana Veda');
  });

  it('works out the part of the day where the Echo is', () => {
    expect(partOfDay(NOW, 'Asia/Kolkata')).toEqual({ date: '2026-10-30', part: 'morning' });
    expect(partOfDay(NOW, 'America/New_York')).toEqual({ date: '2026-10-29', part: 'afternoon' });
    expect(partOfDay(NOW, 'Not/AZone')).toEqual({ date: '2026-10-29' });
  });

  it('greets by first name for the part of the day', () => {
    expect(greeting('Hetan Shah', 'morning')).toBe('Good morning, Hetan.');
    expect(greeting(null, 'evening')).toBe('Good evening.');
    expect(greeting('Hetan', undefined)).toBe('Hello, Hetan.');
    expect(greeting('  ', undefined)).toBe('Hello.');
  });

  it('says how much open time there is, from busy times in the person\'s zone', () => {
    const zone = 'America/Los_Angeles';
    const at = (hhmm: string) => Date.parse(`2026-10-29T${hhmm}:00-07:00`);
    const now = NOW.getTime(); // noon
    expect(freeTimeLine([[at('12:40'), at('13:30')]], now, zone)).toBe('You have 40 open minutes, until 12:40 PM.');
    expect(freeTimeLine([[at('15:00'), at('16:00')]], now, zone)).toBe("You're free until 3:00 PM.");
    expect(freeTimeLine([[at('12:05'), at('13:00')]], now, zone)).toBe('Your next commitment is at 12:05 PM.');
    expect(freeTimeLine([[at('11:30'), at('12:30')], [at('12:30'), at('13:15')]], now, zone)).toBe('Your calendar is busy until 1:15 PM.');
    expect(freeTimeLine([], now, zone)).toBe('Your calendar is open for the rest of today.');
    expect(freeTimeLine([[at('11:00'), at('11:30')]], now, zone)).toBe('Your calendar is open for the rest of today.');
    expect(freeTimeLine(null, now, zone)).toBeUndefined();
  });

  it('says when the person last practised, in their own days', () => {
    const zone = 'America/Los_Angeles';
    const now = NOW.getTime(); // Thursday noon
    const day = 24 * 60 * 60 * 1000;
    expect(historyLine(now - 2 * 60 * 60 * 1000, 1, now, zone)).toBe('You practised earlier today.');
    expect(historyLine(now - day, 3, now, zone)).toBe('You last practised yesterday, and 3 times this past week.');
    expect(historyLine(now - 3 * day, 1, now, zone)).toBe('You last practised on Monday.');
    expect(historyLine(now - 10 * day, 0, now, zone)).toBe("It's been a little while since your last practice. A gentle return is always welcome.");
    expect(historyLine(null, 0, now, zone)).toBe('Your first practice is waiting whenever you are ready.');
  });

  it('keeps health words out of what a speaker says', () => {
    expect(speakerSafe('Let the evening settle gently around you.')).toBe(true);
    expect(speakerSafe('This will ease your anxiety.')).toBe(false);
    expect(speakerSafe('A practice to treat tension.')).toBe(false);
  });
});
