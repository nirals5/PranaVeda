import SwiftUI
import UIKit

/// A ritual's poses, one at a time: the picture, the instructions, a countdown
/// and spoken guidance. Finishing the last pose logs the practice.
struct GuidedPracticeView: View {
    let result: RecommendationResult
    @Environment(\.dismiss) private var dismiss
    @Environment(PracticeStore.self) private var practice
    @State private var sequence: PoseSequence
    @State private var isRunning = true
    @State private var guide = SpeechGuide()
    @State private var finished = false

    init(result: RecommendationResult) {
        self.result = result
        _sequence = State(initialValue: PoseSequence(durations: result.yogaPractice.poses.map { poseSeconds($0.duration) }))
    }

    private var poses: [YogaPose] { result.yogaPractice.poses }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if finished {
                PracticeComplete(
                    title: result.yogaPractice.title,
                    detail: "\(result.yogaPractice.title) is saved to your practice.",
                    breathwork: result.breathwork,
                    result: result,
                    onDone: { dismiss() }
                )
            } else if poses.isEmpty {
                Text("This ritual has no postures to guide.").font(Theme.body).foregroundStyle(Theme.stone700)
            } else {
                player
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            if let first = poses.first { guide.speak(Guidance.startPose(first)) }
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            guide.stop()
        }
        .task(id: isRunning) {
            guard isRunning else { return }
            await runClock { handle(sequence.advance(by: $0)) }
        }
    }

    private var player: some View {
        let pose = poses[sequence.index]
        return VStack(spacing: 0) {
            PracticeTopBar(
                title: "Posture \(sequence.index + 1) of \(poses.count)",
                guide: guide,
                onClose: { dismiss() }
            )
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    PoseImage(url: pose.imageURL)
                        .frame(height: 260)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    Text(pose.nameEnglish).font(Theme.heading(.title)).foregroundStyle(Theme.ink)
                    if let sanskrit = pose.nameSanskrit {
                        Text(sanskrit).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
                    }
                    Text(clockString(sequence.secondsLeft))
                        .font(.system(.largeTitle, design: .rounded, weight: .light).monospacedDigit())
                        .foregroundStyle(Theme.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .accessibilityLabel("\(sequence.secondsLeft) seconds left")
                    if let instructions = pose.instructions {
                        Text(instructions).font(Theme.body).foregroundStyle(Theme.stone700)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
            PracticeControls(
                isRunning: isRunning,
                canGoBack: sequence.index > 0,
                onBack: { handle(sequence.previous(), going: .back) },
                onToggle: { isRunning.toggle() },
                onNext: { handle(sequence.next()) }
            )
        }
    }

    private enum Direction { case forward, back }

    private func handle(_ events: [PoseSequence.Event], going direction: Direction = .forward) {
        for event in events {
            switch event {
            case .enteredPose(let index):
                guide.speak(direction == .back ? Guidance.returnToPose(poses[index]) : Guidance.enterPose(poses[index]))
            case .finished:
                isRunning = false
                practice.log(kind: .ritual, title: result.yogaPractice.title,
                             durationMinutes: result.yogaPractice.durationMinutes ?? sequence.durations.reduce(0, +) / 60,
                             result: result)
                guide.speak(Guidance.ritualComplete)
                withAnimation { finished = true }
            }
        }
    }
}

/// Paces a breathwork pattern with a growing and shrinking circle and spoken
/// cues sized to each phase. Completing every cycle logs the practice.
struct BreathworkPacerView: View {
    let pattern: BreathworkPattern
    /// The ritual it belongs to, saved with the log entry when there is one.
    var result: RecommendationResult? = nil
    @Environment(\.dismiss) private var dismiss
    @Environment(PracticeStore.self) private var practice
    @State private var pacer: BreathPacer
    @State private var isRunning = false
    @State private var started = false
    @State private var guide = SpeechGuide()
    @State private var finished = false

    init(pattern: BreathworkPattern, result: RecommendationResult? = nil) {
        self.pattern = pattern
        self.result = result
        _pacer = State(initialValue: BreathPacer(pattern))
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if finished {
                PracticeComplete(
                    title: pattern.name,
                    detail: "\(pattern.name) is saved to your practice.",
                    breathwork: nil,
                    result: nil,
                    onDone: { dismiss() }
                )
            } else {
                pacerScreen
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            guide.stop()
        }
        .task(id: isRunning) {
            guard isRunning else { return }
            await runClock { handle(pacer.advance(by: $0)) }
        }
    }

    private var pacerScreen: some View {
        VStack(spacing: 0) {
            PracticeTopBar(title: pattern.name, guide: guide, onClose: { dismiss() })
            Spacer()
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [Theme.lavenderTint, Theme.blueTint.opacity(0.6)], center: .center, startRadius: 10, endRadius: 160))
                    .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
                    .scaleEffect(circleScale)
                    .animation(.easeInOut(duration: Double(pacer.phaseSeconds)), value: pacer.step)
                    .animation(.easeInOut(duration: Double(pacer.phaseSeconds)), value: pacer.cycle)
                VStack(spacing: 6) {
                    Text(started ? phaseName : "Ready").font(Theme.heading(.title)).foregroundStyle(Theme.ink)
                    if started {
                        Text("\(pacer.secondsLeft)").font(.system(.title, design: .rounded).monospacedDigit()).foregroundStyle(Theme.stone700)
                    }
                }
            }
            .frame(width: 280, height: 280)
            .accessibilityElement(children: .combine)
            Spacer()
            Text(started ? "Cycle \(pacer.cycle) of \(pacer.cycles)" : "\(pattern.rhythm) · \(pattern.cycles) cycles")
                .sectionLabel()
                .padding(.bottom, 12)
            Button {
                if !started {
                    started = true
                    guide.speak(Guidance.beginBreathwork(pattern.name))
                    handle([pacer.startEvent], speakFirst: false)
                }
                isRunning.toggle()
            } label: {
                Label(isRunning ? "Pause" : started ? "Resume" : "Begin", systemImage: isRunning ? "pause.fill" : "play.fill")
                    .font(Theme.label)
                    .tracking(0.9)
                    .textCase(.uppercase)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 14)
                    .background(Theme.lavender, in: Capsule())
            }
            .padding(.bottom, 32)
        }
    }

    private var phaseName: String {
        switch pacer.phase {
        case .inhale: "Inhale"
        case .holdFull: "Hold full"
        case .exhale: "Exhale"
        case .holdEmpty: "Hold empty"
        }
    }

    /// Full on the in-breath and while holding full; small on the out-breath
    /// and while resting empty.
    private var circleScale: CGFloat {
        guard started else { return 0.6 }
        return switch pacer.phase {
        case .inhale, .holdFull: 1.0
        case .exhale, .holdEmpty: 0.55
        }
    }

    private func handle(_ events: [BreathPacer.Event], speakFirst: Bool = true) {
        for event in events {
            switch event {
            case .phase(let phase, let seconds, _):
                // The opening line already covers the very first inhale.
                if speakFirst { guide.speak(Guidance.cue(for: phase, seconds: seconds)) }
            case .finished:
                isRunning = false
                practice.log(kind: .breathwork, title: pattern.name, durationMinutes: pacer.totalMinutes, result: result)
                guide.speak(Guidance.breathworkComplete(pattern.name))
                withAnimation { finished = true }
            }
        }
    }
}

