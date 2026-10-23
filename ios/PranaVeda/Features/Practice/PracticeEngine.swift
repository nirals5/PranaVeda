import Foundation

// The timing and the words of a guided practice, kept apart from the screens
// so they can be tested. They follow the website's player
// (src/components/CoachingDashboard.tsx).

/// How long a pose is held, from its duration text: "2 minutes" → 120 s,
/// "5 breaths" → 30 s (6 s a breath), "30 seconds" → 30 s; 2 minutes when
/// there is no number.
func poseSeconds(_ duration: String?) -> Int {
    guard let duration else { return 120 }
    let digits = duration.drop { !$0.isNumber }.prefix { $0.isNumber }
    guard let number = Int(digits), number > 0 else { return 120 }
    let lower = duration.lowercased()
    if lower.contains("breath") { return number * 6 }
    if lower.contains("sec") { return number }
    return number * 60
}

/// "1:05"
func clockString(_ seconds: Int) -> String {
    String(format: "%d:%02d", max(seconds, 0) / 60, max(seconds, 0) % 60)
}

/// Moves through a ritual's poses, each held for its own time.
struct PoseSequence: Equatable {
    enum Event: Equatable { case enteredPose(Int), finished }

    let durations: [Int]
    private(set) var index = 0
    /// Seconds left in the current pose.
    private(set) var remaining: Double
    private(set) var isFinished = false

    init(durations: [Int]) {
        self.durations = durations.isEmpty ? [120] : durations
        remaining = Double(self.durations[0])
    }

    var secondsLeft: Int { Int(remaining.rounded(.up)) }

    /// Time passes; returns what happened, in order.
    mutating func advance(by seconds: Double) -> [Event] {
        guard !isFinished else { return [] }
        var events: [Event] = []
        var left = seconds
        while left > 0 && !isFinished {
            if left < remaining {
                remaining -= left
                left = 0
            } else {
                left -= remaining
                events.append(contentsOf: goNext())
            }
        }
        return events
    }

    mutating func next() -> [Event] { isFinished ? [] : goNext() }

    mutating func previous() -> [Event] {
        guard !isFinished, index > 0 else { return [] }
        index -= 1
        remaining = Double(durations[index])
        return [.enteredPose(index)]
    }

    private mutating func goNext() -> [Event] {
        if index + 1 < durations.count {
            index += 1
            remaining = Double(durations[index])
            return [.enteredPose(index)]
        }
        isFinished = true
        remaining = 0
        return [.finished]
    }
}

/// Paces breathwork: inhale, hold, exhale, rest, for the pattern's cycles.
/// Holds of zero seconds are skipped.
struct BreathPacer: Equatable {
    enum Phase: String, Equatable, CaseIterable { case inhale, holdFull, exhale, holdEmpty }
    enum Event: Equatable { case phase(Phase, seconds: Int, cycle: Int), finished }

    let steps: [(phase: Phase, seconds: Int)]
    let cycles: Int
    private(set) var step = 0
    private(set) var cycle = 1
    private(set) var remaining: Double
    private(set) var isFinished = false

    init(_ pattern: BreathworkPattern) {
        let all: [(Phase, Double)] = [(.inhale, pattern.inhale), (.holdFull, pattern.holdActive), (.exhale, pattern.exhale), (.holdEmpty, pattern.holdEmpty)]
        let steps = all.compactMap { phase, seconds in seconds > 0 ? (phase: phase, seconds: max(1, Int(seconds.rounded()))) : nil }
        self.steps = steps.isEmpty ? [(.inhale, 4), (.exhale, 4)] : steps
        cycles = max(1, pattern.cycles)
        remaining = Double(self.steps[0].seconds)
    }

    static func == (a: BreathPacer, b: BreathPacer) -> Bool {
        a.step == b.step && a.cycle == b.cycle && a.remaining == b.remaining && a.isFinished == b.isFinished
            && a.cycles == b.cycles && a.steps.map(\.phase) == b.steps.map(\.phase) && a.steps.map(\.seconds) == b.steps.map(\.seconds)
    }

    var phase: Phase { steps[step].phase }
    var phaseSeconds: Int { steps[step].seconds }
    var secondsLeft: Int { Int(remaining.rounded(.up)) }
    /// Whole minutes the practice takes, at least one (as the website logs it).
    var totalMinutes: Int { max(1, Int((Double(steps.map(\.seconds).reduce(0, +) * cycles) / 60).rounded())) }

    /// The event that starts the practice.
    var startEvent: Event { .phase(phase, seconds: phaseSeconds, cycle: cycle) }

