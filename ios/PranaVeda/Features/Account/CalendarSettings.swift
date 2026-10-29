import SwiftUI

/// Turn on the phone's calendar for Amrita, and free-time reminders. The copy
/// says what she sees, because that is the promise: when, never what.
struct CalendarSettings: View {
    let calendar: CalendarStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Calendar").sectionLabel().accessibilityAddTraits(.isHeader)
            Text("Practice that fits your day").font(Theme.heading()).foregroundStyle(Theme.ink)
            Text("PranaVeda reads this phone's calendars, including Google or Outlook ones synced to it, for when you are busy. Amrita sees only busy and free times for today and tomorrow, never what your events are. All-day events don't count as busy.")
                .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            HStack(alignment: .center, spacing: 12) {
                Text(status).font(Theme.quote.italic()).foregroundStyle(Theme.stone700)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if calendar.blocked {
                    settingsButton
                } else {
                    Button(calendar.enabled ? "Turn off" : "Turn on") {
                        if calendar.enabled { calendar.disable() } else { Task { await calendar.enable() } }
                    }
                    .buttonStyle(PillButton(primary: !calendar.enabled))
                }
            }
            if calendar.enabled && !calendar.blocked {
                Divider().overlay(Theme.stone200)
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Free-time reminders").font(Theme.serif(.body)).foregroundStyle(Theme.ink)
                        Text(remindersDetail).font(Theme.caption).foregroundStyle(Theme.stone500)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if calendar.remindersBlocked {
                        settingsButton
                    } else {
                        Button(calendar.remindersOn ? "Turn off" : "Turn on") {
                            Task { await calendar.setReminders(!calendar.remindersOn) }
                        }
                        .buttonStyle(PillButton(primary: !calendar.remindersOn))
                        .accessibilityLabel(calendar.remindersOn ? "Turn off free-time reminders" : "Turn on free-time reminders")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private var settingsButton: some View {
        Button("Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
            .buttonStyle(PillButton(primary: false))
    }

    private var status: String {
        if calendar.blocked { return "Calendar access is off for PranaVeda. Allow full access in Settings, then come back." }
        if !calendar.enabled { return "Off. Amrita doesn't know when you are busy." }
        return calendar.contextForAmrita?.now.appending(".") ?? "Reading your calendar…"
    }

    private var remindersDetail: String {
        if calendar.remindersBlocked { return "Notifications are off for PranaVeda. Allow them in Settings." }
        return "A gentle note in open time between 7 AM and 10 PM: never in a commitment, at most every three hours."
    }
}
