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

A Release build talks to production (`https://pranaveda.app`), so it
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

## TestFlight and the App Store

The App Store build is a Release archive. It talks to production and is signed
for distribution when it is uploaded. The app record in App Store Connect
(apps → +, bundle id `com.pranaveda.app`) must exist first.

Each upload needs a higher build number (`CURRENT_PROJECT_VERSION` in
`project.yml`). A new version for the store also raises `MARKETING_VERSION`.
Pass them for one build instead of editing the file, then raise the number in
`project.yml` to match once the build is uploaded.

Store builds use the released Xcode, not a beta: App Store Connect rejects beta
SDKs, and only a 27.3 SDK compiles the Siri developer-preview code (`SIRI_AI`).
If `xcode-select` points at a beta, prefix both commands with
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. Build 4 of 1.0 was
archived this way with Xcode 27.2.

```bash
xcodebuild -project PranaVeda.xcodeproj -scheme PranaVeda -configuration Release -destination 'generic/platform=iOS' -archivePath build/PranaVeda.xcarchive -allowProvisioningUpdates CURRENT_PROJECT_VERSION=2 archive
```

```bash
xcodebuild -exportArchive -archivePath build/PranaVeda.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/export -allowProvisioningUpdates
```

The upload uses the Apple account signed in to Xcode (Settings → Accounts).
App Store Connect processes the build in 5 to 30 minutes, then it appears under
TestFlight. Testers in your own team (internal testers) can install it right away
through the TestFlight app. External testers need Apple's beta review first.

The app is iPhone and iPad, portrait only. On iPad it runs full screen
(`UIRequiresFullScreen`), because App Store Connect accepts a portrait-only iPad
app only when it opts out of Split View and Slide Over. It declares only exempt
encryption (HTTPS, `ITSAppUsesNonExemptEncryption = NO`), so builds don't wait
for the export-compliance question.

## Sign in with Apple

On by default (`PV_APPLE_SIGN_IN = YES` in `Configuration/App.xcconfig`): the
app is signed by PranaVeda's paid Apple Developer team, and App Review requires
it alongside Google sign-in. The build carries the Sign in with Apple capability
(`PranaVeda/PranaVeda.entitlements`) and the "You" tab shows Apple's button
above Google's. Building with `-allowProvisioningUpdates` (or Xcode's automatic
signing) adds the capability to the app id the first time.

A free personal team cannot sign it: add `PV_APPLE_SIGN_IN = NO` to
`Configuration/Local.xcconfig` and run `xcodegen` again.

The server, locally (`.env`) and on Vercel, needs:

1. `APPLE_BUNDLE_ID=com.pranaveda.app` and `APPLE_TEAM_ID`: without the bundle
   id it refuses the app's Apple sign-ins.
