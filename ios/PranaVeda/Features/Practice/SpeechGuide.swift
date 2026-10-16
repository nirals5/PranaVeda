import AVFoundation
import Observation

/// Speaks the guidance with the phone's built-in voice. (The website uses
/// ElevenLabs when it is configured; that comes to the apps with voice.)
/// Each new line replaces whatever was still being said, as on the website.
@MainActor
@Observable
final class SpeechGuide {
    private(set) var isMuted: Bool
    private let synthesizer = AVSpeechSynthesizer()
    private static let mutedKey = "pranaveda_guidance_muted"

    init() {
        isMuted = UserDefaults.standard.bool(forKey: Self.mutedKey)
    }

    func speak(_ text: String) {
        synthesizer.stopSpeaking(at: .immediate)
        guard !isMuted else { return }
        activateAudio()
        for part in Guidance.script(text) {
            let utterance = AVSpeechUtterance(string: part.words)
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
            utterance.postUtteranceDelay = part.pauseAfter
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
        }
    }

    func setMuted(_ muted: Bool) {
        isMuted = muted
        UserDefaults.standard.set(muted, forKey: Self.mutedKey)
        if muted { synthesizer.stopSpeaking(at: .immediate) }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Spoken guidance should be heard with the ringer switch on silent, and
    /// lower other audio (music) while it speaks rather than stop it.
    private func activateAudio() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true)
    }
}
