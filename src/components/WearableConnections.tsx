import React from 'react';
import { Heart, Watch } from 'lucide-react';
import { HeartRateMonitor } from '../hooks/useHeartRateMonitor';
import { WearableHealth } from '../hooks/useWearableHealth';

const actionButton =
  'flex-shrink-0 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default';
const primaryAction = `${actionButton} bg-[#8A79A5] hover:bg-[#72618F] text-white`;
const quietAction = `${actionButton} text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70`;

const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

// Two ways a wearable reaches PranaVeda: a nearby Bluetooth heart-rate device
// (live readings during practice) and a Google Health sign-in (daily sleep,
// resting heart rate and HRV from Fitbit and Pixel devices).
export default function WearableConnections({ heart, health }: { heart: HeartRateMonitor; health: WearableHealth }) {
  const latest = [...health.days].reverse();
  const lastSleep = latest.find((d) => d.sleepMinutes)?.sleepMinutes;
  const lastResting = latest.find((d) => d.restingHeartRate)?.restingHeartRate;
  const lastHrv = latest.find((d) => d.hrv)?.hrv;
  const healthSummary = [
    lastSleep && `Sleep ${hoursLabel(lastSleep)}`,
    lastResting && `Resting ${lastResting} bpm`,
    lastHrv && `HRV ${lastHrv} ms`,
  ].filter(Boolean);

  return (
    <section
      aria-label="Wearables"
      className="bg-white/50 border border-white/30 p-6 sm:p-8 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <Watch className="w-4 h-4 text-[#8A79A5]" />
        <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Wearables</span>
      </div>
      <h2 className="text-2xl font-serif text-[#2D3436] mt-2">Let your body inform the practice</h2>
      <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed mt-2 max-w-2xl">
        Readings stay on this device and are shared with Amrita only as a short summary when you talk with her. They are
        wellness signals, not medical measurements.
      </p>

      <ul className="mt-5 divide-y divide-stone-200/50">
        {/* Nearby Bluetooth device */}
        <li className="py-5 first:pt-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[17px] font-serif text-[#2D3436] leading-snug">Nearby heart-rate device</p>
            <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
              {!heart.supported
                ? 'This browser cannot use Bluetooth. Open PranaVeda in Chrome or Edge on a computer or Android phone.'
                : heart.status === 'connected'
                  ? `Connected to ${heart.deviceName}. Your heart rate will show during practice and be saved with it.`
                  : heart.status === 'connecting'
                    ? 'Choose your device in the browser’s list…'
                    : 'A chest strap, arm band, or a watch set to broadcast heart rate. Put it on, then search — your browser will list what is in range.'}
            </p>
            {heart.status === 'connected' && (
              <p aria-live="polite" className="flex items-center gap-2 text-[15px] font-sans text-[#2D3436] pt-1">
                <Heart className="w-4 h-4 text-[#8A79A5]" aria-hidden="true" />
                {heart.bpm ? `${heart.bpm} bpm` : 'Waiting for a reading…'}
                {heart.hrv && <span className="text-stone-600">· HRV {heart.hrv} ms</span>}
              </p>
            )}
            {heart.error && <p role="alert" className="text-[13px] text-[#B4443A] font-sans">{heart.error}</p>}
          </div>
          {heart.supported &&
            (heart.status === 'connected' ? (
              <button type="button" onClick={heart.disconnect} className={quietAction}>
                Disconnect
              </button>
            ) : (
              <button type="button" onClick={heart.connect} disabled={heart.status === 'connecting'} className={primaryAction}>
                {heart.status === 'connecting' ? 'Searching…' : heart.deviceName ? 'Reconnect' : 'Find nearby devices'}
              </button>
            ))}
        </li>

        {/* Google Health */}
        <li className="py-5 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[17px] font-serif text-[#2D3436] leading-snug">Google Health</p>
            <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
              {!health.configured
                ? 'Not set up yet for this site.'
                : health.needsReconnect
                  ? 'Access has lapsed — Google asks you to confirm about once an hour. Your saved readings remain; reconnect to refresh them.'
                  : health.connected
                    ? 'Connected. Reading sleep, resting heart rate and HRV, read-only.'
                    : 'For Fitbit and Pixel Watch: sign in with Google to bring in your sleep, resting heart rate and HRV.'}
            </p>
            {health.connected && healthSummary.length > 0 && (
              <p className="text-[15px] font-sans text-[#2D3436] pt-1">Latest: {healthSummary.join(' · ')}</p>
            )}
            {health.connected && !health.needsReconnect && healthSummary.length === 0 && (
              <p className="text-[13.5px] font-sans text-stone-600 pt-1">No readings from the last two weeks were found in this Google account.</p>
            )}
            {health.error && <p role="alert" className="text-[13px] text-[#B4443A] font-sans">{health.error}</p>}
          </div>
          {health.configured && (
            <div className="flex items-center gap-2">
              {(!health.connected || health.needsReconnect) && (
                <button type="button" onClick={health.connect} disabled={health.pending} className={primaryAction}>
                  {health.pending ? 'Connecting…' : health.connected ? 'Reconnect' : 'Connect'}
                </button>
              )}
              {health.connected && (
                <button type="button" onClick={health.disconnect} className={quietAction}>
                  Disconnect
                </button>
              )}
            </div>
          )}
        </li>
      </ul>
    </section>
  );
}
