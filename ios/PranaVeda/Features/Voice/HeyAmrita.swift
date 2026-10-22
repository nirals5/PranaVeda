import AVFoundation
import AudioToolbox
import Observation
import Speech
import os

/// What "Hey Amrita …" asks for, read from the words the phone heard.
enum WakePhrase {
    /// Spoken practice controls: "Hey Amrita, pause".
    enum Command: Equatable, Sendable { case pause, resume, next, back, end }

    struct Match: Equatable {
        /// The command said straight after the wake phrase, if any.
        var command: Command?
    }

    /// The last "Hey Amrita" in `text` and the command after it, or nil when
    /// the wake phrase isn't there.
    static func match(_ text: String) -> Match? {
        let words = words(in: text)
        var after: Int?
        var i = 0
        while i < words.count {
            if greetings.contains(words[i]), let length = nameLength(words, from: i + 1) {
                after = i + 1 + length
                i += 1 + length
            } else {
                i += 1
            }
        }
        guard let after else { return nil }
        return Match(command: command(in: words[after...]))
    }

    /// A command said on its own ("pause", "go back"), once Amrita is listening.
    static func command(in text: String) -> Command? {
        command(in: words(in: text)[...])
    }

    /// The first word that isn't a filler ("please", "go to the …") must be
    /// the command, so "Hey Amrita, my back hurts" isn't heard as "back".
    private static func command(in words: ArraySlice<String>) -> Command? {
        words.first { !fillers.contains($0) }.flatMap { commands[$0] }
    }

    static func words(in text: String) -> [String] {
        text.lowercased()
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(of: "’", with: "")
            .split { !$0.isLetter }
            .map(String.init)
    }

    /// How the phone's recognizer tends to write "Hey".
    private static let greetings: Set<String> = ["hey", "hay", "hi", "ok", "okay", "hello"]
    /// "Amrita", and how it is sometimes heard.
    private static let names: Set<String> = ["amrita", "amreeta", "amritha", "amrida", "amritta", "imrita", "umrita", "emrita", "rita"]
    /// "Am Rita", "I'm Rita": the name heard as two words.
    private static let nameStarts: Set<String> = ["am", "um", "im", "an", "and"]
    private static let nameEnds: Set<String> = ["rita", "reeta", "rida"]
    private static let fillers: Set<String> = ["please", "go", "to", "the", "now", "um", "uh", "and", "can", "you", "a"]
    private static let commands: [String: Command] = [
        // Not "hold": the breathwork guide says it. "Paws" is how a lone "pause" is often heard.
        "pause": .pause, "paws": .pause, "pauses": .pause, "paused": .pause, "stop": .pause, "wait": .pause,
        "resume": .resume, "continue": .resume, "play": .resume, "start": .resume, "begin": .resume, "unpause": .resume,
        "next": .next, "skip": .next, "forward": .next,
        "back": .back, "previous": .back,
        "end": .end, "finish": .end, "quit": .end, "close": .end, "exit": .end,
    ]

    private static func nameLength(_ words: [String], from i: Int) -> Int? {
        guard i < words.count else { return nil }
        if names.contains(words[i]) { return 1 }
        if nameStarts.contains(words[i]), i + 1 < words.count, nameEnds.contains(words[i + 1]) { return 2 }
        return nil
    }
}

/// "Hey Amrita" while the app is open, an opt-in. On the Amrita tab it opens
/// the recording bar, as the Talk to Amrita button does; during a guided
/// practice it takes a spoken command ("Hey Amrita, pause"). It listens only
/// while one of those is on screen and the app is in front, never in Low
/// Power Mode, and recognition must run on the phone: no audio or words leave
/// it. Phones that can't recognise speech on the device don't offer it.
@MainActor
@Observable
final class HeyAmrita {
    static let shared = HeyAmrita()

    enum State: Equatable {
        case off
        case listening
        /// Heard "Hey Amrita" in a practice: waiting a moment for the command.
        case awake
        /// Microphone or speech recognition was refused, in Settings.
        case notAllowed
        /// This phone can't recognise speech on the device.
        case unavailable
    }

    /// Reasons to stop listening for a while.
    enum Hold: Hashable {
        /// The recording bar has the microphone.
        case recording
        /// Amrita is reading a reply aloud.
        case replying
        /// The app isn't in front.
        case background
    }

    private(set) var isEnabled: Bool
    private(set) var state: State = .off
    /// The open practice's controls: while set, commands go there. Nil is a
    /// bare "Hey Amrita": the practice should fall quiet for the command.
    var practiceCommands: ((WakePhrase.Command?) -> Void)? { didSet { refresh() } }
    /// "Hey Amrita" outside a practice: open the chat listening.
    var onWake: () -> Void = {}
    /// The Amrita tab is on screen, set by the app.
    var chatShowing = false { didSet { if chatShowing != oldValue { refresh() } } }

    static let enabledKey = "pranaveda_hey_amrita"
    /// How long Amrita waits for the command after a bare "Hey Amrita".
    static let awakeSeconds: TimeInterval = 6

