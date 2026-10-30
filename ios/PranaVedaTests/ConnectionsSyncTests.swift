import Foundation
import Testing
@testable import PranaVeda

/// Saved places on the account: the phone joins them as the website does
/// (tests/connectionsMerge.test.ts), and reads the server's replies.
struct ConnectionsSyncTests {
    let home = SavedPlace(kind: .home, lat: 37.7749, lon: -122.4194)
    let otherHome = SavedPlace(kind: .home, lat: 40.7, lon: -74)
    let work = SavedPlace(kind: .work, lat: 37.79, lon: -122.4)
    let studio = SavedPlace(kind: .studio, lat: 37.8, lon: -122.41)

    @Test func theAccountsSpotWinsAndThePhoneFillsTheGaps() {
        #expect(ConnectionsMerge.join(account: [home], phone: [otherHome, studio, work]) == [home, work, studio])
        #expect(ConnectionsMerge.join(account: [], phone: [studio]) == [studio])
    }

    @Test func orderDoesNotMatterButAMovedSpotDoes() {
        #expect(ConnectionsMerge.same([home, work], [work, home]))
        #expect(!ConnectionsMerge.same([home], [otherHome]))
        #expect(!ConnectionsMerge.same([home], [home, work]))
    }

    @Test func readsTheServersReplyAndIgnoresTheCalendarLink() throws {
        let json = #"{"kept":true,"connections":{"places":[{"kind":"home","lat":37.7749,"lon":-122.4194}],"calendarLink":"webcal://x/a.ics"},"version":3}"#
        let reply = try JSONDecoder().decode(AccountConnections.self, from: Data(json.utf8))
        #expect(reply.kept)
        #expect(reply.version == 3)
        #expect(reply.connections.places == [home])
        #expect(!reply.conflict)

        let off = try JSONDecoder().decode(AccountConnections.self, from: Data(#"{"kept":false,"connections":{"places":[]},"version":0}"#.utf8))
        #expect(!off.kept)
    }
}
