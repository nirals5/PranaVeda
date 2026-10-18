import SwiftUI

/// The website's voice consultation: listens as soon as it opens, shows the
/// words as they are heard, and sends them to Amrita as a spoken message.
struct VoiceSheet: View {
    let onSend: (String) -> Void
    @State private var listener = VoiceListener()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openURL) private var openURL
    @State private var pulsing = false

    private var words: String { listener.transcript.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Label("Voice consultation", systemImage: "sparkles").sectionLabel()
                Spacer()
            }
            orb
            VStack(spacing: 6) {
                Text(listener.state == .listening ? "Listening" : "Paused").sectionLabel()
                Text(status)
                    .font(Theme.quote).italic()
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("What I heard").font(Theme.label).textCase(.uppercase).foregroundStyle(Theme.lavender)
                Text(words.isEmpty ? "Speak naturally… share physical aches, restless sleep, stress, or what you want more energy for." : words)
                    .font(Theme.bodySmall)
                    .foregroundStyle(words.isEmpty ? Theme.stone500 : Theme.stone700)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel(words.isEmpty ? "Nothing heard yet" : words)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
            .background(.white.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if listener.state == .notAllowed {
                Button("Open Settings to allow the microphone") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .font(Theme.bodySmall)
                .tint(Theme.lavenderDeep)
            }
            HStack(spacing: 12) {
                Button {
                    listener.stop()
                    dismiss()
                } label: {
                    Text("Cancel").frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .font(Theme.label).textCase(.uppercase)
                .foregroundStyle(Theme.stone700)
                .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                Button {
                    listener.stop()
                    let text = words
                    dismiss()
                    onSend(text)
                } label: {
                    Label("Send", systemImage: "checkmark").frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .font(Theme.label).textCase(.uppercase)
                .foregroundStyle(.white)
                .background(Theme.lavender.opacity(words.isEmpty ? 0.4 : 1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .disabled(words.isEmpty)
            }
        }
        .padding(24)
        .presentationDetents([.large])
        .presentationBackground(Theme.background)
        .task { await listener.start() }
        .onDisappear { listener.stop() }
    }

    private var status: String {
        switch listener.state {
        case .listening: "I am listening. Share what is on your mind…"
        case .idle where words.isEmpty: "Tap the microphone and share what is on your mind…"
        case .idle: "When you are ready, send it to Amrita."
        case .notAllowed: "PranaVeda needs the microphone and speech recognition, allowed in Settings."
        case .unavailable: "Speech recognition is not available right now. You can still type to Amrita."
        }
    }

    private var orb: some View {
        let listening = listener.state == .listening
        return ZStack {
            Circle()
                .stroke(Theme.lavender.opacity(0.35), lineWidth: 2)
                .frame(width: 128, height: 128)
                .scaleEffect(pulsing && listening ? 1.35 : 1)
                .opacity(pulsing && listening ? 0 : 0.6)
            Circle()
                .fill(LinearGradient(colors: [.white, Theme.peachTint, Theme.lavenderTint], startPoint: .bottomLeading, endPoint: .topTrailing))
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .shadow(color: Theme.lavender.opacity(0.3), radius: 18, y: 8)
                .frame(width: 112, height: 112)
            Button {
                if listening { listener.stop() } else { Task { await listener.start() } }
            } label: {
                Image(systemName: listening ? "mic.fill" : "mic")
                    .font(.system(size: 36))
                    .foregroundStyle(Theme.lavender)
                    .frame(width: 112, height: 112)
            }
            .accessibilityLabel(listening ? "Stop listening" : "Listen again")
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: false)) { pulsing = true }
        }
    }
}
