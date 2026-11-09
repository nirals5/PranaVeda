// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlexaLinkPage from '../src/components/AlexaLinkPage';

// /link/alexa: where the Alexa app sends someone to link their account. They
// sign in if needed, see what Alexa will be able to say, and choose.

const SEARCH = '?response_type=code&client_id=alexa-skill&redirect_uri=https%3A%2F%2Fpitangui.amazon.com%2Fapi%2Fskill%2Flink%2FM2AAAAAAAAAAAA&state=st&scope=nudges';
const signedIn = { status: 'user' as const, user: { displayName: 'Hetan Shah' } };

describe('Linking Alexa (website)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('asks a signed-out person to sign in first', () => {
    render(createElement(AlexaLinkPage, { auth: { status: 'guest' as const, user: null }, search: SEARCH, go: vi.fn(), signIn: createElement('p', null, 'sign-in buttons') }));
    expect(screen.getByText(/sign in to link/i)).toBeTruthy();
    expect(screen.getByText('sign-in buttons')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /allow/i })).toBeNull();
  });

  it('says what Alexa will say aloud, and sends Amazon the answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ redirect: 'https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA?code=c&state=st' })));
    vi.stubGlobal('fetch', fetchMock);
    const go = vi.fn();
    render(createElement(AlexaLinkPage, { auth: signedIn, search: SEARCH, go }));
    expect(screen.getByText(/your first name, your open time and when you last practised/i)).toBeTruthy();
    expect(screen.getByText(/anyone in the room/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /allow/i }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('https://pitangui.amazon.com/api/skill/link/M2AAAAAAAAAAAA?code=c&state=st'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/oauth/authorize');
    expect(JSON.parse(String(init.body))).toMatchObject({ client_id: 'alexa-skill', state: 'st', scope: 'nudges', decision: 'allow' });
  });

  it('sends "not now" back as a refusal', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ redirect: 'https://pitangui.amazon.com/x?error=access_denied' })));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(AlexaLinkPage, { auth: signedIn, search: SEARCH, go: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).decision).toBe('deny');
  });

  it('explains when the request cannot be used', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_redirect_uri' }), { status: 400 })));
    render(createElement(AlexaLinkPage, { auth: signedIn, search: SEARCH, go: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: /allow/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
