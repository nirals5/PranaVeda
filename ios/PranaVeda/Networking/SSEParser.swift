import Foundation

/// Splits a server-sent-events byte stream into the `data:` payloads.
///
/// The chat endpoint frames each event as `data: <json>` followed by a blank
/// line. Bytes arrive in arbitrary chunks, so a line may be split across
/// chunks; the parser keeps the unfinished part until its end arrives. Each
/// payload is the joined `data:` lines of one event. Comments (lines starting
/// with ":") and other fields are ignored.
struct SSEParser {
    private var line: [UInt8] = []
    private var dataLines: [String] = []

    /// Feeds more bytes; returns the payloads of every event completed by them.
    mutating func feed<S: Sequence>(_ bytes: S) -> [String] where S.Element == UInt8 {
        var events: [String] = []
        for byte in bytes {
            if byte == UInt8(ascii: "\n") {
                if let event = endLine() { events.append(event) }
            } else {
                line.append(byte)
            }
        }
        return events
    }

    /// Call when the stream ends: returns an event left without its blank line.
    mutating func finish() -> String? {
        if !line.isEmpty, let event = endLine() { return event }
        return flush()
    }

    private mutating func endLine() -> String? {
        if line.last == UInt8(ascii: "\r") { line.removeLast() }
        let text = String(decoding: line, as: UTF8.self)
        line.removeAll(keepingCapacity: true)
        if text.isEmpty { return flush() }
        if text.hasPrefix("data:") {
            var value = text.dropFirst(5)
            if value.first == " " { value = value.dropFirst() }
            dataLines.append(String(value))
        }
        return nil
    }

    private mutating func flush() -> String? {
        guard !dataLines.isEmpty else { return nil }
        defer { dataLines.removeAll() }
        return dataLines.joined(separator: "\n")
    }
}
