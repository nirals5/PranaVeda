# PranaVeda for iOS (prototype)

A SwiftUI prototype of the native iPhone app: Amrita's chat streaming from the
existing `/api/chat` (as a guest, with the wellness profile kept on the
device), ritual, breathwork, dosha and answer-option cards, and a Library of
every pose from `/api/catalog` with Niral's room scenes, and optional Google
sign-in (the "You" tab) that shares the wellness profile with the website.

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

## Notes

- Google sign-in uses the iOS OAuth client in `Configuration/App.xcconfig` (`PV_GOOGLE_CLIENT_ID`). The server must list the same id in `GOOGLE_CLIENT_ID_IOS`, or it refuses the app's sign-ins. The session's refresh token is kept in the Keychain (this device only); the access token only in memory.

- The app icon is the website's lotus (`src/assets/pranaveda_icon.svg`) on the app's soft background. Regenerate it with `swift scripts/make-app-icon.swift` (run in `ios/`) if the artwork changes.

- Plain `http` is allowed for the local network only (`NSAllowsLocalNetworking`); everything else needs https.
- Image addresses from the API are either full addresses or site paths (`/poses/cobra.jpg`); paths are resolved against the API's address (`AppConfig.resolve`).
- The web app's fonts (Playfair Display, Plus Jakarta Sans) are not bundled yet; the system serif and sans stand in.
