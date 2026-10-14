import React, { useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, CalendarDays, Link2, MapPin, User, Watch } from 'lucide-react';
import { PracticeLogEntry, RecommendationResult, WellnessProfile } from '../types';
import PracticeCalendar from './PracticeCalendar';
import CalendarConnections from './CalendarConnections';
import WearableConnections from './WearableConnections';
import LocationSettings from './LocationSettings';
import GoogleSignIn from './GoogleSignIn';
import AppleSignIn from './AppleSignIn';
import { ACCOUNTS_ENABLED, APPLE_SERVICES_ID } from '../lib/auth';
import { Auth } from '../hooks/useAuth';
import { Place } from '../hooks/usePlace';
import { HeartRateMonitor } from '../hooks/useHeartRateMonitor';
import { WearableHealth } from '../hooks/useWearableHealth';
import { ExternalCalendar } from '../hooks/useExternalCalendar';
import { NudgeNotifications } from '../hooks/useNudgeNotifications';

interface ProfileViewProps {
  profile: WellnessProfile;
  auth: Auth;
  practiceLog: PracticeLogEntry[];
  streak: number;
  calendar: ExternalCalendar;
  notifications: NudgeNotifications;
  heart: HeartRateMonitor;
  health: WearableHealth;
  place: Place;
  onOpenRitual: (result: RecommendationResult) => void;
  onStartPractice: () => void;
}

// The profile shown here is what Amrita has learned, kept on this device.
// Sign-in is optional, lives in the same header (a signed-in person is not a
// "Guest"), and only appears where accounts are switched on. Calendar, Wearables and Location are live connectors; the rest
// mark where further integrations will plug in.
const CONNECTORS: {
  id: 'calendar' | 'wearables' | 'location' | 'health';
  icon: typeof CalendarDays;
  title: string;
  description: string;
  available: boolean;
}[] = [
  {
    id: 'calendar',
    icon: CalendarDays,
    title: 'Calendar',
    description: 'Your practice calendar, and your own calendar’s busy times so Amrita suggests practice only when you are free.',
    available: true,
  },
  {
    id: 'wearables',
    icon: Watch,
    title: 'Wearables',
    description: 'A nearby heart-rate device for live readings in practice, and Google Health for sleep, resting heart rate, and HRV.',
    available: true,
  },
  {
    id: 'location',
    icon: MapPin,
    title: 'Location',
    description: 'Home, work, studio or outdoors — so Amrita suggests a practice that suits where you are.',
    available: true,
  },
  {
    id: 'health',
    icon: Activity,
    title: 'Health monitors',
    description: 'Blood pressure, glucose, and other readings from your health devices and apps.',
    available: false,
  },
];

