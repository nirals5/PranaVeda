// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantsSettings from '../src/components/AssistantsSettings';

// On the website the Smart assistants card is Alexa's: Siri and the phone
// shortcuts live in the apps. So it appears only once the skill is published.

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe('Smart assistants card (website)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows nothing until the Alexa skill is published', async () => {
    const fetchMock = reply({ alexa: null });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(createElement(AssistantsSettings));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/assistants'));
    expect(container.innerHTML).toBe('');
  });

  it('lists what to say to Alexa and links to the skill once published', async () => {
    vi.stubGlobal('fetch', reply({ alexa: { url: 'https://www.amazon.com/dp/B0EXAMPLE1', phrases: ['Alexa, open Prana Veda'] } }));
    render(createElement(AssistantsSettings));
    const link = await screen.findByRole('link', { name: /enable in the alexa app/i });
    expect(link.getAttribute('href')).toBe('https://www.amazon.com/dp/B0EXAMPLE1');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText(/Alexa, open Prana Veda/)).toBeTruthy();
  });

  it('stays hidden when the server cannot be reached', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(createElement(AssistantsSettings));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('says when Alexa is linked to this account, and can end the link', async () => {
    vi.stubGlobal('fetch', reply({ alexa: null }));
    const unlink = vi.fn(async () => true);
    render(createElement(AssistantsSettings, { alexaLink: { linked: true, notifications: true, pending: false, unlink } }));
    expect(await screen.findByText(/linked to this account/i)).toBeTruthy();
    expect(screen.getByText(/notifications are on/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /unlink/i }));
    expect(unlink).toHaveBeenCalled();
  });

  it('does not mention linking when Alexa is not linked', async () => {
    vi.stubGlobal('fetch', reply({ alexa: { url: 'https://www.amazon.com/dp/B0EXAMPLE1', phrases: ['Alexa, open Prana Veda'] } }));
    render(createElement(AssistantsSettings, { alexaLink: { linked: false, notifications: false, pending: false, unlink: async () => true } }));
    await screen.findByRole('link', { name: /enable in the alexa app/i });
    expect(screen.queryByRole('button', { name: /unlink/i })).toBeNull();
  });
});
