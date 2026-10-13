<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8cc0863b-b75e-48c1-a990-c33be1a563fd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and add `ANTHROPIC_API_KEY` (Amrita; not yet listed in `.env.example`). `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are optional and enable the spoken voice; `VITE_GOOGLE_CLIENT_ID` is optional and enables the Google connectors
3. Run the app:
   `npm run dev`

## Features: practice calendar, connectors, wearables, and location

Everything below lives under the profile button at the right end of the top navigation: **Profile → Connectors**. There are no user accounts yet; the profile is a placeholder that shows the name and constitution Amrita has learned, or "Guest".

| Connector | Status | What it does |
|---|---|---|
| Calendar | Live | Practice calendar, outside-calendar free time, free-time nudges |
| Wearables | Live | Nearby heart-rate device, Google Health readings |
| Location | Live | Recognises saved places so Amrita suggests a practice that suits the setting |
| Health monitors | Placeholder | Marked "Coming soon" |

New connectors are one entry each in the `CONNECTORS` array in `src/components/ProfileView.tsx`.

### Practice log and calendar

- **What is logged:** a practice is saved when the guided yoga flow reaches its end, or when the breathwork timer finishes its cycles. Each entry holds a timestamp, the user's local calendar date, kind, title, duration, and a snapshot of the ritual.
- **Calendar view:** a month grid with a day panel. Rituals show as a filled dot and breathwork as a hollow ring. "Open ritual" reopens the full practice. Arrow keys move between days, including across months.
- **Streak:** consecutive days with at least one practice. It stays alive through today until the day ends. The same number appears in Recovery & Trends.

Things to know:

- Tapping the next arrow through every pose counts as finishing the ritual.
- The breathwork card inside the Amrita chat has no timer, so only breathwork run inside a ritual is logged.
- The log keeps 500 entries; only the 40 most recent keep the ritual snapshot behind "Open ritual".
- Opening a ritual from the calendar and pressing Back returns to the Amrita view, not the calendar.

### Outside calendar and free time

Amrita reads **when the user is busy, never what the events are**. Two ways to connect:

- **Private calendar link:** the user pastes the private iCal address from Apple iCloud, Outlook, or Google. The server fetches it on each refresh through `POST /api/calendar/ics` and returns only busy intervals. The link is kept on the device; the server stores nothing.
- **Google sign-in:** a browser-only popup asking for read-only free/busy access. Requires `VITE_GOOGLE_CLIENT_ID`.

Busy times cover today and tomorrow and refresh every 10 minutes and whenever the tab regains focus. With a calendar connected, each chat message carries a short busy/free summary, and Amrita is told to size practices to the open window and never guess what an event is.

Things to know:

- **All-day events do not count as busy.** Holidays and birthdays would otherwise silence Amrita all day; the catch is that an all-day "out of office" will not block nudges either.
- Cancelled events and events marked "free" do not count as busy. Recurring events, deleted occurrences, and moved occurrences are handled.
- **Google access lapses about every hour.** Browser-only sign-in cannot renew silently, so the user must click "Reconnect". The private link has no such limit.
- **Fail closed:** if any connected calendar has lapsed or errored, free time is not trusted and Amrita does not nudge at all.
- The link reader only accepts public `https://` or `webcal://` addresses and refuses private, loopback, and cloud-metadata addresses.

### Free-time nudges

A nudge only ever appears in open calendar time. It never appears:

- during a busy block;
- when the gap before the next commitment is under 10 minutes;
- before 7 AM or after 10 PM;
- within two hours of a finished practice;
- when no calendar is connected, or a connected calendar cannot be read.

**In-app bar.** On the home screen, for example "You have 40 open minutes, until 9:35 PM", with a "Practice now" button that asks Amrita for something that fits. Dismissing it hides it for that opening. It shows on the home screen only, not in chat or other tabs.

**Browser notifications.** Turned on from the "Notifications" row under Profile → Connectors → Calendar, which triggers the browser's permission prompt. On top of the rules above:

- the tab must have been out of view for at least 15 minutes;
- at most one notification per free slot;
- at least three hours between notifications;
- nothing fires while a ritual is open.

Clicking a notification brings the tab forward and lands on the home screen, where the in-app bar offers "Practice now".

Limits of browser notifications:

- **Desktop browsers only, in practice.** Android Chrome and iPhone Safari do not allow this kind of notification from a plain web page.
- **The tab must stay open.** Closing the tab or the browser stops them. Browsers slow background tabs, so one can arrive a minute or so late.
- Reaching users with the app closed needs push notifications and a backend, which is not built.

Pacing values are constants: the 15-minute and 3-hour rules at the top of `src/hooks/useNudgeNotifications.ts`, and the 10-minute, waking-hours, and rest-after-practice rules beside `findOpenSlot` in `src/hooks/useExternalCalendar.ts`.

### Wearables

Readings are wellness signals, not medical measurements.

- **Nearby heart-rate device (Bluetooth):** "Find nearby devices" opens the browser's own list of devices in range; the user picks one. PranaVeda then reads live heart rate, plus HRV when the device sends beat-to-beat timing.
- **Google Health sign-in:** read-only access to the last two weeks of sleep, resting heart rate, and overnight HRV. This is the successor to the Fitbit Web API (switched off on 30 October 2026) and carries Fitbit and Pixel Watch data. Requires `VITE_GOOGLE_CLIENT_ID` and the Google Health API enabled on the same Google Cloud project.

Where the readings go:

