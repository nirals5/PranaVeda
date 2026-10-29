import Foundation
import Testing
@testable import PranaVeda

private let pacific = TimeZone(identifier: "America/Los_Angeles")!

private func entry(_ id: String, _ localDate: String, completedAt: String? = nil, result: RecommendationResult? = nil) -> PracticeLogEntry {
    PracticeLogEntry(id: id, kind: .ritual, title: "Ritual \(id)", completedAt: completedAt ?? "\(localDate)T18:00:00.000Z",
                     localDate: localDate, durationMinutes: 10, result: result)
}

private let ritual = RecommendationResult(
    summary: "Evening", doshaTendency: nil, primaryEnergy: nil,
    yogaPractice: YogaPractice(title: "Wind-down", description: nil, poses: [], durationMinutes: 10),
    ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil
)

struct PracticeLogTests {
    @Test func newEntriesLookLikeTheWebsitesAndFileUnderTheLocalDay() {
        // 9:30 pm in California is already the next day in UTC.
        let evening = PracticeLog.isoFormatter.date(from: "2026-10-16T04:30:00.000Z")!
        let made = PracticeLog.newEntry(kind: .breathwork, title: "Ocean Breath", durationMinutes: 3, result: nil, now: evening, timeZone: pacific)
        #expect(made.localDate == "2026-10-15")
        #expect(made.completedAt == "2026-10-16T04:30:00.000Z")
        #expect(made.id.range(of: #"^p_\d{13}_[a-z0-9]{5}$"#, options: .regularExpression) != nil)
        #expect(made.kind == .breathwork)
    }

    @Test func keepsRitualSnapshotsOnlyOnTheNewestEntries() {
        let many = (0..<45).map { entry("e\($0)", "2026-10-01", result: ritual) }
        let kept = PracticeLog.trimmed(many)
        #expect(kept.count == 45)
        #expect(kept.prefix(5).allSatisfy { $0.result == nil })
        #expect(kept.suffix(40).allSatisfy { $0.result != nil })
        #expect(PracticeLog.trimmed((0..<510).map { entry("x\($0)", "2026-10-01") }).count == 500)
    }

    @Test func mergesEntriesFromElsewhereOncePerIdInTimeOrder() {
        let local = [entry("a", "2026-10-10", completedAt: "2026-10-10T08:00:00.000Z"), entry("c", "2026-10-12", completedAt: "2026-10-12T08:00:00.000Z")]
        let incoming = [entry("b", "2026-10-11", completedAt: "2026-10-11T08:00:00.000Z"), entry("a", "2026-10-10", completedAt: "2026-10-10T08:00:00.000Z")]
        #expect(PracticeLog.merged(local, with: incoming).map(\.id) == ["a", "b", "c"])
        #expect(PracticeLog.merged(local, with: [local[0]]) == local)
    }

    @Test func countsTheStreakBackFromTodayOrYesterday() {
        let today = PracticeLog.isoFormatter.date(from: "2026-10-15T20:00:00.000Z")! // 1 pm in California
        let days = ["2026-10-12", "2026-10-13", "2026-10-14"].map { entry($0, $0) }
        // Nothing yet today: the streak is still alive through yesterday.
        #expect(PracticeLog.streak(days, today: today, timeZone: pacific) == 3)
        #expect(PracticeLog.streak(days + [entry("t", "2026-10-15")], today: today, timeZone: pacific) == 4)
        // A missed day breaks it.
        #expect(PracticeLog.streak([entry("old", "2026-10-13")], today: today, timeZone: pacific) == 0)
        #expect(PracticeLog.streak([], today: today, timeZone: pacific) == 0)
    }

