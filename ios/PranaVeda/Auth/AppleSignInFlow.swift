import AuthenticationServices
import CryptoKit
import UIKit

/// What Sign in with Apple hands back: Apple's signed identity token, a
/// one-time code the server trades for Apple's refresh token (needed to revoke
/// access when the account is deleted), Apple's stable id for the person, and
/// their name, which Apple gives only on the very first sign-in.
struct AppleCredential: Sendable, Equatable {
    let idToken: String
    let authorizationCode: String?
    let userID: String
    let givenName: String?
    let familyName: String?
}

/// Asks Apple who the person is. The server verifies the token, and the nonce
/// in it, before creating a session.
@MainActor
protocol AppleIdentityProvider {
    func credential(nonce: String) async throws -> AppleCredential
    /// Whether the person still lets PranaVeda use their Apple ID (they can
    /// stop it in Settings → Apple Account → Sign in with Apple).
    func isRevoked(userID: String) async -> Bool
}

@MainActor
final class AppleSignInFlow: NSObject, AppleIdentityProvider {
    private var continuation: CheckedContinuation<AppleCredential, Error>?
    private var controller: ASAuthorizationController?

    func credential(nonce: String) async throws -> AppleCredential {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        // Apple puts this in the token; the server checks it is the SHA-256 of
        // the nonce it issued, so a token cannot be replayed.
        request.nonce = Self.sha256(nonce)

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    func isRevoked(userID: String) async -> Bool {
        let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: userID)
        return state == .revoked || state == .notFound
    }

    nonisolated static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func finish(_ result: Result<AppleCredential, Error>) {
        continuation?.resume(with: result)
        continuation = nil
        controller = nil
    }
}

extension AppleSignInFlow: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential
        let result: Result<AppleCredential, Error>
        if let credential, let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8) {
            result = .success(AppleCredential(
                idToken: token,
                authorizationCode: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) },
                userID: credential.user,
                givenName: credential.fullName?.givenName,
                familyName: credential.fullName?.familyName
            ))
        } else {
            result = .failure(AccountError.unavailable(0))
        }
        MainActor.assumeIsolated { finish(result) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        MainActor.assumeIsolated { finish(.failure(cancelled ? SignInCancelled() : error)) }
    }
}

extension AppleSignInFlow: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
            return scene?.keyWindow ?? ASPresentationAnchor()
        }
    }
}
