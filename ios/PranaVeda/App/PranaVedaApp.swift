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
    @State private var tab = AppTab.amrita

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
                ChatView(model: chat, auth: auth, insight: insight, saved: saved, voice: voice)
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
                AccountView(auth: auth, practice: practice, saved: saved) { tab = .amrita }
                    .tabItem { Label("You", systemImage: "person.crop.circle") }
                    .tag(AppTab.you)
            }
            .tint(Theme.lavenderDeep)
            // Every screen that can finish a practice logs it here, and every
            // ritual can be saved.
            .environment(practice)
            .environment(saved)
            .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
            .task {
                chat.auth = auth
                chat.speakReply = { [voice] in voice.speak($0) }
                chat.stopSpeaking = { [voice] in voice.stop() }
                practice.auth = auth
                auth.onSignedIn = { [chat, practice] user in
                    await chat.adoptAccountProfile(for: user)
                    await practice.adoptAccount(user)
                }
                auth.onSignedOut = { [chat, practice] in
                    chat.handBackDevice()
                    practice.handBackDevice()
                }
                await auth.restore()
            }
            .task { await catalog.loadIfNeeded() }
        }
    }
}
