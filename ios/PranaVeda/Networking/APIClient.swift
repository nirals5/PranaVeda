import Foundation

/// One event from the chat stream.
enum ChatEvent: Sendable {
    case text(String)
    case card(ChatCard)
    case profile(JSONValue)
    case error(String)
    case done
}

enum APIError: LocalizedError {
    case http(Int)
    var errorDescription: String? {
        switch self {
        case .http(let status): "The server answered \(status)."
        }
    }
}

struct APIClient: Sendable {
    var baseURL: URL = AppConfig.apiBaseURL
    var session: URLSession = .shared

    struct ChatRequest: Encodable {
        struct Message: Encodable { let role: String; let content: String }
        let messages: [Message]
        let profile: JSONValue
        let localTime: String
        /// The device's calendar day ("YYYY-MM-DD"), so the server dates
        /// profile writes by the user's day rather than UTC's.
        let localDate: String
        /// "voice" when the message was spoken: the server keeps the reply
        /// short and written for the ear.
        var inputMode = "text"
        let previousSession: [Message]?
        /// Their sleep and heart readings beside their usual, only when they
        /// have let Amrita see them.
        var health: HealthSummary? = nil
        /// The kind of place they are in (home, work, …), only when they have
        /// turned location on. Never coordinates.
        var location: LocationContext? = nil
        /// When they are busy and free today and tomorrow, only when they have
        /// turned the calendar on. Never what the commitments are.
        var calendar: CalendarContext? = nil
    }

    /// Streams Amrita's reply. Signed out, the device sends its profile and
    /// receives the updated one, exactly as the web app does.
    ///
    /// With a `bearer` token the request is sent as the signed-in person; an
    /// expired or invalid one gets `APIError.http(401)` before anything streams.
    func chat(_ request: ChatRequest, bearer: String? = nil) -> AsyncThrowingStream<ChatEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var urlRequest = URLRequest(url: baseURL.appending(path: "api/chat"))
                    urlRequest.httpMethod = "POST"
                    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    urlRequest.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if let bearer { urlRequest.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
                    urlRequest.httpBody = try JSONEncoder().encode(request)
                    urlRequest.timeoutInterval = 90

                    let (bytes, response) = try await session.bytes(for: urlRequest)
                    if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                        throw APIError.http(http.statusCode)
                    }
                    var parser = SSEParser()
                    var chunk: [UInt8] = []
                    chunk.reserveCapacity(1024)
                    for try await byte in bytes {
                        chunk.append(byte)
                        // Hand over at line ends so text appears as it streams.
                        if byte == UInt8(ascii: "\n") {
                            for payload in parser.feed(chunk) { Self.yield(payload, to: continuation) }
                            chunk.removeAll(keepingCapacity: true)
                        }
                    }
                    for payload in parser.feed(chunk) { Self.yield(payload, to: continuation) }
                    if let last = parser.finish() { Self.yield(last, to: continuation) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    static func decodeEvent(_ payload: String) -> ChatEvent? {
        guard let data = payload.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(EventEnvelope.self, from: data) else { return nil }
        switch envelope.type {
        case "text": return envelope.delta.map(ChatEvent.text)
        case "card": return envelope.card.map(ChatEvent.card)
        case "profile": return .profile(envelope.profile ?? .object([:]))
        case "error": return .error(envelope.message ?? "Something went wrong.")
        case "done": return .done
        default: return nil
        }
    }

    private static func yield(_ payload: String, to continuation: AsyncThrowingStream<ChatEvent, Error>.Continuation) {
        if let event = decodeEvent(payload) { continuation.yield(event) }
    }

    private struct EventEnvelope: Decodable {
        let type: String
        let delta: String?
        let card: ChatCard?
        let profile: JSONValue?
        let message: String?
    }

    func catalog() async throws -> Catalog {
        let (data, response) = try await session.data(from: baseURL.appending(path: "api/catalog"))
        if let http = response as? HTTPURLResponse, http.statusCode != 200 { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(Catalog.self, from: data)
    }
}
