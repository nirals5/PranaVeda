import Foundation

/// Heart rate across one practice, as the website records it from a Bluetooth
/// strap (HeartSummary in src/types.ts), so the account's log reads the same
/// on every device. On iPhone the readings come from an Apple Watch
/// (WatchHeart), which doesn't share beat-to-beat intervals live, so `rmssd`
/// is only ever read from other devices' entries.
struct HeartSummary: Codable, Hashable, Sendable {
    let startBpm: Int
    let endBpm: Int
    let avgBpm: Int
    let minBpm: Int
    let maxBpm: Int
    var rmssd: Int? = nil

    /// Fewer readings than this say nothing about a practice.
    static let minSamples = 10

    /// The website's summarizeSession: start and end are the opening and
    /// closing fifths of the session, so one stray reading cannot define either.
    static func summarize(_ bpms: [Int]) -> HeartSummary? {
        guard bpms.count >= minSamples else { return nil }
        // JavaScript's Math.round: halves round up.
        func mean(_ list: ArraySlice<Int>) -> Int { Int((Double(list.reduce(0, +)) / Double(list.count) + 0.5).rounded(.down)) }
        let edge = max(3, bpms.count / 5)
        return HeartSummary(
            startBpm: mean(bpms.prefix(edge)),
            endBpm: mean(bpms.suffix(edge)),
            avgBpm: mean(bpms[...]),
            minBpm: bpms.min()!,
            maxBpm: bpms.max()!
        )
    }

    /// The note after a practice, in the website's words.
    func movedNote(kind: PracticeLogEntry.Kind) -> String {
        "Your heart rate moved from \(startBpm) to \(endBpm) bpm across this \(kind == .breathwork ? "breathwork" : "practice")."
    }
}