- **Live in practice:** heart rate shows on the yoga timer and the breathwork timer. When a practice finishes, its start-to-finish heart rate is saved with the log entry, shown in a toast, and listed on that day in the practice calendar.
- **Amrita:** each chat message carries a short summary: live heart rate, the last practice's heart rate, and resting heart rate, HRV, and sleep against the user's own recent average. Amrita is told to lean gentle when readings are worse than usual, never diagnose, and not recite numbers unless asked.
- **Trends:** a "From your devices" card at the top of Recovery & Trends charts resting heart rate, HRV, sleep, and heart-rate change per practice. It appears only once there is data. The rest of Recovery & Trends is still sample data.

Limits:

- **No automatic recognition.** A web page cannot detect devices on its own; the user must click to search. A previously connected device may reconnect on load where the browser supports it, but this is experimental.
- **Bluetooth works in Chrome and Edge only**, on desktop and Android. Safari, Firefox, and all iPhone browsers show a "cannot use Bluetooth" message.
- **Most watches will not appear in the device list.** Chest straps and arm bands will; a watch appears only if it has a "broadcast heart rate" mode switched on.
- **Apple Watch is not supported.** It does not broadcast heart rate as a standard Bluetooth sensor, and its data lives in Apple Health, which only a native iPhone app can read.
- **Google Health access lapses about hourly.** Saved readings stay visible; refreshing needs a "Reconnect" click.
- Google may require app verification for health-data access before public launch.

### Location

Location tells Amrita the **kind of place** the user is in, so the practice fits the setting. It is off until the user turns it on under Profile → Connectors → Location, which triggers the browser's permission prompt.

How it works:

- While PranaVeda is open, the browser reports the device's position, and updates it as the user moves.
- The user marks the spots that matter by pressing "I am here" while standing in them: Home, Work, Studio or gym, and Outdoor spot. There is one spot per kind; pressing "Move here" relocates it.
- The current position is matched to the nearest saved spot within about 150 metres. A good position that matches none is treated as "Somewhere else".

What changes with the place:

- **Home screen:** the first suggestion chip reflects the place, for example "I'm at work. Something quiet I can do at my desk, please."
- **Amrita:** each chat message carries the kind of place, with guidance for it:
  - Home: floor work, lying poses and audible breath are fine.
  - Work: discreet and short, seated or standing, silent breath only.
  - Studio or gym: a fuller, more physical practice.
  - Outdoor spot: standing and balancing poses, nothing lying down.
  - Somewhere else: brief, equipment-free, seated or standing.
- What the user says always wins over the place ("I have a private room").

Privacy:

- Coordinates stay on the device. Only the kind of place is sent with a chat message; no address or coordinates are sent.
- No location history is kept. Only the saved spots are stored; the current position lives in memory while the app is open.

Limits:

- **Only while the app is open.** A web page cannot follow location in the background or with the tab closed, so there is no all-day trail.
- **Nothing is suggested until at least one spot is saved.** With none saved, Amrita is told nothing about location.
- **A rough position is ignored.** If the device can only place the user to within about 2 km (common on desktops without Wi-Fi positioning), the app says so and does not guess.
- Places are not looked up on a map. The app does not know that a spot is a park or an office unless the user saves it as one.

The 150-metre match radius and the 2 km accuracy cut-off are constants at the top of `src/hooks/usePlace.ts`; the per-place guidance is `PLACE_GUIDANCE` in `api/index.ts`.

### Where data is stored

Everything is kept in the browser on the user's device. The server stores nothing.

| What | Browser storage key |
|---|---|
| Practice log | `pranaveda_practice_log` |
| Calendar connections (including the private link) | `pranaveda_calendar_connections` |
| Notification preference and last notification | `pranaveda_nudge_notifications`, `pranaveda_nudge_notified` |
| Google Health daily readings (up to 90 days) | `pranaveda_health_days` |
| Remembered Bluetooth device name | `pranaveda_hr_device` |
| Location on/off and saved spots | `pranaveda_location_enabled`, `pranaveda_places` |
| Google access tokens (this tab only, about an hour) | `pranaveda_google_token`, `pranaveda_google_health_token` |

Disconnecting Google Health also clears its saved readings.

### Setup for the Google connectors

1. In Google Cloud Console, create an OAuth client of type "Web application".
2. Add your site origins under "Authorized JavaScript origins", including `http://localhost:3000` for local work.
3. For Google Health, enable the Google Health API on the same project.
4. Set `VITE_GOOGLE_CLIENT_ID` to the client ID (see `.env.example`).

Without the client ID, both Google options show "Not set up yet for this site". The private calendar link and the Bluetooth device work without it.

### Verification status

Tested in a browser with simulated data:

- Practice logging, calendar, and streak.
- The private calendar link reader (recurring events, time zones, deleted and moved occurrences, blocked addresses) and the connect flow.
- The in-app nudge appearing when free and disappearing when busy.
- Browser notification rules and one end-to-end notification, using a stand-in for the real notification.
- The Bluetooth and Google Health flows, session heart-rate saving, the Trends card, and the summary sent to Amrita, using a simulated strap and simulated Google Health responses.
- Location: place matching, saving spots, the place-aware suggestion, and the chat request carrying only the kind of place, using a simulated position.

Not yet tested against the real thing:

- Google Calendar and Google Health sign-in with a real client ID. The Google Health field names and filters come from Google's documentation, not a live call.
- A real Bluetooth heart-rate device.
- A real system notification appearing on screen.
- Location with a real device position and the browser's real permission prompt.
- Amrita's replies using calendar and wearable context, which needs an Anthropic API key.
