import ICAL from 'ical.js';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Reading a private iCal link as busy intervals. Used by /api/calendar/ics
// (the website reading its link) and by push nudges (the server re-reading a
// link kept on the account). Event details are dropped here.

// The URL is user-supplied, so refuse anything that isn't a public https host
// (no loopback, private ranges, or cloud metadata addresses).
const privateRanges = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) privateRanges.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
  privateRanges.addSubnet(net, bits, 'ipv6');
}

function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address;
  const family = isIP(mapped);
  if (!family) return true;
  return privateRanges.check(mapped, family === 4 ? 'ipv4' : 'ipv6');
}

export class CalendarLinkError extends Error {}

async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:/i, 'https:'));
  } catch {
    throw new CalendarLinkError('That does not look like a calendar link.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CalendarLinkError('Calendar links must start with https:// or webcal://.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new CalendarLinkError('That calendar link cannot be reached.');
  }
  return url;
}

const ICS_MAX_BYTES = 5 * 1024 * 1024;

export async function fetchCalendarText(raw: string): Promise<string> {
  let url = await assertPublicHttps(raw);
  // Redirects are followed by hand so every hop is re-checked.
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'text/calendar, text/plain;q=0.8' },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = await assertPublicHttps(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new CalendarLinkError('The calendar link did not respond. Check that it is still active.');
    const body = await response.arrayBuffer();
    if (body.byteLength > ICS_MAX_BYTES) throw new CalendarLinkError('That calendar is too large to read.');
    return new TextDecoder().decode(body);
  }
  throw new CalendarLinkError('That calendar link cannot be reached.');
}

// Expand a calendar feed into the timed, busy-marked occurrences that overlap
// [from, to). All-day entries (holidays, birthdays), cancelled events, and
// events marked "free" do not count as busy.
export function icsBusyIntervals(text: string, from: Date, to: Date): { start: string; end: string }[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(vtz);

  const blocks = (ve: ICAL.Component) =>
    String(ve.getFirstPropertyValue('status') ?? '').toUpperCase() !== 'CANCELLED' &&
    String(ve.getFirstPropertyValue('transp') ?? '').toUpperCase() !== 'TRANSPARENT';

  const spans: [number, number][] = [];
  const add = (ve: ICAL.Component, start: ICAL.Time, end: ICAL.Time) => {
    if (start.isDate || !blocks(ve)) return;
    const s = start.toJSDate().getTime();
    const e = end.toJSDate().getTime();
    if (e > from.getTime() && s < to.getTime() && e > s) spans.push([s, e]);
  };

  const vevents = root.getAllSubcomponents('vevent');
  const uidOf = (ve: ICAL.Component) => String(ve.getFirstPropertyValue('uid') ?? '');
  const masters = vevents.filter((ve) => !ve.hasProperty('recurrence-id'));
  const masterUids = new Set(masters.map(uidOf));
  const overrides = new Map<string, ICAL.Component[]>();
  for (const ve of vevents) {
    if (!ve.hasProperty('recurrence-id')) continue;
    if (!masterUids.has(uidOf(ve))) {
      // A moved occurrence whose series isn't in the feed: treat as one event.
      const lone = new ICAL.Event(ve);
      add(ve, lone.startDate, lone.endDate);
      continue;
    }
    overrides.set(uidOf(ve), [...(overrides.get(uidOf(ve)) ?? []), ve]);
  }

  for (const ve of masters) {
    const event = new ICAL.Event(ve, { exceptions: overrides.get(uidOf(ve)) ?? [], strictExceptions: true });
    if (!event.startDate || event.startDate.isDate) continue;
    if (!event.isRecurring()) {
      add(ve, event.startDate, event.endDate);
      continue;
    }
    // The iterator always walks from the series start; the cap bounds
    // pathological rules (e.g. minutely) rather than normal long-lived series.
    const iterator = event.iterator();
    for (let i = 0, next = iterator.next(); next && i < 20000; i++, next = iterator.next()) {
      const occurrence = event.getOccurrenceDetails(next);
      if (occurrence.startDate.toJSDate().getTime() >= to.getTime()) break;
      add(occurrence.item.component, occurrence.startDate, occurrence.endDate);
    }
  }

  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged.map(([s, e]) => ({ start: new Date(s).toISOString(), end: new Date(e).toISOString() }));
}