export default function ProfileView({ profile, auth, practiceLog, streak, calendar, notifications, heart, health, place, onOpenRitual, onStartPractice }: ProfileViewProps) {
  const [section, setSection] = useState<'connectors' | 'calendar' | 'wearables' | 'location'>('connectors');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const deleteAccount = async () => {
    setDeleting(true);
    setAccountNotice(null);
    try {
      await auth.deleteAccount();
      setConfirmingDelete(false);
      setAccountNotice('Your account has been deleted.');
    } catch (err: any) {
      setAccountNotice(err?.message || 'Your account could not be deleted just now. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const backToConnectors = (
    <button
      type="button"
      onClick={() => setSection('connectors')}
      className="flex items-center gap-1.5 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800 bg-white/50 hover:bg-white/80 border border-white/70 transition-all cursor-pointer"
    >
      <ArrowLeft className="w-3 h-3" /> Connectors
    </button>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={() => auth.signOut()}
      className="flex-shrink-0 py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold text-stone-600 hover:text-stone-900 bg-white/60 hover:bg-white/90 border border-white/80 transition-all cursor-pointer"
    >
      Sign out
    </button>
  );

  if (section === 'wearables') {
    return (
      <div className="w-full max-w-3xl mx-auto px-5 sm:px-6 pb-12 space-y-4">
        {backToConnectors}
        <WearableConnections heart={heart} health={health} />
      </div>
    );
  }

  if (section === 'location') {
    return (
      <div className="w-full max-w-3xl mx-auto px-5 sm:px-6 pb-12 space-y-4">
        {backToConnectors}
        <LocationSettings place={place} />
      </div>
    );
  }

  if (section === 'calendar') {
    return (
      <div className="w-full space-y-4">
        <div className="w-full max-w-5xl mx-auto px-5 sm:px-6">
          {backToConnectors}
        </div>
        <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-2">
          <CalendarConnections calendar={calendar} notifications={notifications} />
        </div>
        <PracticeCalendar entries={practiceLog} streak={streak} onOpenRitual={onOpenRitual} onStartPractice={onStartPractice} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-5 sm:px-6 pb-12 space-y-6">
      {/* Profile header: who this is, and (where accounts are on) sign-in */}
      <section className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[28px] p-6 sm:p-8 shadow-[0_16px_44px_rgba(138,121,165,0.14)] space-y-5">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 flex-shrink-0 rounded-full bg-[#E8E1F2] flex items-center justify-center">
            <User className="w-7 h-7 text-[#71608E]" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="text-[11px] font-mono tracking-widest font-bold text-stone-500 uppercase">Profile</span>
            {/* The name they gave Amrita comes first; a session being restored is not shown as "Guest". */}
            <h1 className="text-3xl font-serif text-[#2D3436] truncate">
              {profile.name || auth.user?.displayName || (auth.status === 'guest' ? 'Guest' : auth.user?.email || '\u00a0')}
            </h1>
            <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
              {profile.prakriti ? `${profile.prakriti} constitution · ` : ''}
              {auth.status === 'user'
                ? `${auth.user?.email ? `Signed in as ${auth.user.email}. ` : 'Signed in. '}Your wellness profile and practice history are saved to your account.`
                : `Kept on this device.${ACCOUNTS_ENABLED ? '' : ' Accounts and sign-in are not available yet.'}`}
            </p>
          </div>
          {auth.status === 'user' && <div className="hidden sm:block self-start">{signOutButton}</div>}
        </div>
        {/* On a phone the button sits below, so it does not squeeze the name. */}
        {auth.status === 'user' && <div className="sm:hidden">{signOutButton}</div>}

        {auth.status === 'user' && (
          <div className="pt-4 border-t border-stone-200/50">
            {confirmingDelete ? (
              <div className="space-y-3">
                <p className="text-[13.5px] text-stone-700 font-sans leading-relaxed">
                  Delete your PranaVeda account? Your account, your sign-in, and the wellness profile and practice history saved to it are removed from our servers for good, and you are signed out on every device. This device goes back to how it was before you signed in.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={deleteAccount}
                    disabled={deleting}
                    className="py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold text-white bg-[#9A4A4A] hover:bg-[#843C3C] disabled:opacity-60 transition-all cursor-pointer"
                  >
                    {deleting ? 'Deleting…' : 'Delete account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider font-bold text-stone-600 hover:text-stone-900 bg-white/60 hover:bg-white/90 border border-white/80 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAccountNotice(null);
                  setConfirmingDelete(true);
                }}
                className="text-[12.5px] font-sans text-stone-500 hover:text-stone-800 underline-offset-4 hover:underline cursor-pointer"
              >
                Delete account
              </button>
            )}
          </div>
        )}

        {accountNotice && (
          <p role="status" className="text-[13.5px] text-stone-700 font-sans">
            {accountNotice}
          </p>
        )}

        {ACCOUNTS_ENABLED && auth.status === 'guest' && (
          <div className="pt-5 border-t border-stone-200/50 space-y-3">
            <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">
              Signing in is optional. It saves the wellness profile Amrita builds and your practice history to your account, so they follow you to your other devices.
            </p>
            <div className="flex flex-col gap-3">
              <GoogleSignIn signIn={auth.signIn} />
              {APPLE_SERVICES_ID && <AppleSignIn signIn={auth.signIn} />}
            </div>
          </div>
        )}
      </section>

      {/* Connectors */}
      <section className="bg-white/50 border border-white/30 p-6 sm:p-8 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#8A79A5]" />
          <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">Connectors</span>
        </div>
        <h2 className="text-2xl font-serif text-[#2D3436] mt-2">What Amrita can draw on</h2>

        <ul className="mt-5 divide-y divide-stone-200/50">
          {CONNECTORS.map(({ id, icon: Icon, title, description, available }) => (
            <li key={id} className="py-5 first:pt-0 last:pb-0 flex items-start gap-4">
              <div className="w-10 h-10 flex-shrink-0 rounded-full bg-white/70 border border-white flex items-center justify-center">
                <Icon className={`w-4 h-4 ${available ? 'text-[#71608E]' : 'text-stone-500'}`} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[17px] font-serif text-[#2D3436] leading-snug">{title}</p>
                <p className="text-[13.5px] text-stone-600 font-sans leading-relaxed">{description}</p>
              </div>
              {available ? (
                <button
                  type="button"
                  onClick={() => setSection(id === 'health' ? 'connectors' : id)}
                  aria-label={`Open ${title}`}
                  className="flex-shrink-0 flex items-center gap-1.5 py-2 px-4 bg-[#8A79A5] hover:bg-[#72618F] text-white text-[11px] uppercase tracking-wider font-mono font-bold rounded-full transition-all cursor-pointer"
                >
                  {(id === 'calendar' ? calendar.connected : id === 'location' ? place.enabled : heart.status === 'connected' || health.connected)
                    ? id === 'location'
                      ? 'On'
                      : 'Connected'
                    : 'Open'}{' '}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <span className="flex-shrink-0 py-2 text-[11px] font-mono uppercase tracking-wider font-bold text-stone-500">
                  Coming soon
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
