import SwiftUI

@main
struct PranaVedaApp: App {
    @State private var chat = ChatViewModel()
    @State private var catalog = CatalogStore()

    var body: some Scene {
        WindowGroup {
            TabView {
                ChatView(model: chat)
                    .tabItem { Label("Amrita", systemImage: "sparkles") }
                LibraryView(catalog: catalog)
                    .tabItem { Label("Library", systemImage: "figure.mind.and.body") }
            }
            .tint(Theme.lavenderDeep)
            .task { await catalog.loadIfNeeded() }
        }
    }
}
