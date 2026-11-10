// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import CalendarConnections from '../src/components/CalendarConnections';

// KAN-27: Google's browser sign-in lapses about every hour. The calendar card
// steers people to their calendar's private link, which does not, and shows
// how to find it.

const calendar = (over: Record<string, unknown> = {}) =>
  ({
    connected: false,
    busy: [],
    now: Date.parse('2026-11-10T20:00:00Z'),
    googleConfigured: true,
    googleConnected: false,
    googleNeedsReconnect: false,
    icsConnected: false,
    errors: {},
    pending: null,
    connectGoogle: () => {},
    disconnectGoogle: () => {},
    connectIcs: async () => true,
    disconnectIcs: () => {},
    ...over,
  }) as any;
const notifications = { supported: true, blocked: false, enabled: false, enable: () => {}, disable: () => {} } as any;
const push = { available: false, enabled: false, blocked: false, needsHomeScreen: false, offerSignIn: false, pending: false, error: null, enable: () => {}, disable: () => {} } as any;
const show = (over: Record<string, unknown>) => render(createElement(CalendarConnections, { calendar: calendar(over), notifications, push }));

describe('Google Calendar lapses hourly; the private link does not', () => {
  afterEach(cleanup);

  it('points a connected Google calendar to the private link for no interruptions', () => {
    show({ connected: true, googleConnected: true });
    const row = screen.getByText(/Connected\. Reading busy times only\./);
    expect(row.textContent).toMatch(/about once an hour/);
    expect(row.textContent).toMatch(/private link/);
  });

  it('offers the private link when Google has lapsed', () => {
    show({ connected: true, googleConnected: true, googleNeedsReconnect: true });
    expect(screen.getByText(/Access has lapsed/).textContent).toMatch(/private link below, which does not lapse/);
  });

  it('says nothing more once the private link is connected too', () => {
    show({ connected: true, googleConnected: true, icsConnected: true });
    expect(screen.getAllByText(/Connected\. Reading busy times only\./)[0].textContent).not.toMatch(/once an hour/);
    expect(screen.queryByText(/How to find your private link/)).toBeNull();
  });

  it('shows where to find the private link in Google, Apple and Outlook, and that it must stay private', () => {
    show({});
    fireEvent.click(screen.getByText(/How to find your private link/));
    const help = screen.getByRole('region', { name: /find your private link/i });
    expect(help.textContent).toMatch(/Integrate calendar/);
    expect(help.textContent).toMatch(/Secret address in iCal format/);
    expect(help.textContent).toMatch(/iCloud/);
    expect(help.textContent).toMatch(/Outlook/);
    expect(help.textContent).toMatch(/anyone with the link/i);
  });
});