    mutating func advance(by seconds: Double) -> [Event] {
        guard !isFinished else { return [] }
        var events: [Event] = []
        var left = seconds
        while left > 0 && !isFinished {
            if left < remaining {
                remaining -= left
                left = 0
            } else {
                left -= remaining
                if step + 1 < steps.count {
                    step += 1
                } else if cycle < cycles {
                    step = 0
                    cycle += 1
                } else {
                    isFinished = true
                    remaining = 0
                    events.append(.finished)
                    break
                }
                remaining = Double(steps[step].seconds)
                events.append(.phase(phase, seconds: phaseSeconds, cycle: cycle))
            }
        }
        return events
    }
}

/// What the guide says, word for word as on the website. A pause marker
/// `<break time="1.2s" />` (ElevenLabs markup there) becomes a silence here.
enum Guidance {
    /// "Warrior II" → "Warrior Two"
    static func speakableName(_ name: String) -> String {
        name.replacingOccurrences(of: #"\bIII\b"#, with: "Three", options: .regularExpression)
            .replacingOccurrences(of: #"\bII\b"#, with: "Two", options: .regularExpression)
            .replacingOccurrences(of: #"\bI\b"#, with: "One", options: .regularExpression)
    }

    /// A 1.4 s pause after each sentence, so there is time to move into position.
    static func paced(_ text: String) -> String {
        text.replacingOccurrences(of: #"\.\s+"#, with: ". <break time=\"1.4s\" /> ", options: .regularExpression)
    }

    /// The caution note (G13), said before the instructions.
    static func takeCare(_ caution: String?) -> String {
        caution.map { "Take care. \($0) <break time=\"0.8s\" /> " } ?? ""
    }

    static func startPose(_ pose: YogaPose) -> String {
        let also = pose.nameSanskrit.map { ", or \(speakableName($0))" } ?? ""
        return "Starting posture: \(speakableName(pose.nameEnglish))\(also). <break time=\"1.2s\" /> \(takeCare(pose.caution))\(paced(pose.instructions ?? ""))"
    }

    static func enterPose(_ pose: YogaPose) -> String {
        "Entering posture: \(speakableName(pose.nameEnglish)). <break time=\"1.2s\" /> \(takeCare(pose.caution))\(paced(pose.instructions ?? ""))"
    }

    static func returnToPose(_ pose: YogaPose) -> String {
        "Returning to posture: \(speakableName(pose.nameEnglish)). <break time=\"1.2s\" /> \(takeCare(pose.caution))\(paced(pose.instructions ?? ""))"
    }

    static let ritualComplete = "Yoga ritual completed. Sit quietly and feel the light of integration."

    static func beginBreathwork(_ name: String, caution: String? = nil) -> String {
        "Beginning the nourishing practice of \(name)" + (caution.map { ". <break time=\"0.8s\" /> Take care. \($0)" } ?? "")
    }

    static func breathworkComplete(_ name: String) -> String {
        "Beautiful. <break time=\"0.8s\" /> You've completed your \(name). <break time=\"0.8s\" /> Rest here, and let your breath return to its natural rhythm."
    }

    /// Breath cues must fit the breath: longer phases get longer words.
    static func cue(for phase: BreathPacer.Phase, seconds: Int) -> String {
        let variants: [String] = switch phase {
        case .inhale: ["Breathe in", "Inhale slowly", "Inhale slowly, drawing in calm"]
        case .holdFull: ["Hold", "Hold, steady", "Hold the breath, soft and steady"]
        case .exhale: ["Release", "Exhale slowly", "Exhale fully, letting the day go"]
        case .holdEmpty: ["Rest", "Rest, empty", "Rest in the quiet emptiness"]
        }
        return seconds >= 7 ? variants[2] : seconds >= 5 ? variants[1] : variants[0]
    }

    /// Splits text at its pause markers: the words to say, each followed by a
    /// pause in seconds.
    static func script(_ text: String) -> [(words: String, pauseAfter: Double)] {
        let pattern = try! NSRegularExpression(pattern: #"<break\s+time="([\d.]+)s"\s*/>"#)
        var parts: [(String, Double)] = []
        var start = text.startIndex
        for match in pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let whole = Range(match.range, in: text), let seconds = Range(match.range(at: 1), in: text) else { continue }
            parts.append((String(text[start..<whole.lowerBound]), Double(text[seconds]) ?? 0))
            start = whole.upperBound
        }
        parts.append((String(text[start...]), 0))
        return parts
            .map { (words: $0.0.trimmingCharacters(in: .whitespacesAndNewlines), pauseAfter: $0.1) }
            .reduce(into: []) { result, part in
                if part.words.isEmpty, !result.isEmpty { result[result.count - 1].pauseAfter += part.pauseAfter }
                else if !part.words.isEmpty { result.append(part) }
            }
    }
}
