import Foundation
import Testing
@testable import PranaVeda

/// Heart rate across a practice, summarised as the website does
/// (summarizeSession in src/hooks/useHeartRateMonitor.ts) and kept with the
/// practice in the same shape.
struct HeartSummaryTests {
    @Test func startAndEndAreTheOpeningAndClosingFifths() throws {
        // 20 readings: fifths of 4, easing down from 80 to 61.
        let bpms = Array(stride(from: 80, to: 60, by: -1))
        let summary = try #require(HeartSummary.summarize(bpms))
        #expect(summary.startBpm == 79) // (80+79+78+77)/4 = 78.5, rounded up as JavaScript does
        #expect(summary.endBpm == 63)   // (64+63+62+61)/4 = 62.5
        #expect(summary.avgBpm == 71)   // 70.5
        #expect(summary.minBpm == 61)
        #expect(summary.maxBpm == 80)
        #expect(summary.rmssd == nil)
    }

    @Test func aShortSessionUsesAtLeastThreeReadingsAtEachEnd() throws {
        let summary = try #require(HeartSummary.summarize([90, 88, 86, 70, 70, 70, 70, 60, 62, 64]))
        #expect(summary.startBpm == 88)
        #expect(summary.endBpm == 62)
    }

    @Test func tooFewReadingsSayNothing() {
        #expect(HeartSummary.summarize(Array(repeating: 70, count: 9)) == nil)
        #expect(HeartSummary.summarize([]) == nil)
    }

    @Test func theNoteMatchesTheWebsite() {
        let summary = HeartSummary(startBpm: 78, endBpm: 64, avgBpm: 70, minBpm: 62, maxBpm: 80)
        #expect(summary.movedNote(kind: .breathwork) == "Your heart rate moved from 78 to 64 bpm across this breathwork.")
        #expect(summary.movedNote(kind: .ritual) == "Your heart rate moved from 78 to 64 bpm across this practice.")
    }

    @Test func aPracticeKeepsItsHeartReadingsInTheWebsitesShape() throws {
        var entry = PracticeLog.newEntry(kind: .breathwork, title: "Box", durationMinutes: 4, result: nil)
        entry.heart = HeartSummary(startBpm: 78, endBpm: 64, avgBpm: 70, minBpm: 62, maxBpm: 80)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as? [String: Any]
        let heart = try #require(json?["heart"] as? [String: Int])
        #expect(heart == ["startBpm": 78, "endBpm": 64, "avgBpm": 70, "minBpm": 62, "maxBpm": 80])

        let website = #"{"id":"p_1","kind":"ritual","title":"Morning","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":10,"heart":{"startBpm":70,"endBpm":62,"avgBpm":65,"minBpm":60,"maxBpm":72,"rmssd":41}}"#
        let read = try JSONDecoder().decode(PracticeLogEntry.self, from: Data(website.utf8))
        #expect(read.heart == HeartSummary(startBpm: 70, endBpm: 62, avgBpm: 65, minBpm: 60, maxBpm: 72, rmssd: 41))
    }
}
