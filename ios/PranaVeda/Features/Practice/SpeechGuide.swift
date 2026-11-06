import AVFoundation
import Observation

/// Speaks the guidance in Amrita's voice, as the website does: her ElevenLabs
/// voice through the server's /api/tts, the phone's built-in voice when that
/// isn't configured or can't be reached. Each new line replaces whatever was
/// still being said. Lines can be fetched ahead (breath cues, the next pose)
/// so they start on time.
@MainActor
@Observable
final class SpeechGuide {
    private(set) var isMuted: Bool
    /// Once her voice can't be had (none configured, or twice unreachable),
    /// the rest of this practice is said in the built-in voice without waiting.
    @ObservationIgnored private(set) var builtInOnly = false

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let fetch: @Sendable (String) async throws -> Data?
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var current: Task<Void, Never>?
    @ObservationIgnored private var cache: [String: Data] = [:]
    @ObservationIgnored private var loading: [String: Task<Data?, Never>] = [:]
    @ObservationIgnored private var failures = 0
    /// Paused with the practice: what was being said waits, and so does a
    /// new line (Back or Next while paused) until Play.
    @ObservationIgnored private(set) var isPaused = false
    @ObservationIgnored private var queued: String?
    /// Lines fetched ahead go one at a time: bursts trip ElevenLabs' throttling.
    @ObservationIgnored private var ahead: Task<Void, Never>?
    private static let mutedKey = "pranaveda_guidance_muted"

    init(defaults: UserDefaults = .standard,
         fetch: @escaping @Sendable (String) async throws -> Data? = { try await APIClient().speech($0, timeout: 10) }) {
        self.defaults = defaults
        self.fetch = fetch
        isMuted = defaults.bool(forKey: Self.mutedKey)
    }

    func speak(_ text: String) {
        stopSpeaking()
        // Quiet while "Hey Amrita" waits for a command.
        guard !isMuted, HeyAmrita.shared.state != .awake else { return }
        if isPaused {
            queued = text
            prefetch([text])
            return
        }
        current = Task { [weak self] in
            guard let self else { return }
            let audio = await self.audio(for: text)
            guard !Task.isCancelled, !self.isMuted, HeyAmrita.shared.state != .awake else { return }
            if self.isPaused {
                self.queued = text // paused while it was being fetched
                return
            }
            self.activateAudio()
            if let audio, let player = try? AVAudioPlayer(data: audio), player.play() {
                self.player = player
            } else {
                self.speakBuiltIn(text)
            }
        }
    }

    /// Fetches lines that are coming up, in order, so they play without delay.
    @discardableResult
    func prefetch(_ texts: [String]) -> Task<Void, Never> {
        let previous = ahead
        let task = Task { [weak self] in
            await previous?.value
            guard let self, !self.isMuted else { return }
            for text in texts where !text.isEmpty {
                _ = await self.audio(for: text)
            }
        }
        ahead = task
        return task
    }

    /// Her voice saying `text`, from what's already fetched or the server;
    /// nil means the built-in voice says it.
    func audio(for text: String) async -> Data? {
        if let data = cache[text] { return data }
        if let pending = loading[text] { return await pending.value }
        guard !builtInOnly else { return nil }
        let pending = Task { await self.load(text) }
        loading[text] = pending
        let data = await pending.value
        loading[text] = nil
        return data
    }

    private func load(_ text: String) async -> Data? {
        do {
            guard let data = try await fetch(text) else {
                builtInOnly = true // the server has no voice configured
                return nil
            }
            failures = 0
            cache[text] = data
            return data
        } catch {
            failures += 1
            if failures >= 2 { builtInOnly = true }
            return nil
        }
    }

    /// With the practice's pause: stops mid-word, to carry on from there.
    func pause() {
        guard !isPaused else { return }
        isPaused = true
        player?.pause()
        synthesizer.pauseSpeaking(at: .word)
    }

    func resume() {
        guard isPaused else { return }
        isPaused = false
        if let line = queued {
            queued = nil
            speak(line)
        } else if let player {
            player.play()
        } else if synthesizer.isPaused {
            synthesizer.continueSpeaking()
        }
    }

    func setMuted(_ muted: Bool) {
        isMuted = muted
        defaults.set(muted, forKey: Self.mutedKey)
        if muted { stopSpeaking() }
    }

    func stop() {
        stopSpeaking()
        // While "Hey Amrita" listens, the session is its too.
        if !Self.sharingWithListener {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    private func stopSpeaking() {
        queued = nil
        current?.cancel()
        current = nil
        player?.stop()
        player = nil
        synthesizer.stopSpeaking(at: .immediate)
    }

    /// The built-in voice, with the pause markers turned into silences.
    private func speakBuiltIn(_ text: String) {
        for part in Guidance.script(text) {
            let utterance = AVSpeechUtterance(string: part.words)
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
            utterance.postUtteranceDelay = part.pauseAfter
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
        }
    }

    /// Spoken guidance should be heard with the ringer switch on silent, and
    /// lower other audio (music) while it speaks rather than stop it. While
    /// "Hey Amrita" listens, its play-and-record session already plays it.
    private func activateAudio() {
        let session = AVAudioSession.sharedInstance()
        if !Self.sharingWithListener {
            try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        }
        try? session.setActive(true)
    }

    private static var sharingWithListener: Bool {
        AVAudioSession.sharedInstance().category == .playAndRecord
    }
}
