import Foundation

/// The signed-in person, as /api/me and the sign-in endpoints describe them.
struct AccountUser: Codable, Hashable, Sendable {
    let id: String
    let email: String?
    let displayName: String?
    let timezone: String?
}

/// A native session: the server hands native apps their tokens directly
/// (the website keeps them in cookies instead).
struct SessionResponse: Decodable, Sendable {
    let user: AccountUser?
    let accessToken: String
    let refreshToken: String
    let expiresIn: Double
}

/// The wellness profile stored in the account. Version 0: none yet.
struct VersionedProfile: Decodable, Sendable {
    let profile: JSONValue
    let version: Int
}

enum AccountError: LocalizedError, Equatable {
    /// This email already has an account, made with another sign-in method.
    case accountExists(provider: String)
    /// The refresh token is no longer valid: the session is over.
    case sessionEnded
    /// The server answered something else; sign-in or sync is unavailable.
    case unavailable(Int)

    var errorDescription: String? {
        switch self {
        case .accountExists(let provider):
            let name = ["google": "Google", "apple": "Apple"][provider] ?? "your other sign-in"
            return "This email already has a PranaVeda account. Please continue with \(name) instead."
        case .sessionEnded: return "Your session has ended. Please sign in again."
        case .unavailable: return "Sign-in is not available right now. Please try again."
        }
    }
}

/// What kind of device this is, for the account's list of signed-in devices.
/// Coarse on purpose, matching what the server keeps (see api/_lib/device.ts).
struct DeviceDescription: Encodable, Sendable {
    let deviceClass: String
    let osVersion: String
    let deviceModel: String
    let appVersion: String
}

extension APIClient {
    private func request(_ method: String, _ path: String, bearer: String? = nil, body: (any Encodable)? = nil) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 30
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        return request
    }

    private func send(_ request: URLRequest) async throws -> (Data, Int) {
        let (data, response) = try await session.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    private struct ErrorBody: Decodable { let error: String?; let provider: String? }

    func signInNonce() async throws -> String {
        struct Body: Decodable { let nonce: String }
        let (data, status) = try await send(request("GET", "api/auth/nonce"))
        guard status == 200 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(Body.self, from: data).nonce
    }

    func signInWithGoogle(idToken: String, nonce: String, device: DeviceDescription) async throws -> SessionResponse {
        struct Body: Encodable { let credential: String; let nonce: String; let client = "ios"; let device: DeviceDescription }
        let (data, status) = try await send(request("POST", "api/auth/google", body: Body(credential: idToken, nonce: nonce, device: device)))
        if status == 409, let body = try? JSONDecoder().decode(ErrorBody.self, from: data), body.error == "account_exists" {
            throw AccountError.accountExists(provider: body.provider ?? "")
        }
        guard status == 200 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(SessionResponse.self, from: data)
    }

    func signInWithApple(_ credential: AppleCredential, nonce: String, device: DeviceDescription) async throws -> SessionResponse {
        struct Name: Encodable { let firstName: String?; let lastName: String? }
        struct Body: Encodable {
            let idToken: String; let code: String?; let nonce: String; let name: Name?
            let client = "ios"; let device: DeviceDescription
        }
        // Apple gives the name only on the first sign-in; the server uses it
        // for a new account's display name and ignores it otherwise.
        let name = (credential.givenName ?? credential.familyName) == nil ? nil : Name(firstName: credential.givenName, lastName: credential.familyName)
        let body = Body(idToken: credential.idToken, code: credential.authorizationCode, nonce: nonce, name: name, device: device)
        let (data, status) = try await send(request("POST", "api/auth/apple", body: body))
        if status == 409, let body = try? JSONDecoder().decode(ErrorBody.self, from: data), body.error == "account_exists" {
            throw AccountError.accountExists(provider: body.provider ?? "")
        }
        guard status == 200 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(SessionResponse.self, from: data)
    }

    /// A new access token (and rotated refresh token) for a session.
    func refreshSession(refreshToken: String) async throws -> SessionResponse {
        struct Body: Encodable { let client = "ios"; let refreshToken: String }
        let (data, status) = try await send(request("POST", "api/auth/refresh", body: Body(refreshToken: refreshToken)))
        if status == 401 { throw AccountError.sessionEnded }
        guard status == 200 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(SessionResponse.self, from: data)
    }

    func signOut(refreshToken: String) async throws {
        struct Body: Encodable { let client = "ios"; let refreshToken: String }
        _ = try await send(request("POST", "api/auth/logout", body: Body(refreshToken: refreshToken)))
    }

    /// Permanent: removes the account and everything the server holds for it.
    func deleteAccount(accessToken: String) async throws {
        struct Body: Encodable { let confirm = true }
        let (_, status) = try await send(request("DELETE", "api/me", bearer: accessToken, body: Body()))
        guard status == 204 else { throw AccountError.unavailable(status) }
    }

    func fetchAccountProfile(accessToken: String) async throws -> VersionedProfile {
        let (data, status) = try await send(request("GET", "api/sync/profile", bearer: accessToken))
        guard status == 200 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(VersionedProfile.self, from: data)
    }

    /// Sets the account's experience (nil clears it); the rest of the profile is
    /// left as it is. Returns what is stored now.
    func saveAccountExperience(_ experience: String?, accessToken: String) async throws -> VersionedProfile {
        struct Body: Encodable {
            let experience: String?
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(experience, forKey: .experience) // null, not left out, to clear it
            }
            enum CodingKeys: String, CodingKey { case experience }
        }
        let (data, status) = try await send(request("POST", "api/sync/profile/experience", bearer: accessToken, body: Body(experience: experience)))
        guard status == 200 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(VersionedProfile.self, from: data)
    }

    /// Saves the profile if nobody has saved since `baseVersion`; either way,
    /// returns what is stored now.
    func saveAccountProfile(_ profile: JSONValue, baseVersion: Int, accessToken: String) async throws -> VersionedProfile {
        struct Body: Encodable { let profile: JSONValue; let baseVersion: Int }
        let (data, status) = try await send(request("PUT", "api/sync/profile", bearer: accessToken, body: Body(profile: profile, baseVersion: baseVersion)))
        guard status == 200 || status == 409 else { throw AccountError.unavailable(status) }
        return try JSONDecoder().decode(VersionedProfile.self, from: data)
    }
}
