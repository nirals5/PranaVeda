import GoogleSignIn
import SwiftUI
import UIKit

@main
struct PranaVedaApp: App {
    @State private var chat = ChatViewModel()
    @State private var catalog = CatalogStore()
    @State private var auth = AuthStore()
    @State private var doshaGuide = DoshaGuideStore()
    @State private var practice = PracticeStore()
    @State private var insight = DailyInsightStore()
    @State private var saved = SavedRitualStore()
    @State private var voice = AmritaVoice()
    @State private var health = HealthStore()
    @State private var tab = AppTab.amrita
    /// Raised by the widgets' "Talk to Amrita": the chat starts listening.
    @State private var voiceRequest = 0
    /// A saved ritual opened from a widget.
    @State private var openedRitual: SavedRitual?
    /// Links from intents (the Talk to Amrita control).
    @State private var router = AppLinkRouter.shared

    enum AppTab: Hashable { case amrita, dosha, library, you }

    init() {
        // Screen titles in the serif, like headings everywhere else. Scaled
        // with the reader's text size, as the system's own titles are.
        func playfair(_ size: CGFloat, _ style: UIFont.TextStyle) -> UIFont? {
            UIFont(name: "PlayfairDisplay-Regular", size: size).map { UIFontMetrics(forTextStyle: style).scaledFont(for: $0) }
        }
        let bar = UINavigationBar.appearance()
        if let large = playfair(34, .largeTitle) { bar.largeTitleTextAttributes = [.font: large] }
        if let inline = playfair(19, .headline) { bar.titleTextAttributes = [.font: inline] }
    }

    var body: some Scene {
        WindowGroup {
            TabView(selection: $tab) {
                ChatView(model: chat, auth: auth, insight: insight, saved: saved, voice: voice, voiceRequest: voiceRequest)
                    .tabItem { Label("Ask Amrita", systemImage: "sparkles") }
                    .tag(AppTab.amrita)
                DoshaProfileView(profile: chat.profile, guide: doshaGuide) { message in
                    // As on the website: over to the chat, with the question asked.
                    tab = .amrita
                    chat.send(message)
                }
                    .tabItem { Label("Dosha", systemImage: "wind") }
                    .tag(AppTab.dosha)
                LibraryView(catalog: catalog)
                    .tabItem { Label("Library", systemImage: "figure.mind.and.body") }
                    .tag(AppTab.library)
                AccountView(auth: auth, practice: practice, saved: saved, health: health) { tab = .amrita }
                    .tabItem { Label("You", systemImage: "person.crop.circle") }
                    .tag(AppTab.you)
            }
            .tint(Theme.lavenderDeep)
            // Every screen that can finish a practice logs it here, and every
            // ritual can be saved.
            .environment(practice)
            .environment(saved)
            .onOpenURL { url in
                if url.scheme == WidgetLink.scheme { open(url) } else { GIDSignIn.sharedInstance.handle(url) }
            }
            .onChange(of: router.pending, initial: true) {
                guard let url = router.pending else { return }
                router.pending = nil
                open(url)
            }
            .sheet(item: $openedRitual) { RitualDetailView(result: $0.result) }
            // The widgets show what the app knows; keep them in step.
            .onChange(of: practice.entries, initial: true) { publishToWidgets() }
            .onChange(of: saved.rituals) { publishToWidgets() }
            .onChange(of: insight.state) { publishToWidgets() }
            .task {
                chat.auth = auth
                chat.speakReply = { [voice] in voice.speak($0) }
                chat.stopSpeaking = { [voice] in voice.stop() }
                practice.auth = auth
                saved.auth = auth
                auth.onSignedIn = { [chat, practice, saved] user in
                    await chat.adoptAccountProfile(for: user)
                    await practice.adoptAccount(user)
                    await saved.adoptAccount(user)
                }
                auth.onSignedOut = { [chat, practice, saved] in
                    chat.handBackDevice()
                    practice.handBackDevice()
                    saved.handBackDevice()
                }
                await auth.restore()
            }
            .task { await catalog.loadIfNeeded() }
        }
    }

    private func publishToWidgets() {
        WidgetBridge.publish(entries: practice.entries, saved: saved.rituals, insight: insight.state)
    }

    /// pranaveda://talk, pranaveda://you, pranaveda://ritual/<id>
    private func open(_ url: URL) {
        switch url.host() {
        case "talk":
            tab = .amrita
            voiceRequest += 1
        case "you":
            tab = .you
        case "ritual":
            let id = url.lastPathComponent
            if let ritual = saved.rituals.first(where: { $0.id == id }) { openedRitual = ritual } else { tab = .you }
        default:
            break
        }
    }
}
