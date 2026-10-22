# PranaVeda for Android (prototype)

A Jetpack Compose prototype of the native Android app, matching the iOS
prototype before sign-in: Amrita's chat streaming from the existing
`/api/chat` (as a guest, with the wellness profile kept on the device), Amrita's daily insight
(a short reflection from `/api/insight`, once per launch) above the chat, speaking to Amrita (the phone's speech recognition, with her reply read aloud by her ElevenLabs voice when the server has one, else the phone's own voice; asks for microphone permission the first time), ritual,
breathwork, dosha and answer-option cards, and a Library of every pose from
`/api/catalog` with Niral's room scenes, a Dosha tab (the Prakriti Amrita
assessed, with the balancing guide from `/api/dosha-guide`, as on the website's
Dosha Profile screen), guided practice (a ritual's poses one at a time with
a timer and spoken guidance, and a breathwork pacer) with a practice log and
streak that sync with the account (shown on a practice calendar in the "You" tab, as on the website, with Recovery & Trends under it: this week and last, minutes each of the last 8 weeks split by rituals and breathwork, current and longest streak, and the balance between the two; then Heart & sleep: sleep, resting heart rate and heart-rate variability from Health Connect over 14 days with practice days shaded, read on the phone after permission and never sent anywhere; real data only), saved
rituals (bookmarked from any ritual; kept on the device, and in the account while signed in, so they follow you to the website and your other devices), and optional Google sign-in (the "You"
tab) that shares the wellness profile with the website and the iOS app.

## Requirements

- Android Studio (its bundled JDK runs Gradle) with the Android SDK. The build
  compiles against API 37.2 and fetches that platform itself the first time.
- An emulator or phone on Android 8.0 (API 26) or later
- The PranaVeda server running locally (`npm run dev` in the repo root, with `ANTHROPIC_API_KEY` set)

## Build and run

Open the `android/` folder in Android Studio and run the `app` configuration,
or from a terminal:

```bash
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew installDebug
```

The emulator reaches the Mac at `10.0.2.2`, so by default the app talks to the
local server at `http://10.0.2.2:3000`.

On Android 17 (API 37) and later, the first launch asks to allow access to
devices on the local network (shown as "Nearby devices"): allow it, or the app
cannot reach the dev server. Only debug builds ask for this permission, and
only when the server address is on the local network.

## On your own phone

Put your Mac's network name in `android/local.properties` (git ignores it):

```properties
pv.apiBaseUrl=http://Your-Mac.local:3000
```

Then turn on USB debugging on the phone, connect it, and run `./gradlew installDebug`.
The phone must be on the same Wi-Fi as the Mac.

Tests (stream parsing, decoding of the server's events and cards, and the API
client against a stand-in server):

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew testDebugUnitTest
```

## Google sign-in

- The app asks Google for an ID token issued to the **web** OAuth client (`pv.googleWebClientId`, defaulting to the one in `app/build.gradle.kts`). Android's Credential Manager requires that, and the server already accepts it, so the server needs no Android-specific setting.
- Google recognises the app through a separate **Android** OAuth client in the same Google Cloud project, registered for package `com.pranaveda.app` and the SHA-1 of the signing key. The one there now is for the debug key (`~/.android/debug.keystore`); a release build signed with another key needs its own Android client. Without a matching one, sign-in fails with a "developer error".
- The emulator needs a Google account signed in. Use a system image "with Google Play" or "with Google APIs".
- The session's refresh token is encrypted with a key in the Android Keystore and is left out of backups. The access token is kept only in memory.

## Notes

- The app icon is the website's lotus (`src/assets/pranaveda_icon.svg`), converted to vector drawables, on the app's soft gradient (an adaptive icon with a monochrome layer for themed icons).
- Widgets (Jetpack Glance, `widget/`): "Today" (streak, whether you have practised today, the day's reflection, Talk to Amrita, the newest saved ritual) and "This week" (practice days as dots), resizable. The app saves a snapshot to `files/widget-snapshot.json` whenever the practice log, saved rituals or the reflection change and redraws the widgets; widgets never call the server. They draw with the system's serif and sans (Glance cannot load the app's fonts). Links open the app: `pranaveda://talk` (the chat, already listening), `pranaveda://ritual/<id>`, `pranaveda://you`.
- Practice in progress (`practice/PracticeNotice.kt`): while a ritual or breathwork runs, a silent ongoing notification shows the pose or breath phase, where you are and a countdown that runs on its own ("Paused · 1:05 left" when paused); on Android 16+ it asks to show as a Live Update (status-bar chip). Notification permission is asked once, on the first practice. Tapping it returns to the practice; it goes when the practice finishes or closes.
- Talk to Amrita Quick Settings tile (`widget/TalkTileService.kt`): add it from the Quick Settings edit screen; it opens `pranaveda://talk` (unlocking first if needed).
- App shortcuts (long-press the app icon, `res/xml/shortcuts.xml`): "Talk to Amrita" (`pranaveda://talk`) and "Start my practice" (`pranaveda://practice`: the newest saved ritual's guided practice, or the Library when nothing is saved). No "Hey Google" phrases: Gemini, now the Pixel's assistant, doesn't reliably run App Actions, and they can only be tested once the app is in the Play Console.
- Light only, as on iOS: the system's dark theme does not change the design. All text sizes are in `sp`, so text follows the system font size. Tab labels stop at 130% so "Ask Amrita" fits. With Remove animations on, the breathing circle holds still and shows each phase by colour, the recording waves stop easing, and the chat jumps instead of gliding. Card titles and the greeting are TalkBack headings.
- Plain `http` is allowed only for `10.0.2.2`, `localhost` and `*.local` (`res/xml/network_security_config.xml`); everything else needs https.
- Image addresses from the API are either full addresses or site paths (`/poses/cobra.jpg`); paths are resolved against the API's address (`AppConfig.resolve`).
- The web app's fonts are bundled: Playfair Display for headings and quotes, Plus Jakarta Sans for text (`res/font`; SIL Open Font License, shipped in `assets/licenses`).
- "Hey Amrita" (`voice/HeyAmrita.kt`, Android 13+ with an on-device recogniser), off until you turn it on with the ear button on Ask Amrita or a practice screen. Same behaviour and wake-phrase rules (`voice/WakePhrase.kt`, tested in `HeyAmritaTest`) as on iOS. The app records the microphone itself (`VOICE_COMMUNICATION` with the echo canceller and noise suppressor) and feeds it to the on-device recogniser through a pipe (`EXTRA_AUDIO_SOURCE`, a segmented session), so the guide's voice is cancelled and no audio leaves the phone. Listening pauses while recording, while Amrita speaks, in the background and with Battery Saver on.
- Spoken guidance uses the phone's built-in voice (the website uses ElevenLabs when it is configured); the speaker button on the practice screen turns it off. Practice timing follows the clock, so it stays right if the screen sleeps or the app goes to the background briefly.
