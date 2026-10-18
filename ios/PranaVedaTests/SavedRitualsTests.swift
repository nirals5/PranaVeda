import Foundation
import Testing
@testable import PranaVeda

private func ritual(_ title: String) -> RecommendationResult {
    RecommendationResult(
        summary: "For \(title)", doshaTendency: nil, primaryEnergy: "Scattered Wind",
        yogaPractice: YogaPractice(title: title, description: nil, poses: [], durationMinutes: 10),
        ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil
    )
}

@MainActor
struct SavedRitualsTests {
    private func freshStore() -> (SavedRitualStore, URL) {
        let file = FileManager.default.temporaryDirectory.appending(path: "saved-\(UUID().uuidString).json")
        return (SavedRitualStore(fileURL: file, defaults: UserDefaults(suiteName: UUID().uuidString)!), file)
    }

    @Test func savesNewestFirstAndKeepsThemAcrossLaunches() {
        let (store, file) = freshStore()
        let now = PracticeLog.isoFormatter.date(from: "2026-10-17T18:00:00.000Z")!
        #expect(store.toggle(ritual("Morning"), now: now))
        #expect(store.toggle(ritual("Evening"), now: now.addingTimeInterval(60)))
        #expect(store.rituals.map(\.title) == ["Evening", "Morning"])
        #expect(store.rituals.first?.id.hasPrefix("save_\(Int(now.timeIntervalSince1970 * 1000) + 60_000)_") == true)
        #expect(store.isSaved(ritual("Morning")))
        #expect(!store.isSaved(ritual("Midday")))
        #expect(SavedRitualStore(fileURL: file).rituals.map(\.title) == ["Evening", "Morning"])
    }

    @Test func savingTheSameRitualAgainRemovesIt() {
        let (store, _) = freshStore()
        store.toggle(ritual("Morning"))
        #expect(!store.toggle(ritual("Morning")))
        #expect(store.rituals.isEmpty)
    }

    @Test func removesOne() {
        let (store, file) = freshStore()
        store.toggle(ritual("Morning"))
        store.toggle(ritual("Evening"))
        store.remove(store.rituals[0])
        #expect(store.rituals.map(\.title) == ["Morning"])
        #expect(SavedRitualStore(fileURL: file).rituals.map(\.title) == ["Morning"])
    }

    @Test func readsTheWebsitesShape() throws {
        let json = #"[{"id":"temp_1","title":"Grounding","date":"Oct 12","query":"I feel scattered","category":"Yoga","result":{"summary":"s","yogaPractice":{"title":"Grounding","poses":[]}}}]"#
        let saved = try JSONDecoder().decode([SavedRitual].self, from: Data(json.utf8))
        #expect(saved.first?.query == "I feel scattered")
        #expect(SavedRitualStore.savedDate(PracticeLog.isoFormatter.date(from: "2026-10-17T18:00:00.000Z")!, locale: Locale(identifier: "en_US")) == "Oct 17")
    }
}

struct SavedRitualReconcileTests {
    private func saved(_ id: String) -> SavedRitual {
        SavedRitual(id: id, title: id, date: "Oct 17", query: "", category: "Yoga",
                    result: RecommendationResult(summary: nil, doshaTendency: nil, primaryEnergy: nil,
                                                 yogaPractice: YogaPractice(title: id, description: nil, poses: [], durationMinutes: nil),
                                                 ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil))
    }

    @Test func addsWhatWasSavedElsewhereAndDropsWhatWasRemovedElsewhere() {
        let a = saved("save_1760000000001"), b = saved("save_1760000000002"), c = saved("save_1760000000003_ab12c")
        let out = SavedRitualStore.reconcile(local: [a, b], account: [c, b], synced: [a.id, b.id], pendingRemoves: [])
        #expect(out.rituals.map(\.id) == [c.id, b.id])
        #expect(Set(out.synced) == [b.id, c.id])
        // Not yet uploaded: kept.
        #expect(SavedRitualStore.reconcile(local: [a, c], account: [b], synced: [b.id], pendingRemoves: []).rituals.map(\.id) == [c.id, b.id, a.id])
        // Just removed here: not brought back.
        let removed = SavedRitualStore.reconcile(local: [], account: [b], synced: [b.id], pendingRemoves: [b.id])
        #expect(removed.rituals.isEmpty && removed.synced.isEmpty)
    }

    @Test func readsWhenARitualWasSavedFromItsId() {
        #expect(SavedRitualStore.savedMillis("save_1760000000003_ab12c") == 1760000000003)
        #expect(SavedRitualStore.savedMillis("temp_1760000000004") == 1760000000004)
        #expect(SavedRitualStore.savedMillis("something") == 0)
    }
}

