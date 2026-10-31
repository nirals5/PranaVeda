# PranaVeda for iOS (prototype)

A SwiftUI prototype of the native iPhone app: Amrita's chat streaming from the
existing `/api/chat` (as a guest, with the wellness profile kept on the
device), Amrita's daily insight
(a short reflection from `/api/insight`, once per launch) above the chat, speaking to Amrita (the phone's speech recognition, with her reply read aloud by her ElevenLabs voice when the server has one, else the phone's own voice; asks for microphone and speech-recognition permission the first time), ritual, breathwork, dosha and answer-option cards, and a Library of
every pose from `/api/catalog` with Niral's room scenes, a Dosha tab (the
Prakriti Amrita assessed, with the balancing guide from `/api/dosha-guide`, as
on the website's Dosha Profile screen), guided practice (a ritual's poses one at a time with
a timer and spoken guidance, and a breathwork pacer) with a practice log and
streak that sync with the account (shown on a practice calendar in the "You" tab, as on the website, with Recovery & Trends under it: this week and last, minutes each of the last 8 weeks split by rituals and breathwork, current and longest streak, and the balance between the two; then Heart & sleep: sleep, resting heart rate and heart-rate variability from Apple Health over 14 days with practice days shaded, read on the phone after permission and never sent anywhere; real data only), saved
rituals (bookmarked from any ritual; kept on the device, and in the account while signed in, so they follow you to the website and your other devices), and optional Google sign-in (the "You" tab) that shares the wellness profile with the website.

## Requirements

- Xcode 27 with an iOS 17 or later simulator runtime (`xcodebuild -downloadPlatform iOS`)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- The PranaVeda server running locally (`npm run dev` in the repo root, with `ANTHROPIC_API_KEY` set)

## Build and run

The Xcode project is generated from `project.yml`, so it is not committed:

```bash
cd ios
xcodegen
open PranaVeda.xcodeproj
```

Run the `PranaVeda` scheme on an iPhone simulator. The simulator reaches the
Mac's own `localhost`, so the app talks to the local server at
`http://localhost:3000`. The address is `PV_API_BASE_URL` in
`Configuration/App.xcconfig`; `xcodebuild PV_API_BASE_URL=…` overrides it for
one build.

## On your own iPhone

A free Apple ID is enough to run the app on your own phone (it stops opening
after 7 days; run it from Xcode again to refresh it).

1. Copy `Configuration/Local.xcconfig.example` to `Configuration/Local.xcconfig`
   (git ignores it) and fill in your signing team, and your Mac's network name
   for `PV_API_BASE_URL[config=Debug][sdk=iphoneos*]`. Phone Debug builds then reach the dev server
   at `http://<your-mac>.local:3000`; the phone must be on the same Wi-Fi.
2. Run `xcodegen` again, connect the iPhone, turn on Developer Mode on it
   (Settings → Privacy & Security), and run the app on it from Xcode.
3. The first time, iOS asks to allow access to the local network: allow it.

### On production

A Release build talks to production (`https://v0-pranaveda.vercel.app`), so it
works anywhere without the Mac. Install it over a development build from `ios/`,
with your iPhone's id from `xcrun devicectl list devices`:

```bash
xcodebuild -project PranaVeda.xcodeproj -scheme PranaVeda -configuration Release -destination 'id=<iphone-id>' -derivedDataPath build/production -allowProvisioningUpdates clean build
```

```bash
xcrun devicectl device install app --device <iphone-id> build/production/Build/Products/Release-iphoneos/PranaVeda.app
```

The app asks you to sign in once, because production has its own accounts.
Practices that came from the development account leave the phone at that point;
anything the phone had before signing in, or that never reached that account,
stays and goes up to your production account. A free Apple ID's 7-day limit still
applies.

