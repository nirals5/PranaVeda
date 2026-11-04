# Google Play: App content declarations

Answers for Play Console → Policy → **App content**, besides Data safety
(`data-safety.md`) and the content rating (`../README.md`). Each matches what
the Android app does and `public/privacy.html`.

## Health Connect (KAN-13)

Play reviews every Health Connect permission. PranaVeda asks only to **read**
three types, and never writes to Health Connect.

| Permission | Why PranaVeda needs it (paste as the justification) |
|---|---|
| `READ_SLEEP` | PranaVeda shows how long and how well you slept beside your practice days in its Heart & sleep trends, and, only if you turn on "Let Amrita see my sleep and heart readings", gives Amrita a short summary of last night's sleep against your usual so she can suggest a gentler or more energising practice. |
| `READ_RESTING_HEART_RATE` | PranaVeda charts your resting heart rate over the past weeks next to the days you practised, so you can see how your practice and recovery move together, and, if you opt in, tells Amrita whether today's reading is above or below your usual. |
| `READ_HEART_RATE_VARIABILITY` | PranaVeda charts heart-rate variability (RMSSD) as a recovery signal beside your practice days, and, if you opt in, tells Amrita whether it is higher or lower than usual so she can adjust the intensity of what she suggests. |

Also asked by the form:
- **Core functionality:** Health and fitness, wellness tracking, personalised
  guidance. Readings are processed and kept on the device; only an opt-in
  summary is sent with a message, and it is not stored.
- **Privacy policy:** https://pranaveda.app/privacy (section "Health and
  fitness data").
- **Rationale screen:** `health/HealthPrivacyActivity` (Health Connect links
  to it through `ACTION_SHOW_PERMISSIONS_RATIONALE`).
- Not used for advertising, sold, or used to determine credit or insurance.

## Background location

The app declares `ACCESS_BACKGROUND_LOCATION` for **arrival reminders**: with
the app closed, the phone watches the places the user saved (Google Play
services geofences) and posts a gentle reminder on arriving, for example at
home. It is off by default and asked for only when the user turns the
reminders on. Nothing leaves the phone.

Play Console → App content → **Sensitive app permissions → Location
permissions**:
- **Feature:** "Arrival reminders: a reminder to practise when you arrive at
  a place you saved, such as home."
- **Why background access is needed:** the reminder must fire when the user
  arrives, which is when the app is closed; checking only while the app is
  open could not do that.
- **Video (required, 30 seconds or less):** a screen recording on a phone:
  1. You tab → Location → Turn on; allow location "While using the app".
  2. Save a place ("Home").
  3. Turn on arrival reminders; the system prompt asks for "Allow all the
     time"; choose it.
  4. Close the app; show the reminder notification on arrival (an emulator
     can simulate the location change).
  Upload it to YouTube as **unlisted** and paste the link.

If Play refuses background location, the fallback is to drop arrival
reminders on Android: remove the permission and the reminder switch, and keep
saved places while the app is open.

## Health apps declaration

App content → **Health apps**: tick **Fitness / Activity tracking**, **Sleep
tracking** and **Meditation, mindfulness and stress management**. Not a
medical device; no clinical or diagnostic features.

## Other App content questions

| Section | Answer |
|---|---|
| Privacy policy | https://pranaveda.app/privacy |
| App access | **All functionality is available without special access.** Signing in is optional and only syncs the profile. |
| Ads | **No ads** |
| Target audience and content | Ages **13–15, 16–17, 18+** (not under 13) |
| News app | No |
| COVID-19 contact tracing and status | No |
| Government app | No |
| Financial features | None (until a subscription is added: then declare it under Monetisation, not here) |
| Data safety | See `data-safety.md` |
| Account deletion | In-app: You → Delete account. Web: https://pranaveda.app/support#delete-account |
