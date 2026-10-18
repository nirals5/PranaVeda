# PranaVeda for iOS (prototype)

A SwiftUI prototype of the native iPhone app: Amrita's chat streaming from the
existing `/api/chat` (as a guest, with the wellness profile kept on the
device), Amrita's daily insight
(a short reflection from `/api/insight`, once per launch) above the chat, speaking to Amrita (the phone's speech recognition, with her reply read aloud by her ElevenLabs voice when the server has one, else the phone's own voice; asks for microphone and speech-recognition permission the first time), ritual, breathwork, dosha and answer-option cards, and a Library of
every pose from `/api/catalog` with Niral's room scenes, a Dosha tab (the
Prakriti Amrita assessed, with the balancing guide from `/api/dosha-guide`, as
on the website's Dosha Profile screen), guided practice (a ritual's poses one at a time with
a timer and spoken guidance, and a breathwork pacer) with a practice log and
streak that sync with the account (shown on a practice calendar in the "You" tab, as on the website), saved
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
   for `PV_API_BASE_URL[sdk=iphoneos*]`. Phone builds then reach the dev server
   at `http://<your-mac>.local:3000`; the phone must be on the same Wi-Fi.
2. Run `xcodegen` again, connect the iPhone, turn on Developer Mode on it
   (Settings → Privacy & Security), and run the app on it from Xcode.
3. The first time, iOS asks to allow access to the local network: allow it.

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
- Spoken guidance uses the phone's built-in voice (the website uses ElevenLabs when it is configured); the speaker button on the practice screen turns it off. Practice timing follows the clock, so it stays right if the screen sleeps or the app goes to the background briefly.
