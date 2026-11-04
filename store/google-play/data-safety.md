# Google Play: Data safety answers

For Play Console → Policy → App content → **Data safety**. Answers describe the
Android app (`com.pranaveda.app`) with the production server, and match
`public/privacy.html`. Re-check them whenever a feature changes what leaves
the phone.

How Play counts things:
- **Collected** means data leaves the phone and reaches our server or a
  provider acting for us, even if it isn't stored ("processed ephemerally").
- **Shared** means it goes to a third party for its own use. Providers that
  process data only for us (Anthropic, Vercel, Neon, Google sign-in, MET
  Norway, Apple WeatherKit, ElevenLabs) are not "sharing".
- Data that never leaves the phone (Health Connect readings, precise location
  matched against saved places, the calendar itself) is **not collected**.

## Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in the app (You → Delete account) and on the web: https://pranaveda.app/support#delete-account |
| Data shared with third parties? | **No** for every type below |

## Data types collected

All are **optional** for the user unless marked otherwise, none is shared, and
none is used for advertising, marketing, analytics or fraud prevention.

| Category → type | Collected when | Ephemeral? | Purposes |
|---|---|---|---|
| Personal info → **Name** | Signing in with Google (optional) | No, kept with the account | App functionality, Account management |
| Personal info → **Email address** | Signing in with Google (optional) | No | App functionality, Account management |
| Personal info → **User IDs** | Signing in with Google (optional); the account's own ID | No | App functionality, Account management |
| Personal info → **Other info** | The wellness profile Amrita keeps (name she's told, dosha, experience, goals) when signed in; without an account it stays on the phone | No | App functionality, Personalization |
| Health and fitness → **Health info** | Conditions mentioned to Amrita (e.g. an injury) in the profile; the opt-in sleep and heart summary sent with a message; a practice's heart-rate summary in the practice log when signed in | Summaries sent with messages: yes. Profile and practice log: no | App functionality, Personalization |
| Health and fitness → **Fitness info** | The practice log (what was practised, when, how it felt) when signed in | No | App functionality, Personalization |
| Location → **Approximate location** | Estimated from the network address on every request, rounded to about 10 km, to look up the weather | **Yes** (not stored) | App functionality, Personalization |
| Location → **Precise location** | Only if "Places on your account" is turned on: saved places are kept on the account, encrypted | No | App functionality |
| Messages → **Other in-app messages** | Messages to Amrita, sent to our server and Anthropic to get her reply; not stored on our servers | **Yes** | App functionality |
| Calendar → **Calendar events** | Only busy/free times for today and tomorrow, sent with a message if the calendar is connected; never titles or details | **Yes** | App functionality, Personalization |
| App activity → **Other user-generated content** | Saved rituals, when signed in | No | App functionality |
| Device or other IDs | **Not collected** (the account's session list keeps device type, OS and app version, which are not device IDs) | | |

**Not collected:** photos and videos, audio (speech recognition runs through
the phone's own service; we receive only text), contacts, files, web browsing,
financial info, app info and performance (no analytics or crash reporting),
installed apps, SMS, call logs.

Amrita's spoken voice sends the text of *her* replies to ElevenLabs, which is
not user data.
