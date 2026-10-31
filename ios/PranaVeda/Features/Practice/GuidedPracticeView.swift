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
    /// The log entry made on finishing, for "How do you feel now?".
    @State private var loggedId: String?
    /// The practice on the lock screen and in the Dynamic Island.
    @State private var liveActivity = PracticeLiveActivity()
    @State private var heyAmrita = HeyAmrita.shared
    /// "Your heart rate moved from 78 to 64 bpm…", when the watch read it.
    @State private var heartNote: String?

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
                    detail: "\(result.yogaPractice.title) is saved to your practice." + (heartNote.map { " " + $0 } ?? ""),
                    breathwork: result.breathwork,
                    result: result,
                    entryId: loggedId,
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
            showLiveActivity()
            heyAmrita.practiceCommands = { obey($0) }
            WatchHeart.shared.begin()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            heyAmrita.practiceCommands = nil
            guide.stop()
            liveActivity.end()
            // Closed before the end: nothing is saved on the watch.
            WatchHeart.shared.cancel()
        }
        .onChange(of: isRunning) { showLiveActivity() }
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
                    CautionNote(text: pose.caution)
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

    /// "Hey Amrita, pause" and the rest: the same as the buttons. A bare
    /// "Hey Amrita" quiets the guidance so the command can be heard.
    private func obey(_ command: WakePhrase.Command?) {
        guard let command else { return guide.stop() }
        if finished || poses.isEmpty {
            if command == .end { dismiss() }
            return
        }
        switch command {
        case .pause: isRunning = false
        case .resume: isRunning = true
        case .next: handle(sequence.next())
        case .back: if sequence.index > 0 { handle(sequence.previous(), going: .back) }
        case .end: dismiss()
        }
    }

    private func showLiveActivity() {
        guard !finished, sequence.index < poses.count else { return }
        liveActivity.show(title: result.yogaPractice.title, kind: "ritual", step: poses[sequence.index].nameEnglish,
                          detail: "Posture \(sequence.index + 1) of \(poses.count)", secondsLeft: sequence.secondsLeft, running: isRunning)
    }

    private enum Direction { case forward, back }

    private func handle(_ events: [PoseSequence.Event], going direction: Direction = .forward) {
        for event in events {
            switch event {
            case .enteredPose(let index):
                guide.speak(direction == .back ? Guidance.returnToPose(poses[index]) : Guidance.enterPose(poses[index]))
                showLiveActivity()
            case .finished:
                isRunning = false
                let heart = WatchHeart.shared.finish()
                heartNote = heart?.movedNote(kind: .ritual)
                loggedId = practice.log(kind: .ritual, title: result.yogaPractice.title,
                                        durationMinutes: result.yogaPractice.durationMinutes ?? sequence.durations.reduce(0, +) / 60,
                                        result: result, heart: heart).id
                guide.speak(Guidance.ritualComplete)
                liveActivity.end()
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
    @State private var liveActivity = PracticeLiveActivity()
    @State private var guide = SpeechGuide()
    @State private var finished = false
    @State private var loggedId: String?
    @State private var heyAmrita = HeyAmrita.shared
    @State private var heartNote: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                    detail: "\(pattern.name) is saved to your practice." + (heartNote.map { " " + $0 } ?? ""),
                    breathwork: nil,
                    result: nil,
                    entryId: loggedId,
                    onDone: { dismiss() }
                )
            } else {
                pacerScreen
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            heyAmrita.practiceCommands = { obey($0) }
        }
        .onChange(of: isRunning) { showLiveActivity() }
        .onDisappear {
            heyAmrita.practiceCommands = nil
            liveActivity.end()
            UIApplication.shared.isIdleTimerDisabled = false
            guide.stop()
            // Closed before the end: nothing is saved on the watch.
            WatchHeart.shared.cancel()
        }
        .task(id: isRunning) {
            guard isRunning else { return }
            await runClock { handle(pacer.advance(by: $0)) }
        }
    }

    private var pacerScreen: some View {
        VStack(spacing: 0) {
            PracticeTopBar(title: pattern.name, guide: guide, onClose: { dismiss() })
            CautionNote(text: pattern.caution).padding(.horizontal, 20)
            Spacer()
            ZStack {
                // The circle grows with the in-breath and shrinks with the
                // out-breath. With Reduce Motion it holds still and the
                // phase shows as a gentle change of colour instead.
                Circle()
                    .fill(RadialGradient(colors: circleColors, center: .center, startRadius: 10, endRadius: 160))
                    .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
                    .scaleEffect(reduceMotion ? 0.85 : circleScale)
                    .animation(phaseAnimation, value: pacer.step)
                    .animation(phaseAnimation, value: pacer.cycle)
                VStack(spacing: 6) {
                    Text(started ? phaseName : "Ready")
                        .font(Theme.heading(.title)).foregroundStyle(Theme.ink)
                        .lineLimit(1).minimumScaleFactor(0.5) // stays inside the circle at the largest text sizes
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
            Button(action: toggle) {
                Label(isRunning ? "Pause" : started ? "Resume" : "Begin", systemImage: isRunning ? "pause.fill" : "play.fill")
                    .labelFont()
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

    private func toggle() {
        if !started {
            started = true
            WatchHeart.shared.begin()
            guide.speak(Guidance.beginBreathwork(pattern.name, caution: pattern.caution))
            handle([pacer.startEvent], speakFirst: false)
        }
        isRunning.toggle()
    }

    /// "Hey Amrita, pause" and the rest. A pattern has no next or previous
    /// step. A bare "Hey Amrita" quiets the cues so the command can be heard.
    private func obey(_ command: WakePhrase.Command?) {
        guard let command else { return guide.stop() }
        switch command {
        case .pause: if isRunning, !finished { toggle() }
        case .resume: if !isRunning, !finished { toggle() }
        case .end: dismiss()
        case .next, .back: break
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

    private var phaseAnimation: Animation {
        reduceMotion ? .easeInOut(duration: 0.4) : .easeInOut(duration: Double(pacer.phaseSeconds))
    }

    /// Lavender and blue normally. With Reduce Motion the colour carries the
    /// phase: deeper while breathing in or holding full, soft peach while
    /// breathing out or resting empty.
    private var circleColors: [Color] {
        guard reduceMotion, started else { return [Theme.lavenderTint, Theme.blueTint.opacity(0.6)] }
        return switch pacer.phase {
        case .inhale, .holdFull: [Theme.lavender.opacity(0.45), Theme.blueTint]
        case .exhale, .holdEmpty: [Theme.peachTint, Theme.warmWhite]
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

    /// Each breath phase on the lock screen once the pacer has begun.
    private func showLiveActivity() {
        guard started, !finished else { return }
        liveActivity.show(title: pattern.name, kind: "breathwork", step: phaseName,
                          detail: "Cycle \(pacer.cycle) of \(pacer.cycles)", secondsLeft: pacer.secondsLeft, running: isRunning)
    }

    private func handle(_ events: [BreathPacer.Event], speakFirst: Bool = true) {
        for event in events {
            switch event {
            case .phase(let phase, let seconds, _):
                // The opening line already covers the very first inhale.
                if speakFirst { guide.speak(Guidance.cue(for: phase, seconds: seconds)) }
                showLiveActivity()
            case .finished:
                isRunning = false
                let heart = WatchHeart.shared.finish()
                heartNote = heart?.movedNote(kind: .breathwork)
                loggedId = practice.log(kind: .breathwork, title: pattern.name, durationMinutes: pacer.totalMinutes, result: result, heart: heart).id
                guide.speak(Guidance.breathworkComplete(pattern.name))
                liveActivity.end()
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
    @State private var heyAmrita = HeyAmrita.shared
    @State private var watchHeart = WatchHeart.shared

    var body: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(Theme.stone700)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("End practice")
            Spacer()
            VStack(spacing: 2) {
                Text(title).sectionLabel()
                // Live from Apple Watch, when it is reading.
                if let bpm = watchHeart.bpm {
                    Label("\(bpm) bpm", systemImage: "heart.fill")
                        .font(Theme.bodySmall.monospacedDigit())
                        .foregroundStyle(Theme.terracotta)
                        .accessibilityLabel("Heart rate \(bpm) beats per minute")
                }
                // While "Hey Amrita" listens, a reminder of what to say.
                if heyAmrita.isListening {
                    Text(heyAmrita.state == .awake ? "Listening…" : "Say “Hey Amrita, pause”")
                        .font(Theme.bodySmall)
                        .foregroundStyle(heyAmrita.state == .awake ? Theme.lavenderDeep : Theme.stone500)
                        .accessibilityHint("You can also say resume, next, back or end")
                }
            }
            Spacer()
            Button { heyAmrita.setEnabled(!heyAmrita.isEnabled) } label: {
                Image(systemName: heyAmrita.isEnabled ? "ear.fill" : "ear").font(.body)
                    .foregroundStyle(heyAmrita.isEnabled ? Theme.lavenderDeep : Theme.stone700)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(heyAmrita.isEnabled ? "Stop listening for Hey Amrita" : "Listen for Hey Amrita")
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
    /// The entry just logged, to rate (H11).
    let entryId: String?
    let onDone: () -> Void
    @State private var showingBreathwork = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "checkmark.circle").font(.system(size: 56, weight: .light)).foregroundStyle(Theme.lavender)
            Text("Namaste").font(Theme.display).foregroundStyle(Theme.ink)
            Text(detail).font(Theme.body).foregroundStyle(Theme.stone700).multilineTextAlignment(.center)
            if let entryId { FeelingCheck(entryId: entryId).padding(.top, 8) }
            Spacer()
            if let breathwork {
                Button { showingBreathwork = true } label: {
                    Label("Continue with \(breathwork.name)", systemImage: "wind")
                        .labelFont().tracking(0.9).textCase(.uppercase)
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

/// "How do you feel now?": one optional tap after a practice (H11). Amrita
/// leans away from practices that leave them less settled, and toward ones
/// that settle them.
private struct FeelingCheck: View {
    let entryId: String
    @Environment(PracticeStore.self) private var practice

    private var chosen: PracticeLogEntry.Feeling? { practice.entries.last { $0.id == entryId }?.feeling }

    var body: some View {
        VStack(spacing: 10) {
            Text(chosen == nil ? "How do you feel now?" : "Thank you. Amrita will keep this in mind.")
                .font(Theme.body).foregroundStyle(Theme.stone700)
            HStack(spacing: 8) {
                ForEach(PracticeLogEntry.Feeling.allCases, id: \.self) { feeling in
                    let selected = chosen == feeling
                    Button { practice.rate(entryId, feeling) } label: {
                        Text(feeling.label)
                            .font(.caption.weight(.medium))
                            .lineLimit(1).minimumScaleFactor(0.8)
                            .foregroundStyle(selected ? .white : Theme.ink)
                            .padding(.horizontal, 12).padding(.vertical, 9)
                            .background(selected ? Theme.lavender : Color.white.opacity(0.8), in: Capsule())
                            .overlay(Capsule().stroke(selected ? Theme.lavender : Theme.stone700.opacity(0.25)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}
