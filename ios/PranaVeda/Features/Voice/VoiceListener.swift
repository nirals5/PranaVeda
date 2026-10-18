import AVFoundation
import Observation
import Speech

/// Listens for one spoken message with the phone's own speech recognition,
/// showing the words as they are heard (the website's voice consultation).
/// Recognition stays on the phone when it supports that.
@MainActor
@Observable
final class VoiceListener {
    enum State: Equatable {
        case idle
        case listening
        /// Microphone or speech recognition was refused, in Settings.
        case notAllowed
        /// No recognition for this language on this phone, or it failed.
        case unavailable
    }

    private(set) var state: State = .idle
    private(set) var transcript = ""

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func start() async {
        stop()
        transcript = ""
        guard await Self.speechAllowed(), await AVAudioApplication.requestRecordPermission() else {
            state = .notAllowed
            return
        }
        guard let recognizer, recognizer.isAvailable else {
            state = .unavailable
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
            request.addsPunctuation = true
            self.request = request

            Self.feed(engine.inputNode, into: request)
            engine.prepare()
            try engine.start()
            state = .listening

            task = Self.recognize(request, with: recognizer) { [weak self] text, finished, failed in
                Task { @MainActor in
                    guard let self else { return }
                    if let text, !text.isEmpty { self.transcript = text }
                    if finished, self.state == .listening {
                        if failed, self.transcript.isEmpty { self.state = .unavailable }
                        self.stopAudio()
                    }
                }
            }
        } catch {
            stop()
            state = .unavailable
        }
    }

    /// Stops listening and keeps the words heard so far.
    func stop() {
        task?.cancel()
        task = nil
        stopAudio()
        if state == .listening { state = .idle }
    }

    private func stopAudio() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // The system calls these back on its own threads, so they are kept off
    // the main actor: a callback that inherited it would stop the app.

    nonisolated private static func speechAllowed() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
            }
        default: return false
        }
    }

    /// Hands the microphone's audio to the recognizer, from the audio thread.
    nonisolated private static func feed(_ input: AVAudioInputNode, into request: SFSpeechAudioBufferRecognitionRequest) {
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
    }

    /// Reports the words so far, whether recognition has finished, and whether it failed.
    nonisolated private static func recognize(
        _ request: SFSpeechAudioBufferRecognitionRequest,
        with recognizer: SFSpeechRecognizer,
        update: @escaping @Sendable (String?, Bool, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            update(result?.bestTranscription.formattedString, error != nil || result?.isFinal == true, error != nil)
        }
    }
}
