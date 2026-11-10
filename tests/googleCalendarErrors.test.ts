import { describe, expect, it } from 'vitest';
import { googleRefusal } from '../src/hooks/useExternalCalendar';

// When Google refuses the busy-times request, the person is told why: a lapse
// asks for Reconnect, anything else names the real cause. KAN-26 found the
// Calendar API switched off reported as "Google did not grant calendar access".

const google = (status: number, reason: string, detail?: string) => ({
  status,
  body: { error: { code: status, message: 'm', errors: [{ reason }], details: detail ? [{ reason: detail }] : [] } },
});

describe('a refused busy-times request', () => {
  it('is a lapse when the token is no longer accepted', () => {
    expect(googleRefusal(401, { error: { errors: [{ reason: 'authError' }] } })).toBe('lapsed');
    expect(googleRefusal(401, null)).toBe('lapsed');
  });

  it('names the Calendar API being switched off for the project', () => {
    const { status, body } = google(403, 'accessNotConfigured', 'SERVICE_DISABLED');
    expect(googleRefusal(status, body)).toMatch(/Google Calendar API is not enabled/);
  });

  it('says calendar access was not ticked on Google’s screen', () => {
    const { status, body } = google(403, 'insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT');
    expect(googleRefusal(status, body)).toMatch(/free\/busy/);
  });

  it('asks to try later when Google is limiting requests', () => {
    expect(googleRefusal(403, google(403, 'rateLimitExceeded').body)).toMatch(/try again/i);
    expect(googleRefusal(429, null)).toMatch(/try again/i);
  });

  it('treats any other refusal as a lapse, so Reconnect is offered', () => {
    expect(googleRefusal(403, null)).toBe('lapsed');
  });
});