/// Calls `tick` with the seconds passed, about four times a second, until the
/// task is cancelled. Time comes from the clock, not from counting ticks, so a
/// pause in delivery (a busy moment, a trip to the background) loses nothing.
@MainActor
private func runClock(_ tick: (Double) -> Void) async {
    let clock = ContinuousClock()
    var last = clock.now
    while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(250))
        let now = clock.now
        let elapsed = now - last
        last = now
        tick(Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18)
    }
}

private struct PracticeTopBar: View {
    let title: String
    let guide: SpeechGuide
    let onClose: () -> Void

    var body: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(Theme.stone700)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("End practice")
            Spacer()
            Text(title).sectionLabel()
            Spacer()
            Button { guide.setMuted(!guide.isMuted) } label: {
                Image(systemName: guide.isMuted ? "speaker.slash" : "speaker.wave.2").font(.body).foregroundStyle(Theme.stone700)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(guide.isMuted ? "Turn spoken guidance on" : "Turn spoken guidance off")
        }
        .padding(.horizontal, 8)
    }
}

private struct PracticeControls: View {
    let isRunning: Bool
    let canGoBack: Bool
    let onBack: () -> Void
    let onToggle: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack(spacing: 36) {
            Button(action: onBack) { Image(systemName: "backward.end.fill").font(.title2) }
                .disabled(!canGoBack)
                .accessibilityLabel("Previous posture")
            Button(action: onToggle) {
                Image(systemName: isRunning ? "pause.fill" : "play.fill")
                    .font(.title)
                    .foregroundStyle(.white)
                    .frame(width: 72, height: 72)
                    .background(Theme.lavender, in: Circle())
            }
            .accessibilityLabel(isRunning ? "Pause" : "Resume")
            Button(action: onNext) { Image(systemName: "forward.end.fill").font(.title2) }
                .accessibilityLabel("Next posture")
        }
        .foregroundStyle(Theme.ink)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity)
        .background(.white.opacity(0.6))
    }
}

/// "Namaste": the practice is done and saved. After a ritual, its breathwork
/// is offered next.
private struct PracticeComplete: View {
    let title: String
    let detail: String
    let breathwork: BreathworkPattern?
    let result: RecommendationResult?
    let onDone: () -> Void
    @State private var showingBreathwork = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "checkmark.circle").font(.system(size: 56, weight: .light)).foregroundStyle(Theme.lavender)
            Text("Namaste").font(Theme.display).foregroundStyle(Theme.ink)
            Text(detail).font(Theme.body).foregroundStyle(Theme.stone700).multilineTextAlignment(.center)
            Spacer()
            if let breathwork {
                Button { showingBreathwork = true } label: {
                    Label("Continue with \(breathwork.name)", systemImage: "wind")
                        .font(Theme.label).tracking(0.9).textCase(.uppercase)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22).padding(.vertical, 14)
                        .background(Theme.lavender, in: Capsule())
                }
            }
            Button("Done", action: onDone).font(Theme.body.weight(.medium)).padding(.bottom, 32)
        }
        .padding(.horizontal, 24)
        .fullScreenCover(isPresented: $showingBreathwork, onDismiss: onDone) {
            if let breathwork { BreathworkPacerView(pattern: breathwork, result: result) }
        }
    }
}