    private var holds: Set<Hold> = []
    private let defaults: UserDefaults
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let engine = AVAudioEngine()
    private let box = RequestBox()
    private var task: SFSpeechRecognitionTask?
    /// Bumped with each recognition task, so a stale callback is ignored.
    private var generation = 0
    private var taskStarted = Date()
    private var awakeUntil = Date.distantPast
    private var running = false
    private var starting = false
    private var watchdog: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        isEnabled = defaults.bool(forKey: Self.enabledKey)
        let center = NotificationCenter.default
        center.addObserver(forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: nil) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        // A call, Siri or another app taking the microphone: start again when it's free.
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] _ in
            Task { @MainActor in self?.restart() }
        }
        center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
            Task { @MainActor in self?.restart() }
        }
    }

    var isListening: Bool { state == .listening || state == .awake }

    func setEnabled(_ on: Bool) {
        isEnabled = on
        defaults.set(on, forKey: Self.enabledKey)
        if !on { state = .off }
        refresh()
    }

    func hold(_ reason: Hold, _ on: Bool) {
        let changed = on ? holds.insert(reason).inserted : holds.remove(reason) != nil
        if changed { refresh() }
    }

    private var shouldListen: Bool {
        isEnabled && holds.isEmpty && !ProcessInfo.processInfo.isLowPowerModeEnabled
            && (practiceCommands != nil || chatShowing)
    }

    private func refresh() {
        if !shouldListen {
            stop()
        } else if !running, !starting {
            starting = true
            Task {
                await start()
                starting = false
            }
        }
    }

    private func restart() {
        stop()
        refresh()
    }

    private func start() async {
        guard await VoiceListener.speechAllowed(), await AVAudioApplication.requestRecordPermission() else {
            state = .notAllowed
            return
        }
        guard let recognizer, recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else {
            state = .unavailable
            return
        }
        guard shouldListen, !running else { return }
        do {
            // Play and record together, so spoken guidance carries on while
            // listening, from the speaker, alongside any music.
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP, .mixWithOthers])
            try session.setActive(true)
            // The iPhone's echo cancellation: the app's own voice (the
            // guidance, the chime) is taken out of what the microphone
            // hears, with noise suppression and level control for a voice
            // across the room. Other audio isn't lowered for it.
            let input = engine.inputNode
            if !input.isVoiceProcessingEnabled { try input.setVoiceProcessingEnabled(true) }
            input.voiceProcessingOtherAudioDuckingConfiguration = .init(enableAdvancedDucking: false, duckingLevel: .min)
            Self.feed(input, into: box)
            engine.prepare()
            try engine.start()
            running = true
            state = .listening
            listenAfresh()
            watchdog = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    self?.tick()
                }
            }
        } catch {
            // Usually the microphone is busy (a call): tried again on the next change.
            stop()
        }
    }

    private func stop() {
        watchdog?.cancel()
        watchdog = nil
        generation += 1
        task?.cancel()
        task = nil
        box.swap(nil)?.endAudio()
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        running = false
        if isListening { state = .off }
        // The audio session is left to whoever speaks next (a reply, the guidance).
    }

    /// A fresh recognition task on the same microphone: after each command,
    /// when the recognizer finishes a stretch, and every 50 seconds, so old
    /// words are never heard twice.
    private func listenAfresh() {
        guard let recognizer else { return }
        generation += 1
        let current = generation
        task?.cancel()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.contextualStrings = ["Hey Amrita", "Amrita", "pause", "resume", "next", "back", "end"]
        box.swap(request)?.endAudio()
        taskStarted = Date()
        task = Self.recognize(request, with: recognizer) { [weak self] readings, finished in
            Task { @MainActor in self?.heard(readings, finished: finished, generation: current) }
        }
    }

    private func tick() {
        guard running else { return }
        if state == .awake, Date() > awakeUntil {
            state = .listening
            listenAfresh()
        } else if state == .listening, Date().timeIntervalSince(taskStarted) > 50 {
            listenAfresh()
        }
    }

    /// `readings` are the recognizer's guesses at the words so far, best
    /// first: a wake phrase or command in any of them counts.
    private func heard(_ readings: [String], finished: Bool, generation: Int) {
        guard running, generation == self.generation else { return }
        if !readings.isEmpty {
            if state == .awake, let practiceCommands, let command = readings.lazy.compactMap(WakePhrase.command(in:)).first {
                state = .listening
                listenAfresh()
                practiceCommands(command)
                return
            }
            if let match = readings.lazy.compactMap(WakePhrase.match).first {
                guard let practiceCommands else {
                    stop()
                    onWake()
                    return
                }
                if let command = match.command {
                    state = .listening
                    listenAfresh()
                    practiceCommands(command)
                } else {
                    // A chime, the practice falls quiet, and the next words are the command.
                    state = .awake
                    awakeUntil = Date().addingTimeInterval(Self.awakeSeconds)
                    AudioServicesPlaySystemSound(1113)
                    practiceCommands(nil)
                    listenAfresh()
                }
                return
            }
        }
        if finished { listenAfresh() }
    }

    // The system calls these back on its own threads, so they are kept off
    // the main actor: a callback that inherited it would stop the app.

    nonisolated private static func feed(_ input: AVAudioInputNode, into box: RequestBox) {
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: input.outputFormat(forBus: 0)) { buffer, _ in
            box.append(buffer)
        }
    }

    /// Reports every reading of the words so far, and whether recognition has finished.
    nonisolated private static func recognize(
        _ request: SFSpeechAudioBufferRecognitionRequest,
        with recognizer: SFSpeechRecognizer,
        update: @escaping @Sendable ([String], Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            let readings = (result?.transcriptions ?? []).map(\.formattedString).filter { !$0.isEmpty }
            update(readings, error != nil || result?.isFinal == true)
        }
    }
}

/// The recognition request the microphone feeds: swapped from the main actor
/// while the audio thread appends to it.
private final class RequestBox: @unchecked Sendable {
    private let lock = OSAllocatedUnfairLock<SFSpeechAudioBufferRecognitionRequest?>(uncheckedState: nil)

    func swap(_ request: SFSpeechAudioBufferRecognitionRequest?) -> SFSpeechAudioBufferRecognitionRequest? {
        lock.withLockUnchecked { current in
            let old = current
            current = request
            return old
        }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.withLockUnchecked { $0?.append(buffer) }
    }
}