2. A key from developer.apple.com → Keys with Sign in with Apple for the app id
   `com.pranaveda.app`: its id in `APPLE_KEY_ID`, its `.p8` contents in
   `APPLE_PRIVATE_KEY` (keep the file outside the project), and
   `CONNECTIONS_ENC_KEY`. Together they keep Apple's token, encrypted, so it can
   be revoked when an account is deleted, as Apple requires.

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
- The Library for Siri, Shortcuts and Spotlight (KAN-21, `App/SiriLibrary.swift`), on any iOS the app supports: the Library's poses and follow-along flows can be found by name ("Child's Pose", "Balasana", "Warrior Flow", "a yin video"). **Show a Pose** opens the pose's page (`pranaveda://pose/<id>`); **Play a Yoga Flow** plays the video full screen (`pranaveda://flow/<id>`), also as "Hey Siri, play Warrior Flow in PranaVeda". A flow opened by Siri can have its first play request dropped while Siri still holds the phone's audio, so the player asks again for its first few seconds until the video has started once (`FlowPlayerView`). The explore-only poses are left out, as Amrita leaves them out. Poses are reference pages, so Siri shows one and doesn't "start" it. The entities read the catalog the app last loaded, kept in `Application Support/catalog.json` (`Catalog.saved`), so they work when the app's screens aren't open; the Library is in Spotlight from iOS 18. Apple's analyzer suggests Play a Yoga Flow resembles the system's play-audio action (SMA701); its description says how it differs, and it stays a suggestion.
- What's on screen, for Siri (KAN-21, `siriShows` in `App/SiriLibrary.swift`, iOS 18.4 and later): the views that show a saved ritual, a Library pose or a flow carry that entity's identifier (`appEntityIdentifier`), so "start this one" or "play that flow" means the one in view. Covered: the saved-ritual rows and an open saved ritual, the Library's pose tiles and pose page, and the flow tiles, a pose page's flow links and the playing flow. A ritual that isn't saved has no entity, so nothing is attached to it. The modifier is in the iOS 27 SDK, so it is compiled only with one (`SIRI_ONSCREEN`, set by SDK in `Configuration/App.xcconfig`); CI's Xcode 26 builds the app without it.
- Siri AI (KAN-21, Apple's developer preview in iOS 27.3; `App/SiriIntents.swift`, `App/SiriCards.swift`, `PranaVeda/Skills.skillsbundle`). Only compiled when building with the iOS 27.3 SDK or later: `Configuration/App.xcconfig` sets the `SIRI_AI` condition by SDK, so Xcode 27.2 and CI build the app as before. The app's minimum stays iOS 17.
  - **Tools:** Start My Practice, Ask Amrita, Practice Summary, Show a Pose and Play a Yoga Flow are tools the new Siri may call. They are marked with `extension …: ToolIntent {}` behind `@available(iOS 27.3, *)`, as Apple advises for intents that already ship; the `@AppIntent(.tool)` macro needs iOS 27.3 as the app's minimum.
  - **Property titles carry the meaning** ("Length in Minutes", "Date Saved (YYYY-MM-DD)"): property descriptions also need iOS 27.3 as the minimum. Apple's analyzer lists them as suggestions until then.
  - **Cards:** a saved ritual, the practice summary (`PracticeSummaryEntity`: streak, practices and minutes this week), a Library pose and a flow have cards in PranaVeda's look. iOS draws them ahead of time, so they hold only text and symbols.
  - **App skill:** `wind-down-for-bed` tells Siri what winding down means here: a gentle saved ritual if one suits, otherwise ask Amrita for a short wind-down. Skills are Markdown that Xcode compiles into `Metadata.appintents/Skills.skillsc`; the bundle is listed in `project.yml` as one item (`type: file`), or xcodegen copies the Markdown loose and Siri gets no skills. Xcode 27.2 copies the folder as it is, which does nothing.
  - **Checking a build:** `xcrun sirimetadataanalyzer <PranaVeda.app>` (Xcode 27.3) reports the tools, entities and anything Siri would find unclear. To build with the beta without changing the Mac's default Xcode, prefix `xcodebuild` with `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer`.
  - **Scripted Siri checks** (`PranaVedaSiriEvaluations/`, Apple's SiriEvaluations): 9 requests in 5 groups, covering the practice summary, Ask Amrita, Library poses and flows, starting a saved ritual and the wind-down skill. "Play a yin video" is two turns: Siri asks which flow, and the answer must play it. It must be a UI test target (Apple's rule), needs iOS 27.3 and a real iPhone, so it has its own scheme and isn't in CI. Run it from `ios/` with the phone unlocked and untouched (about 2 minutes; iOS asks for the passcode to turn on Automation Mode the first time). Siri really does each thing: it opens the app, starts a practice, plays flows and sends Amrita a question.

    ```bash
    DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild -project PranaVeda.xcodeproj -scheme PranaVedaSiriEvaluations -configuration Release -destination 'id=<iphone-id>' -allowProvisioningUpdates -parallel-testing-enabled NO test
    ```

    Release, so the app it installs talks to production. The report is in Xcode's Report navigator, or `xcrun xcresulttool export attachments` on the result bundle. A request reported as "the run ended before all of its results arrived" didn't run properly; run it again. Saved rituals must exist on the phone for "Start my practice".
  - **How Siri finds poses, flows and saved rituals:** through Spotlight. Each entity fills in its index entry (`attributeSet`: name, description, keywords such as the kind of flow and its poses). Their queries are deliberately not `EnumerableEntityQuery`, and poses and flows suggest nothing: Siri took only the first 20 of either list, so it never saw the yin flows (the 22nd to 25th) and, asked which flow, matched the answer against those 20 only.
  - **Limits of the preview:** it works in builds run from Xcode and for TestFlight internal testers only, on Apple Intelligence devices, not for App Store or external TestFlight users. Siri reaches the tools when the request names PranaVeda or the app is on screen.
- Accessibility: text grows with the text-size setting up to the largest accessibility sizes. Small uppercase labels, the calendar's month grid and Google's sign-in button stop at the first accessibility size so they never break mid-word or get cut off; everything they say is also shown or spoken in full. With Reduce Motion, the breathing circle holds still and shows each phase by colour, and the chat jumps instead of gliding. Card titles and the greeting are VoiceOver headings, and every icon button has a spoken label.
- "Hey Amrita" (`Features/Voice/HeyAmrita.swift`), off until you turn it on with the ear button on Ask Amrita or a practice screen. While the chat or a practice is on screen and the app is open, the phone listens on the device only (`requiresOnDeviceRecognition`); nothing is sent anywhere until Amrita answers the chime. On the chat, "Hey Amrita" opens the recording bar. In a practice it takes commands, either in one go ("Hey Amrita, pause") or after the chime: pause/stop/wait, resume/continue, next/skip, back, end. A bare "Hey Amrita" quietens the guide for six seconds so the command can be heard. "Hold" is not a command, since the breathwork guide says it. Listening pauses while recording, while Amrita speaks, in the background and in Low Power Mode. The microphone uses voice processing (echo cancellation) so the guide's own voice doesn't drown you out, with other apps' audio not ducked; the wake-phrase rules are in `WakePhrase` with tests in `HeyAmritaTests`.
- Spoken guidance uses the phone's built-in voice (the website uses ElevenLabs when it is configured); the speaker button on the practice screen turns it off. Practice timing follows the clock, so it stays right if the screen sleeps or the app goes to the background briefly.
