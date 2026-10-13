import React, { useState } from 'react';
import { CalendarClock, Link2 } from 'lucide-react';
import { ExternalCalendar, describeCalendar } from '../hooks/useExternalCalendar';
import { NudgeNotifications } from '../hooks/useNudgeNotifications';

const actionButton =
  'flex-shrink-0 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default';
const primaryAction = `${actionButton} bg-[#8A79A5] hover:bg-[#72618F] text-white`;
const quietAction = `${actionButton} text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70`;

// Connect an outside calendar so Amrita knows when the user is free. Only
// busy times are ever read — the copy says so, because it is the whole promise.
export default function CalendarConnections({ calendar, notifications }: { calendar: ExternalCalendar; notifications: NudgeNotifications }) {
  const [link, setLink] = useState('');
  const summary = calendar.connected ? describeCalendar(calendar.busy, calendar.now) : null;

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await calendar.connectIcs(link)) setLink('');
  };

  return (
    <section
      aria-label="Outside calendars"
      className="bg-white/50 border border-white/30 p-6 sm:p-8 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-[#8A79A5]" />
        <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Your free time</span>
      </div>
      <h2 className="text-2xl font-serif text-[#2D3436] mt-2">Let Amrita work around your day</h2>
      <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed mt-2 max-w-2xl">
        Connect a calendar and Amrita will suggest practice only in your open time. She sees when you are busy, never
        what your events are, and nothing is stored outside this device.
      </p>

      {summary && (
        <p aria-live="polite" className="mt-4 text-[15px] font-serif italic text-stone-700 leading-relaxed">
          {summary.now}.{' '}
          {summary.busyToday.length > 0 && <span className="not-italic font-sans text-[13.5px] text-stone-600">Busy today: {summary.busyToday.join(', ')}.</span>}
        </p>
      )}

      <ul className="mt-5 divide-y divide-stone-200/50">
        {/* Google sign-in */}
        <li className="py-5 first:pt-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[17px] font-serif text-[#2D3436] leading-snug">Google Calendar</p>
            <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
              {!calendar.googleConfigured
                ? 'Not set up yet for this site.'
                : calendar.googleNeedsReconnect
                  ? 'Access has lapsed — Google asks you to confirm about once an hour. Amrita is paused until you reconnect.'
                  : calendar.googleConnected
                    ? 'Connected. Reading busy times only.'
                    : 'Sign in with Google and allow read-only access to your busy times.'}
            </p>
            {calendar.errors.google && <p role="alert" className="text-[13px] text-[#B4443A] font-sans">{calendar.errors.google}</p>}
          </div>
          {calendar.googleConfigured && (
            <div className="flex items-center gap-2">
              {(!calendar.googleConnected || calendar.googleNeedsReconnect) && (
                <button type="button" onClick={calendar.connectGoogle} disabled={calendar.pending === 'google'} className={primaryAction}>
                  {calendar.pending === 'google' ? 'Connecting…' : calendar.googleConnected ? 'Reconnect' : 'Connect'}
                </button>
              )}
              {calendar.googleConnected && (
                <button type="button" onClick={calendar.disconnectGoogle} className={quietAction}>
                  Disconnect
                </button>
              )}
            </div>
          )}
        </li>

        {/* Private iCal link */}
        <li className="py-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[17px] font-serif text-[#2D3436] leading-snug">Private calendar link</p>
              <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
                {calendar.icsConnected
                  ? 'Connected. Reading busy times only.'
                  : 'For Apple iCloud, Outlook, or Google: paste the private iCal address from your calendar’s sharing settings.'}
              </p>
            </div>
            {calendar.icsConnected && (
              <button type="button" onClick={calendar.disconnectIcs} className={quietAction}>
                Disconnect
              </button>
            )}
          </div>
          {!calendar.icsConnected && (
            <form onSubmit={submitLink} className="flex flex-col sm:flex-row gap-2">
              <label className="flex-1 flex items-center gap-2 bg-white/60 border border-white/80 rounded-full px-4 py-2 focus-within:border-[#8A79A5]/40">
                <Link2 className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                <span className="sr-only">Private calendar link</span>
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://… or webcal://…"
                  className="flex-1 min-w-0 bg-transparent text-[14px] font-sans text-[#2D3436] placeholder:text-stone-500 focus:outline-none"
                />
              </label>
              <button type="submit" disabled={!link.trim() || calendar.pending === 'ics'} className={primaryAction}>
                {calendar.pending === 'ics' ? 'Checking…' : 'Connect'}
              </button>
            </form>
          )}
          {calendar.errors.ics && <p role="alert" className="text-[13px] text-[#B4443A] font-sans">{calendar.errors.ics}</p>}
        </li>

        {/* Browser notifications */}
        <li className="py-5 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[17px] font-serif text-[#2D3436] leading-snug">Notifications</p>
            <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
              {!notifications.supported
                ? 'This browser cannot show notifications. Amrita’s suggestions will appear inside PranaVeda.'
                : notifications.blocked
                  ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then turn this on.'
                  : notifications.enabled
                    ? calendar.connected
                      ? 'On. While PranaVeda is open in a tab, Amrita will notify you in free time — at most once every few hours.'
                      : 'On, but waiting for a calendar. Amrita only notifies you when she can see you are free.'
                    : 'Let Amrita reach you in free time when PranaVeda is open in another tab. Never during a commitment.'}
            </p>
          </div>
          {notifications.supported && !notifications.blocked && (
            <button
              type="button"
              onClick={notifications.enabled ? notifications.disable : notifications.enable}
              aria-pressed={notifications.enabled}
              className={notifications.enabled ? quietAction : primaryAction}
            >
              {notifications.enabled ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}
