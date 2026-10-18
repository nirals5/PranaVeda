import SwiftUI

/// The chat's input bar while speaking to Amrita: sound waves that move with
/// the voice, a clock, cancel and send. The words heard so far show in a
/// small line above it.
struct VoiceRecorderBar: View {
    let listener: VoiceListener
    let onCancel: () -> Void
    let onSend: (String) -> Void
    var buttonSize: CGFloat = 36
    @Environment(\.openURL) private var openURL

    private var words: String { listener.transcript.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            caption
                .padding(.horizontal, 28)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.stone700)
                        .frame(width: buttonSize, height: buttonSize)
                        .background(Theme.stone200.opacity(0.5), in: Circle())
                }
                .accessibilityLabel("Cancel recording")

                if listener.state == .listening {
                    SoundWaves(levels: listener.levels)
                        .frame(height: 28)
                        .accessibilityLabel("Recording")
                    if let startedAt = listener.startedAt {
                        Text(startedAt, style: .timer)
                            .font(Theme.caption.monospacedDigit())
                            .foregroundStyle(Theme.stone500)
                            .accessibilityHidden(true)
                    }
                } else {
                    Text(listener.state == .idle ? "Paused" : "Not recording")
                        .font(Theme.bodySmall)
                        .foregroundStyle(Theme.stone500)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button { onSend(words) } label: {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: buttonSize, height: buttonSize)
                        .background(Theme.lavender.opacity(words.isEmpty ? 0.4 : 1), in: Circle())
                }
                .disabled(words.isEmpty)
                .accessibilityLabel("Send to Amrita")
            }
            .padding(.leading, 8)
            .padding(.trailing, 8)
            .padding(.vertical, 8)
            .background(.white.opacity(0.85), in: Capsule())
            .overlay(Capsule().stroke(Theme.lavender.opacity(0.5)))
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var caption: some View {
        switch listener.state {
        case .notAllowed:
            Button("Allow the microphone and speech recognition in Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
            .font(Theme.caption)
            .tint(Theme.lavenderDeep)
        case .unavailable:
            Text("Speech recognition is not available right now. You can still type to Amrita.")
                .font(Theme.caption)
                .foregroundStyle(Theme.terracotta)
        default:
            Text(words.isEmpty ? "Listening… tell Amrita how you feel" : words)
                .font(Theme.caption).italic()
                .foregroundStyle(words.isEmpty ? Theme.stone500 : Theme.stone700)
                .lineLimit(2)
                .truncationMode(.head) // the newest words stay in view
                .accessibilityLabel(words.isEmpty ? "Listening" : "Heard: \(words)")
        }
    }
}

/// Bars that rise with the voice, newest on the right. With Reduce Motion
/// they hold a quiet resting shape and only change in height, without
/// springing.
struct SoundWaves: View {
    let levels: [Float]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
                    Capsule()
                        .fill(Theme.lavender)
                        .frame(height: max(4, geo.size.height * CGFloat(level)))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(maxHeight: .infinity)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: levels)
        }
    }
}
