import Foundation
@testable import PranaVeda

/// A stand-in for the PranaVeda server: answers requests from a handler and
/// records them, so tests can check what the app sent.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    struct Recorded: @unchecked Sendable {
        let method: String
        let path: String
        let authorization: String?
        let body: [String: Any]?
    }

    nonisolated(unsafe) static var handler: ((Recorded) -> (Int, String))?
    nonisolated(unsafe) static var recorded: [Recorded] = []

    static func reset(_ handler: @escaping (Recorded) -> (Int, String)) {
        self.handler = handler
        recorded = []
    }

    static func requests(to path: String) -> [Recorded] { recorded.filter { $0.path == path } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        var data = request.httpBody
        if data == nil, let stream = request.httpBodyStream {
            stream.open()
            var buffer = Data()
            var chunk = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&chunk, maxLength: chunk.count)
                if read <= 0 { break }
                buffer.append(chunk, count: read)
            }
            stream.close()
            data = buffer
        }
        let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let recorded = Recorded(
            method: request.httpMethod ?? "GET",
            path: request.url?.path ?? "",
            authorization: request.value(forHTTPHeaderField: "Authorization"),
            body: body
        )
        Self.recorded.append(recorded)
        let (status, text) = Self.handler?(recorded) ?? (404, "{}")
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(text.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

func stubAPI() -> APIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubURLProtocol.self]
    return APIClient(baseURL: URL(string: "http://pranaveda.test")!, session: URLSession(configuration: configuration))
}

@MainActor
final class FakeGoogle: GoogleIdentityProvider {
    var result: Result<String, Error> = .success("google-id-token")
    private(set) var noncesAskedFor: [String] = []
    private(set) var signOuts = 0
    func idToken(nonce: String) async throws -> String {
        noncesAskedFor.append(nonce)
        return try result.get()
    }
    func signOut() { signOuts += 1 }
}

final class FakeApple: AppleIdentityProvider {
    var result: Result<AppleCredential, Error> = .success(AppleCredential(
        idToken: "apple-id-token", authorizationCode: "apple-code", userID: "apple-user-1", givenName: "Meera", familyName: "Iyer"
    ))
    var revoked = false
    private(set) var noncesAskedFor: [String] = []
    private(set) var revocationChecks: [String] = []
    func credential(nonce: String) async throws -> AppleCredential {
        noncesAskedFor.append(nonce)
        return try result.get()
    }
    func isRevoked(userID: String) async -> Bool {
        revocationChecks.append(userID)
        return revoked
    }
}

func session(_ access: String, _ refresh: String, name: String = "Meera Iyer") -> String {
    #"{"user":{"id":"u1","email":"meera@example.com","displayName":"\#(name)","timezone":null},"accessToken":"\#(access)","refreshToken":"\#(refresh)","expiresIn":900}"#
}