    @Test func readsEntriesFromOtherDevicesEvenWithAnUnfamiliarRitual() throws {
        let json = #"""
        [{"id":"p_1","kind":"ritual","title":"Morning","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14",
          "durationMinutes":10,"result":{"surprise":true},"heart":{"startBpm":70,"endBpm":62,"avgBpm":65,"minBpm":60,"maxBpm":72}},
         {"id":"p_2","kind":"breathwork","title":"Box","completedAt":"2026-10-14T16:00:00Z","localDate":"2026-10-14","durationMinutes":2}]
        """#
        let entries = try JSONDecoder().decode([PracticeLogEntry].self, from: Data(json.utf8))
        #expect(entries.map(\.id) == ["p_1", "p_2"])
        #expect(entries[0].result == nil)
        #expect(entries[1].completedDate != nil) // without fractional seconds too
    }

    @Test func aRatingIsSentWhenTheAccountDoesNotHaveIt() {
        var rated = entry("b", "2026-10-02")
        rated.feeling = .less
        var kept = entry("c", "2026-10-03")
        kept.feeling = .more
        let pending = PracticeLog.pendingUploads([entry("a", "2026-10-01"), rated, kept, entry("d", "2026-10-04")],
                                                 synced: ["a", "b", "c"], sentFeelings: ["c": "more"])
        #expect(pending.map(\.id) == ["b", "d"])
    }

    @Test func readsAndWritesTheRating() throws {
        let json = #"[{"id":"p_1","kind":"breathwork","title":"Box","completedAt":"2026-10-14T16:00:00Z","localDate":"2026-10-14","durationMinutes":2,"feeling":"less"},{"id":"p_2","kind":"breathwork","title":"Box","completedAt":"2026-10-14T16:00:00Z","localDate":"2026-10-14","durationMinutes":2,"feeling":"odd"}]"#
        let entries = try JSONDecoder().decode([PracticeLogEntry].self, from: Data(json.utf8))
        #expect(entries.map(\.feeling) == [.less, nil])
        let written = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(entries[0])) as? [String: Any])
        #expect(written["feeling"] as? String == "less")
    }

    @Test func laysOutTheMonthUnderItsWeekdays() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = pacific
        calendar.locale = Locale(identifier: "en_US")
        calendar.firstWeekday = 1 // Sunday, as on the website
        let grid = PracticeCalendar(calendar: calendar)
        let october = grid.date("2026-10-16")!
        let keys = grid.dayKeys(october)
        #expect(keys.count == 31)
        #expect(keys.first == "2026-10-01")
        #expect(keys.last == "2026-10-31")
        #expect(grid.leadingBlanks(october) == 4) // 1 Oct 2026 is a Thursday
        #expect(grid.weekdays.first?.long == "Sunday")
        #expect(grid.dayKeys(grid.adding(months: 1, to: october)).count == 30)
        #expect(grid.dayKeys(grid.adding(months: -8, to: october)).count == 28) // February 2026

        calendar.firstWeekday = 2 // Monday-first readers
        let mondayFirst = PracticeCalendar(calendar: calendar)
        #expect(mondayFirst.leadingBlanks(october) == 3)
        #expect(mondayFirst.weekdays.first?.long == "Monday")
        #expect(mondayFirst.weekdays.last?.long == "Sunday")
    }

    @Test func describesTheMonthAndDays() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = pacific
        calendar.locale = Locale(identifier: "en_US")
        let grid = PracticeCalendar(calendar: calendar)
        let entries = [entry("a", "2026-10-15"), entry("b", "2026-10-15"), entry("c", "2026-10-12")]
        #expect(PracticeCalendar.byDay(entries)["2026-10-15"]?.map(\.id) == ["a", "b"])
        #expect(PracticeCalendar.monthLine(count: 4, streak: 3) == "4 practices this month · 3-day streak")
        #expect(PracticeCalendar.monthLine(count: 1, streak: 0) == "1 practice this month")
        #expect(grid.dayDescription("2026-10-15", practices: 2, today: "2026-10-15") == "Thursday, October 15, today, 2 practices")
        #expect(grid.dayDescription("2026-10-14", practices: 0, today: "2026-10-15") == "Wednesday, October 14, no practice")
        #expect(PracticeCalendar.emptyDayLine("2026-10-16", today: "2026-10-15") == "This day has not arrived yet.")
        #expect(PracticeCalendar.emptyDayLine("2026-10-15", today: "2026-10-15").hasPrefix("Nothing practiced yet today."))
        #expect(PracticeCalendar.emptyDayLine("2026-10-01", today: "2026-10-15") == "No practice was recorded on this day.")
    }
}

@MainActor
@Suite(.serialized)
struct PracticeStoreTests {
    let user = AccountUser(id: "u1", email: "meera@example.com", displayName: "Meera Iyer", timezone: nil)

    private func freshStore(fileName: String = UUID().uuidString) -> (PracticeStore, UserDefaults, URL) {
        let defaults = UserDefaults(suiteName: "practice-tests-\(UUID().uuidString)")!
        let file = FileManager.default.temporaryDirectory.appending(path: "\(fileName).json")
        return (PracticeStore(api: stubAPI(), defaults: defaults, fileURL: file), defaults, file)
    }

    @Test func keepsTheLogAcrossLaunches() {
        let (store, defaults, file) = freshStore()
        store.log(kind: .breathwork, title: "Ocean Breath", durationMinutes: 3, result: nil)
        let reopened = PracticeStore(api: stubAPI(), defaults: defaults, fileURL: file)
        #expect(reopened.entries.map(\.title) == ["Ocean Breath"])
    }

    @Test func uploadsThisPhonesPracticesAndReadsTheAccountsOnSignIn() async throws {
        let fromWebsite = #"{"id":"p_web","kind":"ritual","title":"From the website","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":12}"#
        StubURLProtocol.reset { request in
            switch (request.method, request.path) {
            case ("POST", "/api/auth/refresh"): (200, session("access-1", "refresh-2"))
            case ("POST", "/api/sync/practice-log"): (200, #"{"stored":1}"#)
            case ("GET", "/api/sync/practice-log"):
                request.query == "after=0" ? (200, #"{"entries":[\#(fromWebsite)],"cursor":7,"hasMore":false}"#) : (200, #"{"entries":[],"cursor":7,"hasMore":false}"#)
            default: (404, "{}")
            }
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: FakeApple())
        let (store, defaults, _) = freshStore()
        store.auth = auth
        let mine = store.log(kind: .breathwork, title: "Ocean Breath", durationMinutes: 3, result: nil)

        await store.adoptAccount(user)

        let uploaded = try #require(StubURLProtocol.requests(to: "/api/sync/practice-log").first { $0.method == "POST" })
        #expect(uploaded.authorization == "Bearer access-1")
        let sent = try #require(uploaded.body?["entries"] as? [[String: Any]])
        #expect(sent.map { $0["id"] as? String } == [mine.id])
        #expect(sent.first?["localDate"] as? String == mine.localDate)
        #expect(Set(store.entries.map(\.id)) == [mine.id, "p_web"])
        #expect(defaults.integer(forKey: "pranaveda_practice_cursor") == 7)

        // Nothing new: the next sync uploads nothing and reads from the cursor.
        await store.sync()
        #expect(StubURLProtocol.requests(to: "/api/sync/practice-log").filter { $0.method == "POST" }.count == 1)
        #expect(StubURLProtocol.requests(to: "/api/sync/practice-log").last?.query == "after=7")
    }

    @Test func sendsAPracticeAgainOnceItIsRated() async throws {
        StubURLProtocol.reset { request in
            switch (request.method, request.path) {
            case ("POST", "/api/auth/refresh"): (200, session("access-1", "refresh-2"))
            case ("POST", "/api/sync/practice-log"): (200, #"{"stored":0}"#)
            default: (200, #"{"entries":[],"cursor":0,"hasMore":false}"#)
            }
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: FakeApple())
        let (store, defaults, file) = freshStore()
        let mine = store.log(kind: .breathwork, title: "Bellows Breath", durationMinutes: 3, result: nil)
        store.auth = auth
        await store.adoptAccount(user)

        store.rate(mine.id, .less)
        await store.sync()
        let posts = { StubURLProtocol.requests(to: "/api/sync/practice-log").filter { $0.method == "POST" } }
        let rated = try #require(posts().last?.body?["entries"] as? [[String: Any]])
        #expect(rated.map { $0["feeling"] as? String } == ["less"])
        let count = posts().count
        await store.sync()
        #expect(posts().count == count) // already has it
        #expect(PracticeStore(api: stubAPI(), defaults: defaults, fileURL: file).entries.first?.feeling == .less)
    }

    @Test func uploadsInBatchesOfTheServersLimit() async {
        StubURLProtocol.reset { request in
            switch (request.method, request.path) {
            case ("POST", "/api/auth/refresh"): (200, session("access-1", "refresh-2"))
            case ("POST", "/api/sync/practice-log"): (200, #"{"stored":25}"#)
            default: (200, #"{"entries":[],"cursor":0,"hasMore":false}"#)
            }
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: FakeApple())
        let (store, _, _) = freshStore()
        for i in 0..<30 { store.log(kind: .breathwork, title: "Breath \(i)", durationMinutes: 1, result: nil) }
        store.auth = auth
        await store.adoptAccount(user)
        let batches = StubURLProtocol.requests(to: "/api/sync/practice-log").filter { $0.method == "POST" }
        #expect(batches.compactMap { ($0.body?["entries"] as? [Any])?.count } == [25, 5])
    }

    @Test func handsBackOnlyThisPhonesOwnPracticesOnSignOut() async {
        StubURLProtocol.reset { request in
            switch (request.method, request.path) {
            case ("POST", "/api/auth/refresh"): (200, session("access-1", "refresh-2"))
            case ("POST", "/api/sync/practice-log"): (200, #"{"stored":1}"#)
            case ("GET", "/api/sync/practice-log"):
                (200, #"{"entries":[{"id":"p_web","kind":"ritual","title":"From the website","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":12}],"cursor":3,"hasMore":false}"#)
            default: (404, "{}")
            }
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: FakeApple())
        let (store, defaults, _) = freshStore()
        store.auth = auth
        let mine = store.log(kind: .breathwork, title: "Before sign-in", durationMinutes: 3, result: nil)
        await store.adoptAccount(user)
        #expect(store.entries.count == 2)

        store.handBackDevice()

        #expect(store.entries.map(\.id) == [mine.id])
        #expect(defaults.string(forKey: "pranaveda_practice_owner") == nil)
    }

    @Test func keepsAPracticeThatNeverReachedTheAccount() async {
        // Offline the whole time: the practice made while signed in stays.
        StubURLProtocol.reset { request in
            request.path == "/api/auth/refresh" ? (200, session("access-1", "refresh-2")) : (503, "{}")
        }
        let auth = AuthStore(api: stubAPI(), storage: InMemorySessionStorage(refreshToken: "refresh-1", user: user), google: FakeGoogle(), apple: FakeApple())
        let (store, _, _) = freshStore()
        store.auth = auth
        await store.adoptAccount(user)
        store.log(kind: .ritual, title: "Offline ritual", durationMinutes: 10, result: nil)
        await store.sync()
        store.handBackDevice()
        #expect(store.entries.map(\.title) == ["Offline ritual"])
    }

    @Test func nothingIsSentWhileSignedOut() async {
        StubURLProtocol.reset { _ in (200, "{}") }
        let (store, _, _) = freshStore()
        store.log(kind: .breathwork, title: "Guest breath", durationMinutes: 1, result: nil)
        await store.sync()
        #expect(StubURLProtocol.recorded.isEmpty)
    }
}