Tests (stream parsing and decoding of the server's events and cards):

```bash
xcodebuild -project PranaVeda.xcodeproj -scheme PranaVeda -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

## Sign in with Apple (off until a paid Apple Developer team)

The code is in the app, switched off: Apple allows it only for apps signed by a
paid Apple Developer Program team, and builds signed by a free personal team
fail if they ask for it. To turn it on:

1. In `Configuration/Local.xcconfig`, set `DEVELOPMENT_TEAM` to the paid team
   and add `PV_APPLE_SIGN_IN = YES`, then run `xcodegen`. The build then
   carries the Sign in with Apple capability (`PranaVeda/PranaVeda.entitlements`)
   and the "You" tab shows Apple's button above Google's.
2. In developer.apple.com → Keys, create a key with Sign in with Apple for the
   app id `com.pranaveda.app`; download its `.p8` (keep it outside the project).
3. In the server's `.env`: `APPLE_BUNDLE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY` (the `.p8` contents) and `CONNECTIONS_ENC_KEY`, which
   encrypts Apple's token so it can be revoked when an account is deleted.

At launch, a session that was started with Apple is ended if the person has
since stopped using their Apple ID with PranaVeda (Settings → Apple Account →
Sign in with Apple), as Apple asks.

## Notes

- Google sign-in uses the iOS OAuth client in `Configuration/App.xcconfig` (`PV_GOOGLE_CLIENT_ID`). The server must list the same id in `GOOGLE_CLIENT_ID_IOS`, or it refuses the app's sign-ins. The session's refresh token is kept in the Keychain (this device only); the access token only in memory.

- The app icon is the website's lotus (`src/assets/pranaveda_icon.svg`) on the app's soft background. Regenerate it with `swift scripts/make-app-icon.swift` (run in `ios/`) if the artwork changes.

- Plain `http` is allowed for the local network only (`NSAllowsLocalNetworking`); everything else needs https.
- Image addresses from the API are either full addresses or site paths (`/poses/cobra.jpg`); paths are resolved against the API's address (`AppConfig.resolve`).
- The web app's fonts are bundled: Playfair Display for headings and quotes, Plus Jakarta Sans for text (`PranaVeda/Fonts`, registered in `project.yml`; SIL Open Font License, copies alongside). They follow the text-size setting like system fonts.
- Widgets (`PranaVedaWidgets`, a WidgetKit extension): "Today" (streak, whether you have practised today, the day's reflection, Talk to Amrita, the newest saved ritual; small, medium and lock-screen sizes) and "This week" (practice days as dots). The app writes a small snapshot into the App Group `group.<bundle id>` whenever the practice log, saved rituals or the reflection change (`Shared/WidgetSnapshot.swift`, `App/WidgetBridge.swift`); widgets never call the server. Lock-screen widgets show only the streak and today's status. Links open the app: `pranaveda://talk` (the chat, already listening), `pranaveda://ritual/<id>`, `pranaveda://you`. The free personal Apple team can sign the App Group.
- Practice in progress (Live Activity, `Shared/PracticeActivity.swift`, `Features/Practice/PracticeLiveActivity.swift`, `PranaVedaWidgets/PracticeWidgets.swift`): while a ritual or breathwork runs, the lock screen and Dynamic Island show the pose or breath phase, where you are ("Posture 2 of 5", "Cycle 3 of 6") and a countdown that runs on its own; paused shows the time left. Updated at each pose or phase and on pause, ended when the practice finishes or closes; tapping it returns to the practice. Local only (no push), so no paid account is needed. If Live Activities are off in Settings it does nothing.
- Talk to Amrita control (iOS 18+): a Control Center, lock-screen and Action-button control. It runs `TalkToAmritaIntent` in the app (`Shared/PranaVedaIntents.swift`), which opens the chat already listening; a control can't reliably open the app's own `pranaveda://` link itself. Its icon is the PranaVeda lotus as a custom SF Symbol (`PranaVedaWidgets/Assets.xcassets/lotus.symbolset`), since controls only show single-colour symbols, not the app icon.
- Siri and Shortcuts (`App/PranaVedaShortcuts.swift`), ready without setup: "Hey Siri, talk to Amrita" (Siri also knows the app as "Amrita", `INAlternativeAppNames`), and "Hey Siri, start my practice in PranaVeda", which begins the newest saved ritual's guided practice, or opens the Library when nothing is saved (`pranaveda://practice`).
- Accessibility: text grows with the text-size setting up to the largest accessibility sizes. Small uppercase labels, the calendar's month grid and Google's sign-in button stop at the first accessibility size so they never break mid-word or get cut off; everything they say is also shown or spoken in full. With Reduce Motion, the breathing circle holds still and shows each phase by colour, and the chat jumps instead of gliding. Card titles and the greeting are VoiceOver headings, and every icon button has a spoken label.
- "Hey Amrita" (`Features/Voice/HeyAmrita.swift`), off until you turn it on with the ear button on Ask Amrita or a practice screen. While the chat or a practice is on screen and the app is open, the phone listens on the device only (`requiresOnDeviceRecognition`); nothing is sent anywhere until Amrita answers the chime. On the chat, "Hey Amrita" opens the recording bar. In a practice it takes commands, either in one go ("Hey Amrita, pause") or after the chime: pause/stop/wait, resume/continue, next/skip, back, end. A bare "Hey Amrita" quietens the guide for six seconds so the command can be heard. "Hold" is not a command, since the breathwork guide says it. Listening pauses while recording, while Amrita speaks, in the background and in Low Power Mode. The microphone uses voice processing (echo cancellation) so the guide's own voice doesn't drown you out, with other apps' audio not ducked; the wake-phrase rules are in `WakePhrase` with tests in `HeyAmritaTests`.
- Spoken guidance uses the phone's built-in voice (the website uses ElevenLabs when it is configured); the speaker button on the practice screen turns it off. Practice timing follows the clock, so it stays right if the screen sleeps or the app goes to the background briefly.
