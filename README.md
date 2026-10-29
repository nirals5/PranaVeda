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
2. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` (Amrita). `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are optional and enable the spoken voice; `VITE_GOOGLE_CLIENT_ID` is optional and enables the Google connectors.
3. Run the app:
   `npm run dev`

Accounts and sync are optional and off by default; see [Accounts and sync](#accounts-and-sync-optional-off-by-default) to switch them on.

Checks: `npm run lint` (type check) and `npm test` (Vitest). The tests that need a database run when `DATABASE_URL` is set and are skipped otherwise; they create throwaway accounts and delete them afterwards, so point `DATABASE_URL` at a development database, never production.

GitHub Actions runs these checks on every pull request (`.github/workflows/`): the website's type check and tests, and, when a pull request touches `ios/` or `android/`, the iOS tests on a simulator and the Android unit tests. The database tests are skipped there, since CI has no database. `tests/apiImports.test.ts` also fails if a file the Vercel functions load has a relative import without a `.js` extension: it would pass every other check and only crash on Vercel.

## Features: practice calendar, connectors, wearables, and location

Everything below lives under the profile button at the right end of the top navigation: **Profile → Connectors**. The Profile header shows the name and constitution Amrita has learned, or "Guest". Where accounts are switched on it also holds sign-in (see [Accounts and sync](#accounts-and-sync-optional-off-by-default)); the connectors below work the same signed in or out.

| Connector | Status | What it does |
|---|---|---|
| Calendar | Live | Practice calendar, outside-calendar free time, free-time nudges |
| Wearables | Live | Nearby heart-rate device, Google Health readings |
| Location | Live | Recognises saved places so Amrita suggests a practice that suits the setting |
| Health monitors | Placeholder | Marked "Coming soon" |

New connectors are one entry each in the `CONNECTORS` array in `src/components/ProfileView.tsx`.

### Practice log and calendar

- **What is logged:** a practice is saved when the guided yoga flow reaches its end, or when the breathwork timer finishes its cycles. Each entry holds a timestamp, the user's local calendar date, kind, title, duration, and a snapshot of the ritual.
- **How do you feel now?** When a practice finishes, the website, iPhone and Android apps ask one optional question: More settled, About the same or Less settled. The answer is saved on that log entry as `feeling` and used by H11 below. It can be changed with another tap, or skipped.
- **Calendar view:** a month grid with a day panel. Rituals show as a filled dot and breathwork as a hollow ring. "Open ritual" reopens the full practice. Arrow keys move between days, including across months.
- **Streak:** consecutive days with at least one practice. It stays alive through today until the day ends. The same number appears in Recovery & Trends.

Things to know:

- Tapping the next arrow through every pose counts as finishing the ritual.
- The breathwork card inside the Amrita chat has no timer, so only breathwork run inside a ritual is logged.
- The log on a device keeps 500 entries; only the 40 most recent keep the ritual snapshot behind "Open ritual". When signed in, the account keeps every entry.
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
- Reaching users with the app closed needs push notifications, which are not built.

Pacing values are constants: the 15-minute and 3-hour rules at the top of `src/hooks/useNudgeNotifications.ts`, and the 10-minute, waking-hours, and rest-after-practice rules beside `findOpenSlot` in `src/hooks/useExternalCalendar.ts`.

### Calendar and free-time reminders in the apps

The iPhone and Android apps read the phone's own calendar instead of a link or a Google sign-in. That covers any Google, Outlook or iCloud calendar already synced to the phone. It is off until turned on from the Calendar card on the You tab.

- **What Amrita gets:** the same busy/free summary the website sends (`CalendarContext`): free now or busy until when, and busy times today and tomorrow. Titles, places and people never leave the phone.
- **What counts as busy:** the website's rules. All-day events, events marked "free", and cancelled or declined events don't count.
- **Permission:** iPhone asks for full calendar access, since iOS has no "busy times only" permission. Android asks to read the calendar.
- **Welcome screen:** the website's free-time bar ("You have 40 open minutes, until 9:35 PM") with Practice now. Dismissing it hides it for that opening.
- **Reminders:** a separate switch under the Calendar card, asking for notification permission. They follow the website's pacing: 7 AM–10 PM only, gaps of 10 minutes or more, not within 2 hours of a practice, one per opening, at least 3 hours apart, never while the app is on screen, and only after it has been off screen for 15 minutes. Tapping one opens the Amrita tab.
  - **Android:** WorkManager runs a check every 15 minutes that reads the calendar as it is then (`calendar/CalendarStore.kt`).
  - **iPhone:** iOS allows no regular check, so the app plans the day's reminders as local notifications when it leaves the screen, and again when iOS gives it background time (`Models/CalendarStore.swift`). A meeting added while the app is closed can catch a planned reminder until the app next opens or refreshes.
- **No server, no paid account:** reminders are the phone's own notifications. A free Apple ID install still expires after 7 days, and its reminders stop with it.
- **Fail closed:** if calendar access is withdrawn, there is no bar and no reminder.
- **Rules in code:** `FreeTime.swift` and `FreeTime.kt`, with the same constants as the website.

### Explore in the apps (G3)

Practices marked `where_shown = explore_only` in the Practice Library (Headstand, Handstand, Shoulder Stand, Plow, Camel and Crow) are advanced poses Amrita never offers. The iPhone and Android apps show them in an **Explore** section at the end of the Library tab.

- **Served:** `/api/catalog` lists them under `explore`, with cues, common mistakes, how to build up to them, the pose to follow with, and the conditions to avoid them with. A row with no cues or benefit is left out and named in the log.
- **The caveat first:** each pose page opens with "At your own risk": Amrita won't suggest it, it is best learned with a teacher, and it is for experienced practitioners only.
- **Not for you:** when a condition on the profile matches one to avoid (by the server's code, label and everyday-word matching), the tile and page say so.
- **Never practised in the app:** no guided practice, voice or logging. There are no photographs yet, so a placeholder shows.
- **Amrita:** her prompt names these poses as explore-only. If asked for one, she points to Library → Explore in the apps and offers a catalog pose that prepares for it. She never puts one in a card.
- **Website:** has no Library, so no Explore yet.

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

In the iPhone and Android apps:

- **Where to turn it on:** a Location card on the You tab. It has the same places, the same rules and the same promise.
- **Permission:** the phones ask for location "while using the app" only. iPhone uses Core Location; Android uses its built-in fused provider, with no Google Play services library.
- **Approximate location:** if someone allows only an approximate location, the card says it is too vague to tell places apart, and asks them to allow precise location.
- **Not shared between devices:** saved spots stay on the phone. They are not synced to the website or the account.
- **Code:** `ios/PranaVeda/Models/PlaceStore.swift` and `android/.../place/PlaceStore.kt`.
- **Suggestion chips:** the apps' welcome shows the website's home-screen suggestions, with the place chip first when the phone knows where it is. Tapping one sends it to Amrita. `tests/appSuggestions.test.ts` checks the apps use the website's words.

### Weather

Amrita knows roughly what the weather is like where the user is, so practices the Practice Library marks `avoid_weather` are not offered in that weather (G14): Cooling Breath and Hissing Breath in the cold, Sun-Piercing Breath in the heat. It works on the website and both apps, with no permission prompt. It uses free services only:

- **Where:** the approximate location Vercel adds to every request, worked out from the network address (city level). It can be off behind a VPN, or by a town.
- **Weather:** [Open-Meteo](https://open-meteo.com), which needs no key. Its free tier is for non-commercial use, with attribution ("Weather data by Open-Meteo.com", CC BY 4.0). If PranaVeda becomes commercial, move to its paid plan or another provider (`api/_lib/weather.ts`).
- **Hot or cold:** a feels-like temperature of 10 °C or below is cold, and 30 °C or above is hot (`COLD_AT_C`, `HOT_AT_C`).
- **What they say wins.** If the user says their weather is different ("my room is hot"), Amrita passes that on with the card, and it is checked against that instead.
- One lookup per area every half hour, shared by everyone there. If the lookup fails, or takes more than 1.5 seconds, Amrita is told nothing about weather, and the next try is five minutes later.

Privacy: coordinates are rounded to about 10 km before they are sent to Open-Meteo, and are never stored. Amrita is told the temperature and conditions, not the place.

- **Locally** there are no Vercel headers, so set `WEATHER_TEST_LOCATION="47.6,-122.3"` to test with a fixed place.
- **Turn it off:** `WEATHER=off`.

### Time of day, season, weather, sleep, feedback and dosha hints

Hints H1–H12 in the Practice Library's Rules tab gently steer Amrita's choices, in a "Right now" section of her prompt (`api/_lib/rightNow.ts`). They never refuse a card: what the user says, and every safety rule, comes first.

- **Time of day,** from the time the website or app sends:
  - **H1, 6–10 am:** energise.
  - **H2, 10 am–2 pm:** cool if irritable or hot.
  - **H3, 2–6 pm:** ground if scattered or anxious.
  - **H4, 8 pm–4 am:** wind down.
- **Season,** from the user's own date:
  - **H5, Sep 23 – Jan 15:** grounding and warming.
  - **H6, Jan 16 – Jun 20:** energising.
  - **H7, Jun 21 – Sep 22:** cooling.
  - South of the tropics the dates are six months on. Within about 23.5° of the equator no season hint is given. When the location is unknown, northern dates are used.
- **Weather:**
  - **H8, cold or windy:** grounding and warming.
  - **H9, hot:** cooling.

- **Sleep (H10):**
  - **What it does:** after a short night, Amrita avoids strong practices and leans toward N4 Restore or N1 Ground.
  - **What counts:** under 6 hours, or an hour or more below their usual (`SHORT_SLEEP_MINUTES`, `SHORT_OF_USUAL_MINUTES`).
  - **Where it comes from:** the wearable reading the website sends, else what the user says. The iPhone and Android apps also send their readings, but only when the user turns on "Let Amrita see my sleep and heart readings" under Heart & sleep. It's off by default.
    - **What's sent:** only a summary: last night's sleep, resting heart rate and HRV, each beside the user's usual, worked out as on the website.
    - **HRV:** each reading names its kind, SDNN from Apple Health or RMSSD from Health Connect.
- **Learning from feedback (H11):**
  - **What it does:** a practice that left them less settled at least twice weighs less: Amrita chooses others that serve the same need, unless they ask for it by name. A practice that left them more settled at least twice weighs more.
  - **What counts:** ratings in the last 90 days (`FEEDBACK_DAYS`, `FEEDBACK_TIMES` in `api/_lib/feedback.ts`). A rating covers every main practice in that session, each pose and the breath; anchors such as Child's Pose are left out. A practice is listed only when one side outnumbers the other, so a later good session can cancel a bad one.
  - **Who it covers:** signed-in users, from the account's practice log, like rotation. A guest's ratings stay on their device.
  - **Syncing a later rating:** log entries are otherwise never changed. A rating given after the entry was sent goes up again with the entry, and the server takes only its `feeling`. Other devices keep the copy they already have.
- **Their dosha (H12):**
  - **What it does:** between equally good options, Amrita prefers practices that balance the person's dosha.
  - **Which dosha:** their current imbalance (`vikriti`) when Amrita has recorded one, else their constitution (`prakriti`).
  - **When it's skipped:** when the constitution was recorded with low confidence.

What each hint leans toward is the Rules tab's `then` text, and the windows are in code. Amrita's catalog shows, for each practice, the needs it serves, its intensity and the doshas it balances or can aggravate. For example: "Serves: N1 Ground, N6 Wind down. Intensity: gentle. Balances Vata". With that she can follow the hints.

### Rate limits

The routes that cost money per request or fetch for the caller are limited per person, or per network address for guests. Counts are kept in Postgres (`rate_limit_counts`), so every server instance shares them; the day resets at midnight UTC.

| Route | Variable | Built-in limit (per minute / per day) |
|---|---|---|
| `/api/chat` | `RATE_LIMIT_CHAT` | 10 / 300 |
| `/api/tts` (voice) | `RATE_LIMIT_VOICE` | 30 / 600 |
| `/api/insight` | `RATE_LIMIT_INSIGHT` | 5 / 50 |
| `/api/coaching` | `RATE_LIMIT_COACHING` | 5 / 50 |
| `/api/calendar/ics` | `RATE_LIMIT_CALENDAR` | 10 / 300 |

- **Change a limit:** set its variable to `<per minute>/<per day>`, e.g. `RATE_LIMIT_CHAT=20/500`. A malformed value is logged and the built-in limit kept.
- **Turn limiting off:** `RATE_LIMITS=off`.
- On Vercel, redeploy after changing either.
- Over a chat limit, Amrita says so in her reply. The other routes answer `429` with `Retry-After`, and the apps fall back (built-in voice, no insight card). If the counts can't be read, requests go through.

### Accounts and sync (optional, off by default)

Signing in is optional, and only offered where `VITE_ACCOUNTS_ENABLED` is `"true"`. With it unset (production today), the sign-in code is left out of the build and the app behaves exactly as a signed-out app always has.

What signing in does:

- **Wellness profile:** the profile Amrita builds is saved to the account and follows the person to other devices. While signed in, Amrita reads it from the account and saves her changes there.
- **Practice history:** every finished practice is saved to the account, so the calendar, streak and trends show practices from all devices. A practice finished offline is uploaded later.
- **Saved rituals:** bookmarks are saved to the account and follow the person to other devices. Removing one removes it everywhere; the server keeps a small marker in its place, so a device that was offline cannot bring it back.
- **Greeting:** the home screen greets the person by first name.

Not synced: calendar connections, location settings, wearable readings and the chat conversation stay on the device.

- **First sign-in on a device:** if the account has no profile yet, this device's profile becomes the account's. Otherwise the account's replaces the device's copy.
- **Sign-out:** by any route (signing out, a session that ended, account deletion), the device goes back to how it was before sign-in. The account's profile, practices and saved rituals are removed from it, and its own pre-sign-in data is put back, so the next person on a shared device does not see them. A practice that never reached the account is kept rather than lost.
- **Account deletion:** "Delete account" in the Profile header removes the account, its sign-in methods, sessions, profile, practice history and saved rituals from the server, and signs out every device.

Sign-in methods:

- **Google:** live. Uses the same `VITE_GOOGLE_CLIENT_ID` as the Google connectors.
- **Apple:** built but hidden until `VITE_APPLE_SERVICES_ID` and the Apple signing key are configured. Apple does not accept `localhost`, so it can only be tried on a deployed site.

How sessions work:

- **Web:** web sessions live in httpOnly cookies, so page scripts never see a token. Native apps (to come) get tokens in the response and keep them in the platform keystore.
- **Lifetime:** access tokens last 15 minutes and refresh automatically. A sign-in lasts 60 days from last use.
- **Device type:** each sign-in records a coarse device description (web or app, desktop/phone/tablet, operating system and major version, browser) for a signed-in-devices list and platform analytics. Browsers do not reveal the device model, so it is only recorded for the native apps.

Switching it on (locally, on a preview, or in production):

1. Create a Neon Postgres database, using a separate branch for each environment. Set `DATABASE_URL` (direct connection) and `DATABASE_URL_POOLED` (pooled).
2. Create the tables with `npm run db:migrate`. After changing `db/schema.ts`, run `npm run db:generate` first.
3. Set `AUTH_JWT_SECRET` to a new random value for each environment, for example from `openssl rand -base64 48`.
4. Set `VITE_GOOGLE_CLIENT_ID`, and add the site's address to the OAuth client's "Authorized JavaScript origins". For anyone other than listed test users to sign in, the OAuth consent screen must be published.
5. Set `VITE_ACCOUNTS_ENABLED` to `"true"`, then rebuild. `VITE_` settings are read at build time.

Server endpoints:

- **`/api/auth/*`** and **`/api/me`:** sign-in, refresh, sign-out, the current user, and account deletion (`api/auth.ts`).
- **`/api/sync/*`:** profile and practice-log sync (`api/sync.ts`).
- **Shared code:** lives in `api/_lib/`, and relative imports under `api/` must end in `.js`. Vercel runs these files as native ES modules, where an import without the extension fails at the first request.

### Practice catalog API

`GET /api/catalog` returns the poses and breathwork patterns Amrita composes rituals from, for clients that do not carry their own copy (the planned iOS and Android apps). Every image is a full address.

Pose images and Niral's room scenes are referenced as site paths (`/poses/cobra.jpg`). Set `PUBLIC_ASSET_BASE_URL` to the live site's address (or, later, a CDN) so ritual cards carry full addresses too. Rituals are saved and synced, so without that setting they keep site paths rather than the address of whichever copy of the site served them.

`GET /api/dosha-guide` returns the classical balancing reference shown on the Dosha Profile screen (qualities, diet, daily rhythm, practice and breath per dosha). The website imports the same file (`api/_lib/doshaGuide.ts`), so the text has one home.

### Where data is stored

Signed out, or with accounts switched off, everything is kept in the browser on the user's device and the server stores nothing.

| What | Browser storage key |
|---|---|
| Wellness profile Amrita has built | `pranaveda_profile` |
| Current conversation, and the end of the previous one | `pranaveda_chat`, `pranaveda_chat_ts`, `pranaveda_last_session` |
| Practice log | `pranaveda_practice_log` |
| Saved (bookmarked) rituals | `pranaveda_practices` |
| Calendar connections (including the private link) | `pranaveda_calendar_connections` |
| Notification preference and last notification | `pranaveda_nudge_notifications`, `pranaveda_nudge_notified` |
| Google Health daily readings (up to 90 days) | `pranaveda_health_days` |
| Remembered Bluetooth device name | `pranaveda_hr_device` |
| Location on/off and saved spots | `pranaveda_location_enabled`, `pranaveda_places` |
| Google access tokens (this tab only, about an hour) | `pranaveda_google_token`, `pranaveda_google_health_token` |

Disconnecting Google Health also clears its saved readings.

Signed in, the browser also keeps a few markers so sync can hand the device back on sign-out: `pranaveda_signed_in`, `pranaveda_profile_owner`, `pranaveda_profile_before_signin`, and `pranaveda_practice_owner`, `pranaveda_practice_own_ids`, `pranaveda_practice_synced_ids`, `pranaveda_practice_cursor`, and `pranaveda_saved_owner`, `pranaveda_saved_own_ids`, `pranaveda_saved_synced_ids`, `pranaveda_saved_removed_ids`.

Signed in, the server (Neon Postgres) also stores:

| What | Table |
|---|---|
| Account: email, display name, timezone | `users` |
| Sign-in methods (Google, Apple) | `identities` |
| Sign-ins with coarse device type | `sessions` |
| Session tokens, stored hashed | `refresh_tokens` |
| Wellness profile | `wellness_profiles` |
| Practice history, including heart readings and ritual snapshots | `practice_log_entries` |
| Saved rituals, and markers for removed ones (no ritual content) | `saved_rituals` |

Everything is removed when the account is deleted.

### Setup for the Google connectors

1. In Google Cloud Console, create an OAuth client of type "Web application".
2. Add your site origins under "Authorized JavaScript origins", including `http://localhost:3000` for local work.
3. For Google Health, enable the Google Health API on the same project.
4. Set `VITE_GOOGLE_CLIENT_ID` to the client ID (see `.env.example`).

Without the client ID, both Google options show "Not set up yet for this site". The private calendar link and the Bluetooth device work without it.

### Verification status

`npm test` covers sign-in, sessions, account deletion, profile and practice-log sync, the catalog, and the signed-in chat (with a scripted stand-in for Claude), against a real database when one is configured.

Tested in a browser with simulated data:

- Practice logging, calendar, and streak.
- The private calendar link reader (recurring events, time zones, deleted and moved occurrences, blocked addresses) and the connect flow.
- The in-app nudge appearing when free and disappearing when busy.
- Browser notification rules and one end-to-end notification, using a stand-in for the real notification.
- The Bluetooth and Google Health flows, session heart-rate saving, the Trends card, and the summary sent to Amrita, using a simulated strap and simulated Google Health responses.
- Location: place matching, saving spots, the place-aware suggestion, and the chat request carrying only the kind of place, using a simulated position.

Tested against the real thing:

- Google sign-in with a real client ID, locally: account, session and timezone recorded, and the session restored on a later visit.
- Amrita with the live model, signed in and signed out: profile updates saved to the account, and returned to the device for a guest.

Not yet tested against the real thing:

- Google Calendar and Google Health connectors with a real client ID. The Google Health field names and filters come from Google's documentation, not a live call.
- Sign in with Apple (needs an Apple Developer account).
- A real Bluetooth heart-rate device.
- A real system notification appearing on screen.
- Location with a real device position and the browser's real permission prompt.
- Amrita's replies using calendar, wearable and location context with the live model.
