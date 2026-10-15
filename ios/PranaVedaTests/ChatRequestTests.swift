import Foundation
import Testing
@testable import PranaVeda

struct ChatRequestTests {
    /// 19:11 on Oct 14 in California is already Oct 15 in UTC.
    let californiaEvening = ISO8601DateFormatter().date(from: "2026-10-15T02:11:00Z")!

    @Test func localDateIsTheDevicesOwnDayNotUTCs() {
        #expect(ChatViewModel.localDate(californiaEvening, in: TimeZone(identifier: "America/Los_Angeles")!) == "2026-10-14")
        #expect(ChatViewModel.localDate(californiaEvening, in: TimeZone(identifier: "UTC")!) == "2026-10-15")
        #expect(ChatViewModel.localDate(californiaEvening, in: TimeZone(identifier: "Asia/Kolkata")!) == "2026-10-15")
    }

    @Test func localDateIsZeroPadded() {
        let earlyJanuary = ISO8601DateFormatter().date(from: "2027-01-05T12:00:00Z")!
        #expect(ChatViewModel.localDate(earlyJanuary, in: TimeZone(identifier: "UTC")!) == "2027-01-05")
    }

    @Test func requestSendsLocalDateBesideLocalTime() throws {
        let request = APIClient.ChatRequest(
            messages: [.init(role: "user", content: "Hello")],
            profile: .object([:]),
            localTime: "10/14/2026, 7:11:00 PM",
            localDate: "2026-10-14",
            previousSession: nil
        )
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        #expect(json["localDate"] as? String == "2026-10-14")
        #expect(json["localTime"] as? String == "10/14/2026, 7:11:00 PM")
    }
}
