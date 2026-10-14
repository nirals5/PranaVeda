import { first } from './auth.js';
import type { RequestLike } from './auth.js';

// What kind of device a session is on. Deliberately coarse: enough to answer
// "which platforms do people use", nothing that could single out one device.

export interface DeviceInfo {
  deviceClass: 'desktop' | 'phone' | 'tablet' | 'speaker' | null;
  os: string | null;
  osVersion: string | null; // major version only
  browser: string | null;
  deviceModel: string | null;
  appVersion: string | null;
}

const major = (version: string | undefined) => version?.split(/[._]/)[0] || null;

// Web: read from the browser's User-Agent. Known limit: Safari on iPad reports
// itself as a Mac, so iPads on the web are counted as desktop macOS.
export function deviceFromUserAgent(req: RequestLike): DeviceInfo {
  const ua = first(req.headers['user-agent']) ?? '';
  let os: string | null = null;
  let osVersion: string | null = null;
  let m: RegExpExecArray | null;

  if ((m = /(?:iPhone|iPad|iPod).*? OS (\d+[_\d]*)/.exec(ua))) [os, osVersion] = ['iOS', major(m[1])];
  else if ((m = /Android (\d+[.\d]*)/.exec(ua))) [os, osVersion] = ['Android', major(m[1])];
  else if ((m = /Windows NT (\d+[.\d]*)/.exec(ua))) [os, osVersion] = ['Windows', major(m[1])];
  else if ((m = /Mac OS X (\d+[_.\d]*)/.exec(ua))) [os, osVersion] = ['macOS', major(m[1])];
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const deviceClass = !ua
    ? null
    : /iPad|Tablet|Android(?!.*Mobile)/.test(ua)
      ? 'tablet'
      : /Mobi|iPhone|iPod|Android/.test(ua)
        ? 'phone'
        : 'desktop';

  // Order matters: most browsers also claim to be Chrome and Safari.
  const browser = !ua
    ? null
    : /Edg(?:e|A|iOS)?\//.test(ua)
      ? 'Edge'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'Firefox'
          : /OPR\//.test(ua)
            ? 'Opera'
            : /Chrome\/|CriOS\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Other';

  return { deviceClass, os, osVersion, browser, deviceModel: null, appVersion: null };
}

const label = (value: unknown) =>
  typeof value === 'string' && /^[\w .,()+-]{1,64}$/.test(value.trim()) ? value.trim() : null;

// Native apps describe themselves; nothing they send is trusted beyond being a
// short plain label.
export function deviceFromClient(raw: any, client: 'ios' | 'android'): DeviceInfo {
  const deviceClass = raw?.deviceClass === 'tablet' ? 'tablet' : raw?.deviceClass === 'phone' ? 'phone' : null;
  return {
    deviceClass,
    os: client === 'ios' ? 'iOS' : 'Android',
    osVersion: major(label(raw?.osVersion) ?? undefined),
    browser: null,
    deviceModel: label(raw?.deviceModel),
    appVersion: label(raw?.appVersion),
  };
}
