import Foundation
import Testing
@testable import PranaVeda

private let reflection = DailyInsight(headline: "Rooted in the evening", quote: "Let the day settle like dust in still water.",
                                      focus: "Evening Grounding", tip: "Sip warm ginger water after dinner.")

/// Stands in for the server: answers from a list, one reply per request, and
/// records what was sent.
private final class FakeInsightServer: @unchecked Sendable {
    var replies: [Result<DailyInsight, Error>]
    private(set) var sent: [(profile: JSONValue, localTime: String)] = []

    init(_ replies: [Result<DailyInsight, Error>]) { self.replies = replies }

    func fetch(_ profile: JSONValue, _ localTime: String) throws -> DailyInsight {
        sent.append((profile, localTime))
        return try replies.removeFirst().get()
    }
}

@MainActor
struct DailyInsightTests {
    @Test func readsTheServersReflectionAndItsStandIn() throws {
        let real = try JSONDecoder().decode(DailyInsight.self, from: Data(#"{"headline":"A","quote":"B","focus":"C","tip":"D"}"#.utf8))
        #expect(real == DailyInsight(headline: "A", quote: "B", focus: "C", tip: "D"))
        #expect(!real.isFallback)
        let standIn = try JSONDecoder().decode(DailyInsight.self, from: Data(#"{"headline":"A","quote":"B","focus":"C","tip":"D","_isFallback":true}"#.utf8))
        #expect(standIn.isFallback)
    }

    @Test func asksOncePerLaunchWithTheProfileAndLocalTime() async {
        let server = FakeInsightServer([.success(reflection)])
        let store = DailyInsightStore { profile, time in try server.fetch(profile, time) }
        #expect(store.state == .loading)
        let profile: JSONValue = .object(["prakriti": .string("Vata-Pitta")])
        await store.loadIfNeeded(profile: profile)
        await store.loadIfNeeded(profile: profile)
        #expect(store.state == .loaded(reflection))
        #expect(server.sent.count == 1)
        #expect(server.sent.first?.profile == profile)
        #expect(server.sent.first?.localTime.isEmpty == false)
    }

    @Test func asksAgainAfterAStandInOrAFailure() async {
        var standIn = reflection
        standIn.isFallback = true
        let server = FakeInsightServer([.success(standIn), .failure(APIError.http(500)), .success(reflection)])
        let store = DailyInsightStore { profile, time in try server.fetch(profile, time) }

        await store.loadIfNeeded(profile: .object([:]))
        #expect(store.state == .loaded(standIn)) // shown, but not kept
        await store.loadIfNeeded(profile: .object([:]))
        #expect(store.state == .unavailable)
        await store.loadIfNeeded(profile: .object([:]))
        #expect(store.state == .loaded(reflection))
        await store.loadIfNeeded(profile: .object([:]))
        #expect(server.sent.count == 3)
    }
}
