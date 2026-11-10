import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// KAN-30: the old Vercel addresses send everyone to pranaveda.app, keeping
// the path, with a permanent (308) redirect. Only those hosts: preview links
// and pranaveda.app itself are untouched.

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const redirects: any[] = config.redirects ?? [];
const oldHosts = ['pranaveda-five.vercel.app', 'v0-pranaveda.vercel.app'];
const hostOf = (rule: any) => rule.has?.find((h: any) => h.type === 'host')?.value;

describe('the old addresses redirect to pranaveda.app', () => {
  it.each(oldHosts)('sends every path on %s to the same path on pranaveda.app, permanently', (host) => {
    const rule = redirects.find((r) => hostOf(r) === host);
    expect(rule).toBeDefined();
    expect(rule.source).toBe('/:path*');
    expect(rule.destination).toBe('https://pranaveda.app/:path*');
    expect(rule.permanent).toBe(true);
  });

  it('redirects nothing else', () => {
    for (const rule of redirects) expect(oldHosts).toContain(hostOf(rule));
  });
});
