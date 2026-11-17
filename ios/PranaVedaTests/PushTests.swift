import Foundation
import Testing
@testable import PranaVeda

/// Free-time nudges sent by the server through Apple's push service (KAN-31).
@MainActor
struct PushTests {
    /// A development profile's plist, as it sits inside embedded.mobileprovision
    /// (wrapped in a signature, which is skipped).
    private func profile(_ environment: String) -> Data {
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0"><dict><key>Entitlements</key><dict>\
        <key>aps-environment</key><string>\(environment)</string>\
        </dict></dict></plist>
        """
        return Data([0x30, 0x82, 0x01]) + Data(plist.utf8) + Data([0x00, 0xA0])
    }

    @Test func aBuildTalksToTheSandboxOnlyWhenSignedForDevelopment() {
        #expect(PushNudges.environment(provision: profile("development")) == "sandbox")
        #expect(PushNudges.environment(provision: profile("production")) == "production")
        // TestFlight and App Store builds carry no profile.
        #expect(PushNudges.environment(provision: nil) == "production")
    }

    @Test func theTokenIsSentAsLowercaseHex() {
        #expect(PushNudges.hex(Data([0x00, 0xAB, 0x10, 0xff])) == "00ab10ff")
    }

    @Test func aServerNudgeIsKnownByWhereItOpens() {
        #expect(PushNudges.isServerNudge(["url": "/?nudge=1", "aps": ["alert": "x"]]))
        #expect(!PushNudges.isServerNudge(["aps": ["alert": "x"]]))
        #expect(!PushNudges.isServerNudge(["url": "/practice"]))
    }

    @Test func theServerGetsBusyTimesOnlyAndNothingFromAnUnreadCalendar() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let busy = [BusyInterval(start: now.addingTimeInterval(3600), end: now.addingTimeInterval(7200))]
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!

        let read = PushNudges.calendarUpload(trusted: true, busy: busy, now: now, calendar: calendar)
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(read)) as? [String: Any])
        #expect(json["trusted"] as? Bool == true)
        #expect(json["google"] as? Bool == false)
        #expect(json["busy"] as? [[Double]] == [[(now.timeIntervalSince1970 + 3600) * 1000, (now.timeIntervalSince1970 + 7200) * 1000]])
        let twoDays = calendar.date(byAdding: .day, value: 2, to: calendar.startOfDay(for: now))!
        #expect(json["coveredUntil"] as? Double == twoDays.timeIntervalSince1970 * 1000)

        let unread = PushNudges.calendarUpload(trusted: false, busy: busy, now: now, calendar: calendar)
        let empty = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(unread)) as? [String: Any])
        #expect(empty["trusted"] as? Bool == false)
        #expect(empty["busy"] == nil)
        #expect(empty["coveredUntil"] == nil)
    }

    @Test func thePhonePlansNoFreeTimeRemindersWhileTheServerSendsThem() throws {
        let defaults = try #require(UserDefaults(suiteName: "PushTests-\(UUID())"))
        defaults.set(true, forKey: "pranaveda_calendar_enabled")
        defaults.set(true, forKey: "pranaveda_free_time_reminders")
        PushStore.setServerNudges(true, defaults: defaults)
        let store = CalendarStore(defaults: defaults)
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        store.setBusy([], readAt: now)

        store.planReminders(now: now)
        #expect(defaults.data(forKey: "pranaveda_free_time_planned") == nil)

        PushStore.setServerNudges(false, defaults: defaults)
        #expect(!PushStore.serverNudges(defaults: defaults))
    }
}
