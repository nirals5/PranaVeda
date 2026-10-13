import { useCallback, useEffect, useRef, useState } from 'react';
import { HeartSummary } from '../types';

// Live heart rate from a nearby Bluetooth device, via Web Bluetooth and the
// standard Heart Rate service (chest straps, arm bands, and watches put into
// "broadcast heart rate" mode). The browser — not the page — finds devices:
// connecting always starts from a click that opens its device chooser.
// Readings are wellness signals, not medical measurements.

const DEVICE_NAME_KEY = 'pranaveda_hr_device';
const RR_WINDOW = 60; // beat intervals kept for the live HRV reading
const MIN_SESSION_SAMPLES = 10;

const bluetooth = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;

// Heart Rate Measurement characteristic (0x2A37).
export function parseHeartRateMeasurement(view: DataView): { bpm: number; rrMs: number[] } {
  const flags = view.getUint8(0);
  let offset = 1;
  const bpm = flags & 0x01 ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += flags & 0x01 ? 2 : 1;
  if (flags & 0x08) offset += 2; // energy expended
  const rrMs: number[] = [];
  if (flags & 0x10) {
    for (; offset + 1 < view.byteLength; offset += 2) rrMs.push((view.getUint16(offset, true) / 1024) * 1000);
  }
  return { bpm, rrMs };
}

// RMSSD — the standard short-term HRV figure — over plausible beat intervals.
// Pairs that jump by more than a quarter are sensor artifacts, not heartbeats.
export function rmssd(rrMs: number[]): number | null {
  const clean = rrMs.filter((rr) => rr >= 300 && rr <= 2000);
  const squares: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    const diff = clean[i] - clean[i - 1];
    if (Math.abs(diff) <= clean[i - 1] * 0.25) squares.push(diff * diff);
  }
  if (squares.length < 20) return null;
  return Math.round(Math.sqrt(squares.reduce((a, b) => a + b, 0) / squares.length));
}

// Start and end are the opening and closing fifths of the session, so one
// stray reading cannot define either.
export function summarizeSession(bpms: number[], rrMs: number[]): HeartSummary | null {
  if (bpms.length < MIN_SESSION_SAMPLES) return null;
  const mean = (list: number[]) => Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  const edge = Math.max(3, Math.floor(bpms.length / 5));
  return {
    startBpm: mean(bpms.slice(0, edge)),
    endBpm: mean(bpms.slice(-edge)),
    avgBpm: mean(bpms),
    minBpm: Math.min(...bpms),
    maxBpm: Math.max(...bpms),
    rmssd: rmssd(rrMs) ?? undefined,
  };
}

export function useHeartRateMonitor() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [deviceName, setDeviceName] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DEVICE_NAME_KEY);
    } catch {
      return null;
    }
  });
  const [bpm, setBpm] = useState<number | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<any>(null);
  const rrRef = useRef<number[]>([]);
  const sessionRef = useRef<{ bpms: number[]; rrMs: number[] } | null>(null);

  const onMeasurement = useCallback((event: any) => {
    const { bpm: value, rrMs } = parseHeartRateMeasurement(event.target.value);
    if (value < 25 || value > 240) return; // no skin contact yet, or noise
    setBpm(value);
    rrRef.current = [...rrRef.current, ...rrMs].slice(-RR_WINDOW);
    setHrv(rmssd(rrRef.current));
    if (sessionRef.current) {
      sessionRef.current.bpms.push(value);
      sessionRef.current.rrMs.push(...rrMs);
    }
  }, []);

  const subscribe = useCallback(
    async (device: any) => {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      characteristic.addEventListener('characteristicvaluechanged', onMeasurement);
      await characteristic.startNotifications();
    },
    [onMeasurement]
  );

  const onDisconnected = useCallback(() => {
    setStatus('idle');
    setBpm(null);
    setHrv(null);
    rrRef.current = [];
  }, []);

  const attach = useCallback(
    async (device: any) => {
      deviceRef.current?.removeEventListener('gattserverdisconnected', onDisconnected);
      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', onDisconnected);
      await subscribe(device);
      const name = device.name || 'Heart-rate device';
      setDeviceName(name);
      try {
        localStorage.setItem(DEVICE_NAME_KEY, name);
      } catch {}
      setStatus('connected');
    },
    [subscribe, onDisconnected]
  );

  // Must be called from a click: opens the browser's nearby-device chooser.
  const connect = useCallback(async () => {
    if (!bluetooth) return;
    setError(null);
    setStatus('connecting');
    try {
      const device = await bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      await attach(device);
    } catch (err: any) {
      setStatus('idle');
      // Closing the chooser without picking is not an error worth showing.
      if (err?.name !== 'NotFoundError') setError('That device could not be connected. Check it is on, worn, and not connected to another app.');
    }
  }, [attach]);

  const disconnect = useCallback(() => {
    const device = deviceRef.current;
    deviceRef.current = null;
    device?.removeEventListener('gattserverdisconnected', onDisconnected);
    if (device?.gatt?.connected) device.gatt.disconnect();
    onDisconnected();
    setDeviceName(null);
    try {
      localStorage.removeItem(DEVICE_NAME_KEY);
    } catch {}
  }, [onDisconnected]);

  // Best effort: where the browser lets a page see devices it was already
  // allowed to use (experimental in Chrome), reconnect when one is in range.
  useEffect(() => {
    if (!bluetooth?.getDevices || !deviceName) return;
    let cancelled = false;
    bluetooth
      .getDevices()
      .then(async (devices: any[]) => {
        for (const device of devices) {
          if (cancelled || deviceRef.current) return;
          try {
            await attach(device);
            return;
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    },
    []
  );

  // A practice brackets its readings: startSession when it begins, endSession
  // when it finishes (null if the device was not connected long enough).
  const startSession = useCallback(() => {
    sessionRef.current = { bpms: [], rrMs: [] };
  }, []);

  const endSession = useCallback((): HeartSummary | null => {
    const session = sessionRef.current;
    sessionRef.current = null;
    return session ? summarizeSession(session.bpms, session.rrMs) : null;
  }, []);

  return {
    supported: !!bluetooth,
    status,
    deviceName,
    bpm,
    hrv,
    error,
    connect,
    disconnect,
    startSession,
    endSession,
  };
}

export type HeartRateMonitor = ReturnType<typeof useHeartRateMonitor>;
