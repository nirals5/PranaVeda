# Store listings

Everything typed or uploaded into App Store Connect and the Google Play Console
lives here, so a listing can be rebuilt from the repo. Text fields are plain
`.txt` files: paste them as they are (they are within each store's limits).

## App Store Connect

| Field | Paste / upload | Limit |
|---|---|---|
| Name | `app-store/name.txt` | 30 |
| Subtitle | `app-store/subtitle.txt` | 30 |
| Promotional text | `app-store/promotional-text.txt` | 170 |
| Description | `app-store/description.txt` | 4000 |
| Keywords | `app-store/keywords.txt` (words already in the name are left out; Apple searches the name anyway) | 100 |
| Support URL | https://pranaveda.app/support | |
| Marketing URL | https://pranaveda.app | |
| Privacy Policy URL | https://pranaveda.app/privacy | |
| Category | Primary: Health & Fitness. Secondary: Lifestyle | |
| Copyright | 2026 Hetan Shah | |
| iPhone 6.3" screenshots (required) | `app-store/screenshots/iphone-6.3/` (1206 × 2622), in order. Goes in "iPhone with Dynamic Island (medium display)" | up to 10 |
| iPhone 6.9" screenshots (optional) | `app-store/screenshots/iphone-6.9/` (1320 × 2868), the same shots at full size, for "large display" in Media Manager | up to 10 |
| iPad 13" screenshots | `app-store/screenshots/ipad-13/` (2064 × 2752), in order | up to 10 |
| Apple Watch screenshots | **Still to do**, see below | |

Apple now requires the 6.1"/6.3" "medium display" iPhone size (6.9" is optional)
and the 13" iPad size; it scales those down for the smaller devices. The 6.3" set
is the 6.9" set scaled with `sips -z 2622 1206` (the two shapes differ by under
0.1%). Screenshots are dragged in by hand: the built-in browser can't upload
files.

**App Review notes** (App Review Information → Notes):

> No account is needed: every feature works as a guest. Sign in with Apple or
> Google is optional and only syncs the wellness profile between devices. To
> see the core flow, tap "I haven't been sleeping well lately" on the first
> screen and answer Amrita's questions; she replies with a practice card. Amrita
> is an AI guide (Anthropic's Claude). Apple Health, location, calendar,
> microphone and notifications are all optional and asked for only when used.

### Age rating (App Store Connect → App Information → Age Rating)

Answer **None / No** to everything except:

- **Medical or Treatment Information:** Infrequent/Mild (general wellness and
  yoga guidance; the app says it is not medical advice).
- **Health or wellness topics:** Yes.

There is no user-to-user messaging (the chat is with the AI guide only), no
unrestricted web access, no gambling, no contests and no purchases. Expect
**13+**, which matches the privacy policy ("not meant for children under 13").
If the questionnaire lands lower, use the age rating override to choose 13+.

## Google Play Console

| Field | Paste / upload | Limit |
|---|---|---|
| App name | `google-play/title.txt` | 30 |
| Short description | `google-play/short-description.txt` | 80 |
| Full description | `google-play/full-description.txt` (no Apple Watch or Sign in with Apple lines) | 4000 |
| App icon | `google-play/graphics/icon-512.png` (512 × 512) | |
| Feature graphic | `google-play/graphics/feature-graphic.png` (1024 × 500) | |
| Phone screenshots | `google-play/screenshots/phone/` (1080 × 1920, 9:16), in order | 2–8 |
| Category | Health & Fitness | |
| Contact email | info@pranaveda.app | |
| Website | https://pranaveda.app | |
| Privacy policy | https://pranaveda.app/privacy | |

### Content rating (Policy → App content → Content rating, IARC)

- Category: **All other app types**.
- Violence, sexuality, language, controlled substances, gambling: **No**.
- Users interact or exchange content with each other: **No** (the chat is with
  the AI guide only).
- Shares the user's location with other users: **No**.
- Digital purchases: **No**.

Expect *Everyone* / PEGI 3. Separately, under **Target audience and content**,
choose **13–15, 16–17 and 18+** only (not under 13), as the privacy policy
says, which also keeps the app out of the Families policy.

Data safety and the Health Connect declaration are KAN-12 and KAN-13.

## How the assets were made

- **Screenshots**: the real apps, guest (not signed in), with a clean 9:41
  status bar.
  - iPhone and iPad: Debug builds in the iPhone 18 Pro Max and iPad Pro 13" (M5)
    simulators, against the local dev server (`xcrun simctl status_bar …
    override --time 9:41`).
  - Android: the `production` build type on an emulator set to 1080 × 1920
    (`adb shell wm size 1080x1920`; Play rejects screenshots taller than 2:1),
    with System UI demo mode for the status bar.
  - Saved as JPEG (quality 90) to keep the repo small; both stores accept JPEG.
- **Play icon**: `ios/PranaVeda/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`
  scaled to 512 with `sips -z 512 512`.
- **Feature graphic**: `source/feature-graphic.html` (Niral's Triangle room
  scene beside the name), rendered with headless Chrome:

  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1024,500 --virtual-time-budget=8000 --screenshot="$PWD/google-play/graphics/feature-graphic.png" "file://$PWD/source/feature-graphic.html"
  ```

## Still to do

- **Apple Watch screenshots.** The Watch app ships inside the iOS build, so App
  Store Connect asks for at least one. No watchOS simulator runtime is
  installed here; take one on the paired Apple Watch during a guided practice
  (Xcode → Devices and Simulators → Take Screenshot), or install the watchOS
  runtime and use a simulator.
- **Photos for the poses that still use stock pictures**: Mountain, Warrior II,
  Tree, Easy Pose, Seated Forward Bend, Bound Angle and Supine Spinal Twist.
  The screenshots avoid them where possible.
