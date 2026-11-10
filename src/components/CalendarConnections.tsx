import React, { useState } from 'react';
import { CalendarClock, Link2 } from 'lucide-react';
import { ExternalCalendar, describeCalendar } from '../hooks/useExternalCalendar';
import { NudgeNotifications } from '../hooks/useNudgeNotifications';
import { PushNudges } from '../hooks/usePushNudges';

const actionButton =
  'flex-shrink-0 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default';
const primaryAction = `${actionButton} bg-[#8A79A5] hover:bg-[#72618F] text-white`;
const quietAction = `${actionButton} text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white/80 border border-white/70`;

// Where each calendar keeps its private iCal address. Inline, closed by default.
function PrivateLinkHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="private-link-help"
        onClick={() => setOpen((o) => !o)}
        className="text-[12.5px] font-sans text-[#72618F] hover:text-[#5a4c73] underline underline-offset-2 cursor-pointer"
      >
        How to find your private link
      </button>
      {open && (
        <div
          id="private-link-help"
          role="region"
          aria-label="How to find your private link"
          className="mt-2 space-y-2 text-[13px] text-stone-600 font-sans leading-relaxed"
        >
          <p>
            <span className="font-semibold text-[#2D3436]">Google Calendar</span> (on a computer): Settings → under
            “Settings for my calendars”, choose your calendar → Integrate calendar → copy the{' '}
            <span className="italic">Secret address in iCal format</span>. Unlike signing in with Google, this link does
            not lapse every hour.
          </p>
          <p>
            <span className="font-semibold text-[#2D3436]">Apple iCloud</span>: on iCloud.com, open Calendar, click the
            share icon next to your calendar, turn on Public Calendar and copy the link.
          </p>
          <p>
            <span className="font-semibold text-[#2D3436]">Outlook</span>: Settings → Calendar → Shared calendars →
            Publish a calendar, choose “Can view when I’m busy”, then copy the ICS link.
          </p>
          <p>
            Keep it private: anyone with the link can see your calendar. PranaVeda reads only when you are busy.
          </p>
        </div>
      )}
    </div>
  );
}

// Connect an outside calendar so Amrita knows when the user is free. Only
// busy times are ever read — the copy says so, because it is the whole promise.
export default function CalendarConnections({
  calendar,
  notifications,
  push,
  alexaLinked = false,
}: {
  calendar: ExternalCalendar;
  notifications: NudgeNotifications;
  push: PushNudges;
  alexaLinked?: boolean;
}) {
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
        what your events are.{' '}
        {push.enabled
          ? 'With notifications on, your busy times are kept on your account so she can reach you when PranaVeda is closed.'
          : alexaLinked
            ? 'With Alexa linked, your busy times are kept on your account so Alexa can tell you your open time.'
            : 'Your busy times stay on this device.'}
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
                  ? `Access has lapsed — Google asks you to confirm about once an hour. Amrita is paused until you reconnect${calendar.icsConnected ? '.' : ', or use your calendar’s private link below, which does not lapse.'}`
                  : calendar.googleConnected
                    ? `Connected. Reading busy times only.${calendar.icsConnected ? '' : ' Google asks you to confirm about once an hour; for no interruptions, use your calendar’s private link below.'}`
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
                  ? 'Connected. Reading busy times only. The link stays on this device unless you keep it on your account (on your profile page).'
                  : 'For Apple iCloud, Outlook, or Google: paste the private iCal address from your calendar’s sharing settings.'}
              </p>
            </div>
            {calendar.icsConnected && (
              <button type="button" onClick={calendar.disconnectIcs} className={quietAction}>
                Disconnect
              </button>
            )}
          </div>
          {!calendar.icsConnected && <PrivateLinkHelp />}
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

        {/* Notifications: push when signed in, otherwise from an open tab */}
        <li className="py-5 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[17px] font-serif text-[#2D3436] leading-snug">Notifications</p>
            {push.available ? (
              <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
                {push.blocked
                  ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then turn this on.'
                  : push.enabled
                    ? calendar.connected
                      ? 'On. Amrita will notify you in free time, even when PranaVeda is closed — at most once every few hours.'
                      : 'On, but waiting for a calendar. Amrita only notifies you when she can see you are free.'
                    : 'Let Amrita reach you in free time, even when PranaVeda is closed. Never during a commitment.'}
              </p>
            ) : push.needsHomeScreen ? (
              <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
                On iPhone, add PranaVeda to your Home Screen (Share, then Add to Home Screen), open it from there and sign in to get Amrita’s notifications.
              </p>
            ) : (
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
                {push.offerSignIn && !notifications.blocked && ' Sign in to get them even when PranaVeda is closed.'}
              </p>
            )}
            {push.error && <p role="alert" className="text-[13px] text-[#B4443A] font-sans">{push.error}</p>}
          </div>
          {push.available
            ? !push.blocked && (
                <button
                  type="button"
                  onClick={push.enabled ? push.disable : push.enable}
                  disabled={push.pending}
                  aria-pressed={push.enabled}
                  className={push.enabled ? quietAction : primaryAction}
                >
                  {push.pending ? 'One moment…' : push.enabled ? 'Turn off' : 'Turn on'}
                </button>
              )
            : !push.needsHomeScreen &&
              notifications.supported &&
              !notifications.blocked && (
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
