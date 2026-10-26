import Foundation
import Testing
@testable import PranaVeda

@MainActor
@Suite(.serialized)
struct AuthTests {
    let user = AccountUser(id: "u1", email: "meera@example.com", displayName: "Meera Iyer", timezone: nil)

    @Test func signsInWithGoogleAndKeepsTheSession() async throws {
        StubURLProtocol.reset { request in
            switch request.path {
            case "/api/auth/nonce": (200, #"{"nonce":"n1"}"#)
            case "/api/auth/google": (200, session("access-1", "refresh-1"))
            default: (404, "{}")
            }
        }
        let storage = InMemorySessionStorage()
        let google = FakeGoogle()
        let auth = AuthStore(api: stubAPI(), storage: storage, google: google)
        var signedInAs: AccountUser?
        auth.onSignedIn = { signedInAs = $0 }

        await auth.signInWithGoogle()

        #expect(google.noncesAskedFor == ["n1"])
        let sent = try #require(StubURLProtocol.requests(to: "/api/auth/google").first?.body)
        #expect(sent["credential"] as? String == "google-id-token")
        #expect(sent["nonce"] as? String == "n1")
        #expect(sent["client"] as? String == "ios")
        let device = try #require(sent["device"] as? [String: Any])
        #expect(device["deviceClass"] as? String == "phone")
        #expect((device["deviceModel"] as? String)?.isEmpty == false)
        #expect(auth.user?.displayName == "Meera Iyer")
        #expect(storage.refreshToken == "refresh-1")
        #expect(storage.user == auth.user)
        #expect(signedInAs?.id == "u1")
        #expect(auth.problem == nil)
    }

    @Test func explainsWhenTheEmailAlreadyHasAnAccount() async {
        StubURLProtocol.reset { request in
            request.path == "/api/auth/nonce" ? (200, #"{"nonce":"n1"}"#) : (409, #"{"error":"account_exists","provider":"apple"}"#)
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(), google: FakeGoogle())
        await auth.signInWithGoogle()
        #expect(!auth.isSignedIn)
        #expect(auth.problem == "This email already has a PranaVeda account. Please continue with Apple instead.")
    }

    @Test func closingGooglesSheetIsNotAnError() async {
        StubURLProtocol.reset { _ in (200, #"{"nonce":"n1"}"#) }
        let google = FakeGoogle()
        google.result = .failure(SignInCancelled())
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(), google: google)
        await auth.signInWithGoogle()
        #expect(!auth.isSignedIn)
        #expect(auth.problem == nil)
        #expect(StubURLProtocol.requests(to: "/api/auth/google").isEmpty)
    }

    @Test func aStoredSessionShowsAsSignedInAndRefreshesOnlyWhenNeeded() async {
        StubURLProtocol.reset { _ in (200, session("access-2", "refresh-2")) }
        let storage = InMemorySessionStorage(refreshToken: "refresh-1", user: user)
        var clock = Date(timeIntervalSince1970: 1_000_000)
        let auth = AuthStore(api: stubAPI(), storage: storage, google: FakeGoogle(), now: { clock })
        #expect(auth.isSignedIn) // straight away, before any network

        #expect(await auth.validAccessToken() == "access-2")
        #expect(await auth.validAccessToken() == "access-2")
        #expect(StubURLProtocol.requests(to: "/api/auth/refresh").count == 1)
        #expect(StubURLProtocol.requests(to: "/api/auth/refresh").first?.body?["refreshToken"] as? String == "refresh-1")
        #expect(storage.refreshToken == "refresh-2") // rotated

        clock = clock.addingTimeInterval(900)
        _ = await auth.validAccessToken()
        #expect(StubURLProtocol.requests(to: "/api/auth/refresh").count == 2)
    }

    @Test func anEndedSessionSignsOutAndClearsTheStoredSession() async {
        StubURLProtocol.reset { _ in (401, #"{"error":"session_expired"}"#) }
        let storage = InMemorySessionStorage(refreshToken: "revoked", user: user)
        let google = FakeGoogle()
        let auth = AuthStore(api: stubAPI(), storage: storage, google: google)
        var signedOut = false
        auth.onSignedOut = { signedOut = true }

        #expect(await auth.validAccessToken() == nil)
        #expect(!auth.isSignedIn)
        #expect(storage.refreshToken == nil)
        #expect(storage.user == nil)
        #expect(signedOut)
        #expect(google.signOuts == 1)
    }

    @Test func stayingSignedInWhenTheServerCannotBeReached() async {
        StubURLProtocol.reset { _ in (503, "{}") }
        let storage = InMemorySessionStorage(refreshToken: "refresh-1", user: user)
        let auth = AuthStore(api: stubAPI(), storage: storage, google: FakeGoogle())
        #expect(await auth.validAccessToken() == nil)
        #expect(auth.isSignedIn)
        #expect(storage.refreshToken == "refresh-1")
    }

    @Test func signingOutEndsTheSessionOnTheServerToo() async {
        StubURLProtocol.reset { _ in (204, "") }
        let storage = InMemorySessionStorage(refreshToken: "refresh-1", user: user)
        let auth = AuthStore(api: stubAPI(), storage: storage, google: FakeGoogle())
        await auth.signOut()
        #expect(!auth.isSignedIn)
        #expect(storage.refreshToken == nil)
        #expect(StubURLProtocol.requests(to: "/api/auth/logout").first?.body?["refreshToken"] as? String == "refresh-1")
    }

    // MARK: Chat and profile, signed in

    private func signedInChat(defaults: UserDefaults, handler: @escaping (StubURLProtocol.Recorded) -> (Int, String)) -> (ChatViewModel, AuthStore) {
        StubURLProtocol.reset(handler)
        let api = stubAPI()
        let auth = AuthStore(api: api, storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle())
        let chat = ChatViewModel(api: api, defaults: defaults)
        // The chat holds its sign-in weakly (the app owns it), so each test
        // keeps the returned AuthStore alive until it is done.
        chat.auth = auth
        return (chat, auth)
    }

    private func waitForReply(_ chat: ChatViewModel) async {
        for _ in 0..<200 where chat.isStreaming { try? await Task.sleep(for: .milliseconds(10)) }
    }

    // MARK: Experience (G2)

    @Test func signedOutExperienceIsKeptOnTheDevice() async {
        StubURLProtocol.reset { _ in (404, "{}") }
        let chat = ChatViewModel(api: stubAPI(), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        #expect(chat.experience == nil)
        #expect(await chat.changeExperience("regular"))
        #expect(chat.experience == "regular")
        #expect(await chat.changeExperience(nil))
        #expect(chat.experience == nil)
        #expect(StubURLProtocol.requests(to: "/api/sync/profile/experience").isEmpty)
    }

    @Test func signedInExperienceIsSetOnTheAccount() async {
        let (chat, auth) = signedInChat(defaults: UserDefaults(suiteName: UUID().uuidString)!) { request in
            switch request.path {
            case "/api/auth/refresh": return (200, session("access-1", "refresh-2"))
            case "/api/sync/profile/experience":
                return (200, #"{"profile":{"name":"Meera","experience":"experienced"},"version":4}"#)
            default: return (404, "{}")
            }
        }
        #expect(await chat.changeExperience("experienced"))
        #expect(chat.experience == "experienced")
        #expect(chat.profileName == "Meera")
        let sent = StubURLProtocol.requests(to: "/api/sync/profile/experience").first
        #expect(sent?.body?["experience"] as? String == "experienced")
        #expect(sent?.authorization == "Bearer access-1")
        _ = auth
    }

    @Test func catalogMarksExperiencedOnlyPoses() throws {
        let json = #"""
        {"poses":[
          {"id":"warrior_3","nameSanskrit":"Virabhadrasana III","nameEnglish":"Warrior III","level":"Intermediate","bodyFocus":"Balance","cues":[],"benefits":"x","contraindications":[],"minExperience":"experienced"},
          {"id":"tadasana","nameSanskrit":"Tadasana","nameEnglish":"Mountain Pose","level":"Beginner","bodyFocus":"Posture","cues":[],"benefits":"x","contraindications":[]}],
         "breathwork":[]}
        """#
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(json.utf8))
        #expect(catalog.poses.map(\.experiencedOnly) == [true, false])
    }

    @Test func chatIsSentAsTheSignedInPersonAndRetriedOnceAfterAnExpiredSignIn() async throws {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        var refreshes = 0
        let (chat, auth) = signedInChat(defaults: defaults) { request in
            switch request.path {
            case "/api/auth/refresh":
                refreshes += 1
                return (200, session("access-\(refreshes)", "refresh-\(refreshes + 1)"))
            case "/api/chat":
                // The first token is refused, as if it had just expired.
                if request.authorization == "Bearer access-1" { return (401, #"{"error":"token_expired"}"#) }
                return (200, "data: {\"type\":\"text\",\"delta\":\"Welcome back.\"}\n\ndata: {\"type\":\"done\"}\n\n")
            default: return (404, "{}")
            }
        }

        chat.send("Hello")
        await waitForReply(chat)

        #expect(StubURLProtocol.requests(to: "/api/chat").map(\.authorization) == ["Bearer access-1", "Bearer access-2"])
        #expect(chat.items.last?.text == "Welcome back.")
        #expect(chat.items.last?.failed == false)
        withExtendedLifetime(auth) {}
    }

    @Test func firstSignInMakesThisPhonesProfileTheAccountsWhenItHasNone() async throws {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        defaults.set(try JSONEncoder().encode(JSONValue.object(["name": .string("Meera")])), forKey: "pranaveda_profile")
        let (chat, auth) = signedInChat(defaults: defaults) { request in
            switch (request.method, request.path) {
            case (_, "/api/auth/refresh"): (200, session("access-1", "refresh-2"))
            case ("GET", "/api/sync/profile"): (200, #"{"profile":{},"version":0}"#)
            case ("PUT", "/api/sync/profile"): (200, #"{"profile":{"name":"Meera"},"version":1}"#)
            default: (404, "{}")
            }
        }

        await chat.adoptAccountProfile(for: user)

        let put = try #require(StubURLProtocol.requests(to: "/api/sync/profile").first { $0.method == "PUT" })
        #expect(put.body?["baseVersion"] as? Int == 0)
        #expect((put.body?["profile"] as? [String: Any])?["name"] as? String == "Meera")
        #expect(put.authorization == "Bearer access-1")
        #expect(chat.profileName == "Meera")
        withExtendedLifetime(auth) {}
    }

    @Test func anExistingAccountProfileReplacesThePhonesAndIsHandedBackOnSignOut() async throws {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        defaults.set(try JSONEncoder().encode(JSONValue.object(["name": .string("Phone Guest")])), forKey: "pranaveda_profile")
        let (chat, auth) = signedInChat(defaults: defaults) { request in
            switch (request.method, request.path) {
            case (_, "/api/auth/refresh"): (200, session("access-1", "refresh-2"))
            case ("GET", "/api/sync/profile"): (200, #"{"profile":{"name":"Meera Iyer","goals":["sleep better"]},"version":4}"#)
            default: (404, "{}")
            }
        }

        await chat.adoptAccountProfile(for: user)
        #expect(chat.profileName == "Meera Iyer")
        #expect(StubURLProtocol.requests(to: "/api/sync/profile").allSatisfy { $0.method == "GET" })

        // A later launch must not take the account's copy for the phone's own.
        await chat.adoptAccountProfile(for: user)

        chat.handBackDevice()
        #expect(chat.profileName == "Phone Guest")
        chat.handBackDevice() // nothing left to hand back
        #expect(chat.profileName == "Phone Guest")
        withExtendedLifetime(auth) {}
    }

    // MARK: Speaking to Amrita

    @Test func aSpokenMessageIsMarkedAsVoiceAndItsReplyIsReadAloud() async {
        StubURLProtocol.reset { request in
            request.path == "/api/chat"
                ? (200, "data: {\"type\":\"text\",\"delta\":\"Let us **slow** the breath.\"}\n\ndata: {\"type\":\"done\"}\n\n")
                : (404, "{}")
        }
        let chat = ChatViewModel(api: stubAPI(), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        var spoken: [String] = []
        var stops = 0
        chat.speakReply = { spoken.append($0) }
        chat.stopSpeaking = { stops += 1 }

        chat.send("I feel scattered", spoken: true)
        await waitForReply(chat)
        #expect(StubURLProtocol.requests(to: "/api/chat").last?.body?["inputMode"] as? String == "voice")
        #expect(spoken == ["Let us **slow** the breath."])

        chat.send("Thank you")
        await waitForReply(chat)
        #expect(StubURLProtocol.requests(to: "/api/chat").last?.body?["inputMode"] as? String == "text")
        #expect(spoken.count == 1) // a typed message's reply stays silent
        #expect(stops == 2) // each new message stops what was still being said
    }

    @Test func usesTheServersVoiceOnlyWhenItHasOne() async throws {
        StubURLProtocol.reset { request in
            request.body?["text"] as? String == "configured" ? (200, "ID3-mp3-bytes") : (503, #"{"unavailable":true}"#)
        }
        #expect(try await stubAPI().speech("configured") == Data("ID3-mp3-bytes".utf8))
        #expect(try await stubAPI().speech("not configured") == nil) // the phone's own voice speaks instead
    }
}