/// The account's list as a server keeps it: saves are added, removals stay removed.
private final class FakeAccount: @unchecked Sendable {
    var rituals: [String: [String: Any]] = [:]
    var order: [String] = []
    var removed: Set<String> = []

    init(_ json: String...) {
        for item in json { add(try! JSONSerialization.jsonObject(with: Data(item.utf8)) as! [String: Any]) }
    }

    func add(_ ritual: [String: Any]) {
        guard let id = ritual["id"] as? String, rituals[id] == nil, !removed.contains(id) else { return }
        rituals[id] = ritual
        order.insert(id, at: 0)
    }

    func remove(_ id: String) {
        removed.insert(id)
        rituals[id] = nil
        order.removeAll { $0 == id }
    }

    func handle(_ request: StubURLProtocol.Recorded) -> (Int, String) {
        switch request.method {
        case "POST":
            (request.body?["removes"] as? [String])?.forEach(remove)
            (request.body?["saves"] as? [[String: Any]])?.forEach(add)
            return (200, #"{"stored":0,"removed":0}"#)
        default:
            let list = order.compactMap { rituals[$0] }
            let data = try! JSONSerialization.data(withJSONObject: ["rituals": list])
            return (200, String(decoding: data, as: UTF8.self))
        }
    }
}

@MainActor
@Suite(.serialized)
struct SavedRitualSyncTests {
    let user = AccountUser(id: "u1", email: "meera@example.com", displayName: "Meera Iyer", timezone: nil)
    let fromWebsite = #"{"id":"save_1760000000009","title":"From the website","date":"Oct 12","query":"I feel heavy","category":"Yoga","result":{"summary":"s","yogaPractice":{"title":"From the website","poses":[]}}}"#

    private func signedIn(_ handler: @escaping (StubURLProtocol.Recorded) -> (Int, String)) -> (SavedRitualStore, AuthStore, UserDefaults) {
        StubURLProtocol.reset { request in
            request.path == "/api/auth/refresh" ? (200, session("access-1", "refresh-2")) : handler(request)
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: FakeApple())
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let store = SavedRitualStore(fileURL: FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).json"), api: stubAPI(), defaults: defaults)
        store.auth = auth
        return (store, auth, defaults)
    }

    private func ritual(_ title: String) -> RecommendationResult {
        RecommendationResult(summary: title, doshaTendency: nil, primaryEnergy: nil,
                             yogaPractice: YogaPractice(title: title, description: nil, poses: [], durationMinutes: 10),
                             ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil)
    }

    @Test func uploadsThisPhonesRitualsReadsTheAccountsAndSendsRemovals() async throws {
        let account = FakeAccount(fromWebsite)
        let (store, auth, _) = signedIn { request in
            request.path == "/api/sync/saved-rituals" ? account.handle(request) : (404, "{}")
        }
        _ = auth
        store.toggle(ritual("Morning"))
        let mine = try #require(store.rituals.first)

        await store.adoptAccount(user)
        let upload = try #require(StubURLProtocol.requests(to: "/api/sync/saved-rituals").first { $0.method == "POST" })
        #expect(upload.authorization == "Bearer access-1")
        #expect((upload.body?["saves"] as? [[String: Any]])?.map { $0["id"] as? String } == [mine.id])
        #expect(Set(store.rituals.map(\.id)) == [mine.id, "save_1760000000009"])

        // Removed on this phone: the account is told, and it is not brought back.
        let fromSite = try #require(store.rituals.first { $0.id == "save_1760000000009" })
        store.remove(fromSite)
        await store.sync()
        #expect(account.removed == ["save_1760000000009"])
        #expect(store.rituals.map(\.id) == [mine.id])

        // Removed on another device: it leaves this phone too.
        account.remove(mine.id)
        await store.sync()
        #expect(store.rituals.isEmpty)
    }

    @Test func handsBackOnlyThisPhonesOwnRitualsOnSignOut() async throws {
        let account = FakeAccount(fromWebsite)
        let (store, auth, defaults) = signedIn { request in
            request.path == "/api/sync/saved-rituals" ? account.handle(request) : (404, "{}")
        }
        _ = auth
        store.toggle(ritual("Before sign-in"))
        let mine = try #require(store.rituals.first)
        await store.adoptAccount(user)
        #expect(store.rituals.count == 2)
        store.handBackDevice()
        #expect(store.rituals.map(\.id) == [mine.id])
        #expect(defaults.string(forKey: "pranaveda_saved_owner") == nil)
    }

    @Test func nothingIsSentWhileSignedOut() async {
        StubURLProtocol.reset { _ in (200, "{}") }
        let store = SavedRitualStore(fileURL: FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).json"),
                                     api: stubAPI(), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        store.toggle(ritual("Guest"))
        store.remove(store.rituals[0])
        await store.sync()
        #expect(StubURLProtocol.recorded.isEmpty)
    }
}
