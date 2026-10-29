import SwiftUI

struct ChatView: View {
    @Bindable var model: ChatViewModel
    var auth: AuthStore? = nil
    var insight: DailyInsightStore? = nil
    var saved: SavedRitualStore? = nil
    var voice: AmritaVoice? = nil
    /// Where they are, for the first suggestion (nil: location is not offered).
    var place: PlaceStore? = nil
    /// Goes up each time a widget asks to talk to Amrita: start listening.
    var voiceRequest = 0
    @State private var handledVoiceRequest = 0
    /// Set while speaking to Amrita: the input bar becomes the recording bar.
    @State private var listener: VoiceListener?
    @State private var heyAmrita = HeyAmrita.shared
    @State private var confirmingHeyAmrita = false
    @State private var heyAmritaProblem: String?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
            .safeAreaInset(edge: .bottom) {
                if let listener {
                    VoiceRecorderBar(
                        listener: listener,
                        onCancel: stopRecording,
                        onSend: { words in
                            stopRecording()
                            model.send(words, spoken: true)
                        },
                        buttonSize: min(sendButtonSize, 48)
                    )
                    .transition(.opacity)
                } else {
                    inputBar
                }
            }
            .animation(.easeOut(duration: 0.2), value: listener == nil)
            // The microphone is never left on: leaving the tab or the app stops it.
            .onDisappear(perform: stopRecording)
            .onAppear(perform: answerVoiceRequest)
            .onChange(of: voiceRequest) { answerVoiceRequest() }
            .onChange(of: scenePhase) { _, phase in if phase != .active { stopRecording() } }
            // The recording bar has the microphone while it's open.
            .onChange(of: listener == nil) { _, closed in heyAmrita.hold(.recording, !closed) }
            .onChange(of: heyAmrita.state) { _, state in
                switch state {
                case .notAllowed:
                    heyAmritaProblem = "To listen for “Hey Amrita”, allow PranaVeda to use the microphone and speech recognition in Settings."
                case .unavailable:
                    heyAmritaProblem = "This iPhone can't recognise speech on the device, so it can't listen for “Hey Amrita” privately."
                default:
                    return
                }
                heyAmrita.setEnabled(false)
            }
            .alert("Listen for “Hey Amrita”?", isPresented: $confirmingHeyAmrita) {
                Button("Turn on") { heyAmrita.setEnabled(true) }
                Button("Not now", role: .cancel) {}
            } message: {
                Text("While this screen or a practice is open, PranaVeda listens for “Hey Amrita”, then opens the microphone for you. In a practice, say “Hey Amrita, pause” (or resume, next, back, end). Listening happens on this iPhone; nothing is sent anywhere.")
            }
            .alert("“Hey Amrita” is off", isPresented: Binding(get: { heyAmritaProblem != nil }, set: { if !$0 { heyAmritaProblem = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(heyAmritaProblem ?? "")
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
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            if heyAmrita.isEnabled { heyAmrita.setEnabled(false) } else { confirmingHeyAmrita = true }
                        } label: {
                            Image(systemName: heyAmrita.isEnabled ? "ear.fill" : "ear")
                        }
                        .tint(heyAmrita.isEnabled ? Theme.lavenderDeep : Theme.stone500)
                        .accessibilityLabel(heyAmrita.isEnabled ? "Listening for Hey Amrita" : "Not listening for Hey Amrita")
                        .accessibilityHint(heyAmrita.isEnabled ? "Stops listening for Hey Amrita" : "Listens for Hey Amrita while the app is open")
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
            Text(greeting).font(Theme.display).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            Text("Tell me how you feel, and I'll suggest a practice that fits your body, energy, and goals.")
                .font(Theme.body)
                .foregroundStyle(Theme.stone700)
            SuggestionChips(
                suggestions: Suggestions.list(place: place?.current, knowsConstitution: model.profile["prakriti"]?.stringValue?.isEmpty == false),
                onSelect: { model.send($0) }
            )
            .padding(.top, 6)
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
            TextField(heyAmrita.isListening ? "Say “Hey Amrita”, or type…" : "Tell Amrita how you're feeling…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .font(Theme.body)
                .focused($inputFocused)
                .submitLabel(.send)
                .onSubmit(send)
            if voice != nil {
                Button(action: startRecording) {
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
        .background(.white.opacity(0.96), in: Capsule()) // nearly solid: text scrolling behind never shows through
        .overlay(Capsule().stroke(Theme.stone200.opacity(0.7)))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        // The input bar grows with the text size, but stops at a size where
        // the field and send button still fit side by side; the conversation
        // above keeps scaling.
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }

    private func startRecording() {
        inputFocused = false
        voice?.stop()
        let listener = VoiceListener()
        self.listener = listener
        Task { await listener.start() }
    }

    private func answerVoiceRequest() {
        guard voiceRequest > handledVoiceRequest, voice != nil else { return }
        handledVoiceRequest = voiceRequest
        if listener == nil, !model.isStreaming { startRecording() }
    }

    private func stopRecording() {
        listener?.stop()
        listener = nil
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
        // A gentle glide, or a jump with Reduce Motion.
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo(last.id, anchor: .bottom) }
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
