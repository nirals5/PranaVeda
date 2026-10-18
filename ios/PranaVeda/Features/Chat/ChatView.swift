import SwiftUI

struct ChatView: View {
    @Bindable var model: ChatViewModel
    var auth: AuthStore? = nil
    var insight: DailyInsightStore? = nil
    var saved: SavedRitualStore? = nil
    var voice: AmritaVoice? = nil
    @State private var talking = false
    @State private var draft = ""
    @FocusState private var inputFocused: Bool
    /// Grows with the text size, up to 48 points (see the cap on the input bar).
    @ScaledMetric(relativeTo: .body) private var sendButtonSize: CGFloat = 36

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 18) {
                            if model.items.isEmpty { welcome }
                            ForEach(model.items) { item in
                                MessageRow(item: item, onOption: { model.send($0) })
                                    .id(item.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 20)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: model.items.last?.text) { _, _ in scrollToEnd(proxy) }
                    .onChange(of: model.items.count) { _, _ in scrollToEnd(proxy) }
                }
            }
            .safeAreaInset(edge: .bottom) { inputBar }
            .sheet(isPresented: $talking) {
                VoiceSheet { spoken in model.send(spoken, spoken: true) }
            }
            .navigationTitle("Amrita")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Spoken replies on or off, kept between launches (as on the website).
                if let voice {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { voice.setMuted(!voice.isMuted) } label: {
                            Image(systemName: voice.isMuted ? "speaker.slash" : "speaker.wave.2")
                        }
                        .tint(voice.isMuted ? Theme.stone500 : Theme.lavenderDeep)
                        .accessibilityLabel(voice.isMuted ? "Voice replies off" : "Voice replies on")
                        .accessibilityHint(voice.isMuted ? "Amrita will read replies to spoken messages aloud" : "Amrita will stop reading replies aloud")
                    }
                }
                // Starts a fresh conversation (the wellness profile is kept),
                // like the website's "Begin a new conversation". Only shown
                // when there is a conversation to clear.
                if !model.items.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { model.reset() } label: {
                            Label("New conversation", systemImage: "square.and.pencil")
                        }
                        .accessibilityHint("Your wellness profile is kept")
                    }
                }
            }
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(greeting).font(Theme.display).foregroundStyle(Theme.ink)
            Text("Tell me how you feel, and I'll suggest a practice that fits your body, energy, and goals.")
                .font(Theme.body)
                .foregroundStyle(Theme.stone700)
            if let insight {
                DailyInsightCard(state: insight.state)
                    .padding(.top, 14)
                    .task { await insight.loadIfNeeded(profile: model.profile) }
            }
            if let saved, !saved.rituals.isEmpty {
                SavedRitualsView(saved: saved, limit: 3).padding(.top, 4)
            }
        }
        .padding(.top, 24)
    }

    private var greeting: String {
        let time = Self.timeOfDay(hour: Calendar.current.component(.hour, from: Date()))
        // Signed in, the name they gave Amrita, else their account name (as on
        // the website). Guests are greeted by name only if they told Amrita.
        let name = model.profileName ?? auth?.user?.displayName
        if let first = name?.split(separator: " ").first { return "Good \(time), \(first)." }
        return ["morning": "Good morning, seeker.", "afternoon": "Good afternoon, reflective heart.", "evening": "Good evening, peaceful traveler."][time]!
    }

    /// Which greeting fits the hour, as on the website (src/lib/greeting.ts):
    /// morning starts at 5, so someone up after midnight is wished a good
    /// evening rather than a good morning.
    nonisolated static func timeOfDay(hour: Int) -> String {
        switch hour {
        case 5..<12: "morning"
        case 12..<17: "afternoon"
        default: "evening"
        }
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Tell Amrita how you're feeling…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .font(Theme.body)
                .focused($inputFocused)
                .submitLabel(.send)
                .onSubmit(send)
            if voice != nil {
                Button { talking = true } label: {
                    Image(systemName: "mic")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.lavenderDeep)
                        .frame(width: min(sendButtonSize, 48), height: min(sendButtonSize, 48))
                        .background(Theme.lavenderTint, in: Circle())
                }
                .disabled(model.isStreaming)
                .accessibilityLabel("Speak to Amrita")
            }
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: min(sendButtonSize, 48), height: min(sendButtonSize, 48))
                    .background(Theme.ink, in: Circle())
            }
            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || model.isStreaming)
            .accessibilityLabel("Send message")
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .background(.white.opacity(0.85), in: Capsule())
        .overlay(Capsule().stroke(Theme.stone200.opacity(0.7)))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        // The input bar grows with the text size, but stops at a size where
        // the field and send button still fit side by side; the conversation
        // above keeps scaling.
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }

    private func send() {
        let text = draft
        draft = ""
        // Put the keyboard away so the reply has the whole screen.
        inputFocused = false
        model.send(text)
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        guard let last = model.items.last else { return }
        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(last.id, anchor: .bottom) }
    }
}

struct MessageRow: View {
    let item: ChatItem
    let onOption: (String) -> Void

    var body: some View {
        switch item.role {
        case .user:
            HStack {
                Spacer(minLength: 48)
                Text(item.text)
                    .font(Theme.body)
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.lavenderTint, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        case .assistant:
            VStack(alignment: .leading, spacing: 12) {
                if !item.text.isEmpty {
                    Text(markdown(item.text))
                        .font(Theme.body)
                        .foregroundStyle(item.failed ? Theme.terracotta : Theme.ink)
                        .textSelection(.enabled)
                } else if item.streaming && item.cards.isEmpty {
                    ProgressView().tint(Theme.lavender)
                }
                ForEach(Array(item.cards.enumerated()), id: \.offset) { _, card in
                    CardView(card: card, onOption: onOption)
                }
            }
        }
    }

    private func markdown(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(text)
    }
}
