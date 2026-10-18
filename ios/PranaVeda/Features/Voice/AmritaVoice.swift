import AVFoundation
import Observation

/// Speaks Amrita's reply to a spoken message, as the website does: her
/// ElevenLabs voice through the server's /api/tts when it is configured, the
/// phone's built-in voice otherwise. Replies can be muted; the choice is kept.
@MainActor
@Observable
final class AmritaVoice: NSObject {
    private(set) var isMuted: Bool
    private(set) var isSpeaking = false

    private let api: APIClient
    private let defaults: UserDefaults
    private let synthesizer = AVSpeechSynthesizer()
    private var player: AVAudioPlayer?
    private var current: Task<Void, Never>?
    static let mutedKey = "pranaveda_voice_muted"

    init(api: APIClient = APIClient(), defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
        isMuted = defaults.bool(forKey: Self.mutedKey)
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String) {
        stop()
        let words = Self.speakable(text)
        guard !isMuted, !words.isEmpty else { return }
        isSpeaking = true
        current = Task { [weak self] in
            guard let self else { return }
            let audio = try? await self.api.speech(words)
            guard !Task.isCancelled else { return }
            self.activateAudio()
            if let audio, let player = try? AVAudioPlayer(data: audio) {
                player.delegate = self
                self.player = player
                player.play()
            } else {
                let utterance = AVSpeechUtterance(string: words)
                utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
                utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
                self.synthesizer.speak(utterance)
            }
        }
    }

    func stop() {
        current?.cancel()
        current = nil
        player?.stop()
        player = nil
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
    }

    func setMuted(_ muted: Bool) {
        isMuted = muted
        defaults.set(muted, forKey: Self.mutedKey)
        if muted { stop() }
    }

    /// The reply as it should be heard: no markdown marks, list bullets, code
    /// or link addresses, and no pause markers (website: toSpeakable).
    nonisolated static func speakable(_ text: String) -> String {
        var s = text
        s = s.replacingOccurrences(of: #"```[\s\S]*?```"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: #"<break[^>]*/>"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\[([^\]]+)\]\([^)]*\)"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"(?m)^\s*[-•]\s+"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"[*_#`>]+"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Heard with the ringer switch on silent, lowering music rather than stopping it.
    private func activateAudio() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true)
    }

    private func finished() {
        isSpeaking = false
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

extension AmritaVoice: AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.finished() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }
}

extension APIClient {
    /// Amrita's ElevenLabs voice for `text` (MP3), or nil when the server has
    /// no voice configured (it answers 503). Throws when it cannot be reached.
    func speech(_ text: String) async throws -> Data? {
        struct Body: Encodable { let text: String }
        var request = URLRequest(url: baseURL.appending(path: "api/tts"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Body(text: text))
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return status == 200 && !data.isEmpty ? data : nil
    }
}
