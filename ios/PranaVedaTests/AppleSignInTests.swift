import Foundation
import Testing
@testable import PranaVeda

@MainActor
@Suite(.serialized)
struct AppleSignInTests {
    let user = AccountUser(id: "u1", email: "meera@example.com", displayName: "Meera Iyer", timezone: nil)

    @Test func signsInWithAppleAndSendsWhatTheServerNeeds() async throws {
        StubURLProtocol.reset { request in
            switch request.path {
            case "/api/auth/nonce": (200, #"{"nonce":"n1"}"#)
            case "/api/auth/apple": (200, session("access-1", "refresh-1"))
            default: (404, "{}")
            }
        }
        let storage = InMemorySessionStorage()
        let apple = FakeApple()
        let auth = AuthStore(api: stubAPI(), storage: storage, google: FakeGoogle(), apple: apple)
        var signedInAs: AccountUser?
        auth.onSignedIn = { signedInAs = $0 }

        await auth.signInWithApple()

        #expect(apple.noncesAskedFor == ["n1"])
        let sent = try #require(StubURLProtocol.requests(to: "/api/auth/apple").first?.body)
        #expect(sent["idToken"] as? String == "apple-id-token")
        #expect(sent["code"] as? String == "apple-code")
        #expect(sent["nonce"] as? String == "n1")
        #expect(sent["client"] as? String == "ios")
        let name = try #require(sent["name"] as? [String: Any])
        #expect(name["firstName"] as? String == "Meera")
        #expect(name["lastName"] as? String == "Iyer")
        #expect(sent["device"] is [String: Any])
        #expect(auth.user?.displayName == "Meera Iyer")
        #expect(storage.refreshToken == "refresh-1")
        #expect(storage.appleUserID == "apple-user-1")
        #expect(signedInAs?.id == "u1")
        #expect(auth.problem == nil)
    }

    @Test func sendsNoNameWhenAppleGivesNone() async throws {
        // Apple gives the name only on the very first sign-in.
        StubURLProtocol.reset { request in
            request.path == "/api/auth/nonce" ? (200, #"{"nonce":"n1"}"#) : (200, session("access-1", "refresh-1"))
        }
        let apple = FakeApple()
        apple.result = .success(AppleCredential(idToken: "t", authorizationCode: nil, userID: "apple-user-1", givenName: nil, familyName: nil))
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(), google: FakeGoogle(), apple: apple)
        await auth.signInWithApple()
        let sent = try #require(StubURLProtocol.requests(to: "/api/auth/apple").first?.body)
        #expect(sent["name"] == nil)
        #expect(sent["code"] == nil)
        #expect(auth.isSignedIn)
    }

    @Test func explainsWhenTheEmailAlreadyHasAGoogleAccount() async {
        StubURLProtocol.reset { request in
            request.path == "/api/auth/nonce" ? (200, #"{"nonce":"n1"}"#) : (409, #"{"error":"account_exists","provider":"google"}"#)
        }
        let storage = InMemorySessionStorage()
        let auth = AuthStore(api: stubAPI(), storage: storage, google: FakeGoogle(), apple: FakeApple())
        await auth.signInWithApple()
        #expect(!auth.isSignedIn)
        #expect(storage.appleUserID == nil)
        #expect(auth.problem == "This email already has a PranaVeda account. Please continue with Google instead.")
    }

    @Test func closingApplesSheetIsNotAnError() async {
        StubURLProtocol.reset { _ in (200, #"{"nonce":"n1"}"#) }
        let apple = FakeApple()
        apple.result = .failure(SignInCancelled())
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(), google: FakeGoogle(), apple: apple)
        await auth.signInWithApple()
        #expect(!auth.isSignedIn)
        #expect(auth.problem == nil)
        #expect(StubURLProtocol.requests(to: "/api/auth/apple").isEmpty)
    }

    @Test func signsOutAtLaunchWhenTheAppleIDNoLongerAllowsPranaVeda() async {
        StubURLProtocol.reset { request in
            request.path == "/api/auth/logout" ? (204, "") : (200, session("access-2", "refresh-2"))
        }
        let storage = InMemorySessionStorage(refreshToken: "refresh-1", user: user, appleUserID: "apple-user-1")
        let apple = FakeApple()
        apple.revoked = true
        let auth = AuthStore(api: stubAPI(), storage: storage, google: FakeGoogle(), apple: apple)
        var signedOut = 0
        auth.onSignedOut = { signedOut += 1 }

        await auth.restore()

        #expect(apple.revocationChecks == ["apple-user-1"])
        #expect(!auth.isSignedIn)
        #expect(signedOut == 1)
        #expect(storage.refreshToken == nil)
        #expect(storage.appleUserID == nil)
        #expect(StubURLProtocol.requests(to: "/api/auth/logout").count == 1)
    }

    @Test func keepsAStillAllowedAppleSessionAndChecksOnlyAppleSessions() async {
        StubURLProtocol.reset { _ in (200, session("access-2", "refresh-2")) }
        let appleStorage = InMemorySessionStorage(refreshToken: "refresh-1", user: user, appleUserID: "apple-user-1")
        let apple = FakeApple()
        let appleAuth = AuthStore(api: stubAPI(), storage: appleStorage, google: FakeGoogle(), apple: apple)
        await appleAuth.restore()
        #expect(appleAuth.isSignedIn)
        #expect(apple.revocationChecks == ["apple-user-1"])

        let googleApple = FakeApple()
        let googleAuth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: googleApple)
        await googleAuth.restore()
        #expect(googleAuth.isSignedIn)
        #expect(googleApple.revocationChecks.isEmpty)
    }

    @Test func hashesTheNonceTheWayTheServerChecksIt() {
        // The server accepts SHA-256(nonce) in lowercase hex (api/_lib/apple.ts);
        // this is the standard SHA-256 test vector.
        #expect(AppleSignInFlow.sha256("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
}
