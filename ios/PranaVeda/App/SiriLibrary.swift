import AppIntents
import CoreSpotlight
import Foundation
import SwiftUI

// The Library for Siri, Shortcuts and Spotlight (KAN-21): its poses and its
// follow-along flows. They read the catalog kept on the phone (Catalog.saved),
// so they work whether or not the app's screens are open. The explore-only
// poses are left out, as Amrita leaves them out.

/// Finds things by the words they share with what was said.
enum SiriWords {
    static func words(_ text: String) -> Set<String> {
        Set(text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
    }

    /// The items sharing a word with what was said, best match first, then in
    /// their own order. `ignoring` holds words that say nothing about which.
    static func rank<Item>(_ said: String, ignoring: Set<String>, in items: [Item], text: (Item) -> String) -> [Item] {
        let wanted = words(said).subtracting(ignoring)
        guard !wanted.isEmpty else { return [] }
        var scored: [(index: Int, item: Item, score: Int)] = []
        for (index, item) in items.enumerated() {
            let score = wanted.intersection(words(text(item))).count
            if score > 0 { scored.append((index, item, score)) }
        }
        scored.sort { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
        return scored.map(\.item)
    }
}

// MARK: Poses

/// A pose from the Library: "Show me Child's Pose in PranaVeda".
struct LibraryPoseEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Library Pose" }
    static var defaultQuery: LibraryPoseQuery { LibraryPoseQuery() }

    let id: String
    @Property(title: "English Name")
    var name: String
    @Property(title: "Sanskrit Name")
    var sanskritName: String
    @Property(title: "Level (Beginner, Intermediate or Advanced)")
    var level: String
    @Property(title: "Parts of the Body It Works")
    var bodyFocus: String
    @Property(title: "Benefits")
    var benefits: String

    init(_ pose: CatalogPose) {
        id = pose.id
        name = pose.nameEnglish
        sanskritName = pose.nameSanskrit
        level = pose.level
        bodyFocus = pose.bodyFocus
        benefits = pose.benefits
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(sanskritName) · \(level)", image: .init(systemName: "figure.yoga"))
    }

    static func poses() -> [CatalogPose] { Catalog.saved()?.poses ?? [] }

    static func matching(_ said: String, in poses: [CatalogPose]) -> [CatalogPose] {
        SiriWords.rank(said, ignoring: ["a", "the", "my", "pose", "posture", "asana", "yoga"], in: poses) {
            "\($0.nameEnglish) \($0.nameSanskrit)"
        }
    }
}

// Not EnumerableEntityQuery, like SavedRitualQuery: Siri would see only the
// first 20 poses. It finds them through Spotlight (IndexedEntity).
struct LibraryPoseQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [LibraryPoseEntity] {
        let poses = LibraryPoseEntity.poses()
        return identifiers.compactMap { id in poses.first { $0.id == id }.map(LibraryPoseEntity.init) }
    }

    func entities(matching string: String) async throws -> [LibraryPoseEntity] {
        LibraryPoseEntity.matching(string, in: LibraryPoseEntity.poses()).map(LibraryPoseEntity.init)
    }

    // No suggestions: asked "which one?", Siri matched the answer against
    // the suggested list only (KAN-21). Shortcuts searches by name instead.
    func suggestedEntities() async throws -> [LibraryPoseEntity] { [] }
}

// What Spotlight, and with it Siri, knows each one by: the name, what it is
// and words people might use. With only the display name, Siri couldn't find
// "a yin video" (KAN-21).
@available(iOS 18.0, *)
extension LibraryPoseEntity: IndexedEntity {
    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.displayName = name
        set.contentDescription = benefits
        set.keywords = [name, sanskritName, level, "yoga pose", "asana"]
            + bodyFocus.split(separator: "/").map { $0.trimmingCharacters(in: .whitespaces) }
        return set
    }
}

/// Opens a pose's page in the Library. Runs in the app.
struct ShowPoseIntent: AppIntent {
    static let title: LocalizedStringResource = "Show a Pose"
    static let description = IntentDescription(
        "Opens a yoga pose from PranaVeda's Library: how to do it, its cues and its benefits. It shows the page; it doesn't start a guided practice.",
        searchKeywords: ["asana", "posture", "how to", "yoga pose"]
    )
    static let openAppWhenRun = true

    @Parameter(title: "Pose", description: "The Library pose to show.", requestValueDialog: "Which pose?")
    var pose: LibraryPoseEntity

    init() {}

    init(pose: LibraryPoseEntity) {
        self.pose = pose
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Show \(\.$pose)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<LibraryPoseEntity> {
        AppLinkRouter.shared.pending = WidgetLink.pose(pose.id)
        return .result(value: pose)
    }
}

// MARK: Flows

/// A follow-along video from the Library: "Play Warrior Flow in PranaVeda".
struct FlowEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Flow" }
    static var defaultQuery: FlowQuery { FlowQuery() }

    let id: String
    @Property(title: "Title")
    var title: String
    @Property(title: "Kind of Flow")
    var group: String
    @Property(title: "Length in Minutes")
    var minutes: Int
    @Property(title: "Poses It Features")
    var poses: [String]

    /// `poses` is the catalog's, to name the flow's poses in English.
    init(_ flow: Flow, poses catalogPoses: [CatalogPose]) {
        id = flow.id
        title = flow.title
        group = flow.group
        minutes = flow.minutes
        poses = flow.poses.compactMap { id in catalogPoses.first { $0.id == id }?.nameEnglish }
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(group) · \(minutes) min", image: .init(systemName: "play.rectangle"))
    }

    static func all(_ catalog: Catalog? = Catalog.saved()) -> [FlowEntity] {
        guard let catalog else { return [] }
        return (catalog.flows ?? []).map { FlowEntity($0, poses: catalog.poses) }
    }

    static func matching(_ said: String, in flows: [Flow]) -> [Flow] {
        SiriWords.rank(said, ignoring: ["a", "the", "my", "flow", "video", "yoga", "with", "for"], in: flows) {
            "\($0.title) \($0.group)"
        }
    }
}

// Not EnumerableEntityQuery: Siri saw only the first 20 flows, so never the
// yin ones. It finds them through Spotlight (IndexedEntity).
struct FlowQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [FlowEntity] {
        let flows = FlowEntity.all()
        return identifiers.compactMap { id in flows.first { $0.id == id } }
    }

    func entities(matching string: String) async throws -> [FlowEntity] {
        guard let catalog = Catalog.saved() else { return [] }
        return FlowEntity.matching(string, in: catalog.flows ?? []).map { FlowEntity($0, poses: catalog.poses) }
    }

    // No suggestions: asked "which one?", Siri matched the answer against the
    // first 20 suggested flows only, never the yin ones (KAN-21).
    func suggestedEntities() async throws -> [FlowEntity] { [] }
}

@available(iOS 18.0, *)
extension FlowEntity: IndexedEntity {
    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.displayName = title
        set.contentDescription = "A \(group) yoga flow to follow along with, \(minutes) minutes."
        set.keywords = [group, "yoga flow", "flow", "yoga video", "video"] + poses
        return set
    }
}

/// Plays a flow's video full screen. Runs in the app.
struct PlayFlowIntent: AppIntent {
    static let title: LocalizedStringResource = "Play a Yoga Flow"
    static let description = IntentDescription(
        "Opens PranaVeda and shows one of its Library's follow-along yoga videos, full screen, to practise along with. Flows are short yoga sequences of 1 to 6 minutes. Only for PranaVeda's own yoga flows: not for music, podcasts or other audio.",
        searchKeywords: ["yoga video", "follow along", "sequence", "yoga class"]
    )
    static let openAppWhenRun = true

    @Parameter(title: "Flow", description: "The Library flow to play.", requestValueDialog: "Which flow?")
    var flow: FlowEntity

    /// Optional, never asked for: "play Warrior Flow from 2 minutes".
    @Parameter(
        title: "Start at",
        description: "How far into the flow to start, such as 2 minutes. Leave empty to play from the beginning.",
        defaultUnit: .minutes,
        supportsNegativeNumbers: false
    )
    var startAt: Measurement<UnitDuration>?

    init() {}

    init(flow: FlowEntity, startAt: Measurement<UnitDuration>? = nil) {
        self.flow = flow
        self.startAt = startAt
    }

    static var parameterSummary: some ParameterSummary {
        When(\.$startAt, .hasAnyValue) {
            Summary("Play \(\.$flow) from \(\.$startAt)")
        } otherwise: {
            Summary("Play \(\.$flow)")
        }
    }

    /// The start time in whole seconds, nil when there isn't one.
    static func startSeconds(_ startAt: Measurement<UnitDuration>?) -> Int? {
        guard let startAt else { return nil }
        let seconds = Int(startAt.converted(to: .seconds).value.rounded())
        return seconds > 0 ? seconds : nil
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<FlowEntity> {
        AppLinkRouter.shared.pending = WidgetLink.flow(flow.id, start: Self.startSeconds(startAt))
        return .result(value: flow)
    }
}

extension SiriBridge {
    /// Keeps Spotlight, and with it Siri, in step with the Library, and the
    /// "Play <flow>" phrases with the flows' titles.
    static func catalogChanged(_ catalog: Catalog) {
        if #available(iOS 18.0, *) {
            let poses = catalog.poses.map(LibraryPoseEntity.init)
            let flows = FlowEntity.all(catalog)
            Task {
                let index = CSSearchableIndex.default()
                try? await index.deleteAppEntities(ofType: LibraryPoseEntity.self)
                try? await index.indexAppEntities(poses)
                try? await index.deleteAppEntities(ofType: FlowEntity.self)
                try? await index.indexAppEntities(flows)
            }
        }
        PranaVedaShortcuts.updateAppShortcutParameters()
    }

    /// Tells Siri a pose's page was opened or a flow played here, so it
    /// learns what they usually look at.
    static func poseShown(_ pose: CatalogPose) {
        Task { _ = try? await IntentDonationManager.shared.donate(intent: ShowPoseIntent(pose: LibraryPoseEntity(pose))) }
    }

    static func flowPlayed(_ flow: Flow) {
        let entity = FlowEntity(flow, poses: Catalog.saved()?.poses ?? [])
        Task { _ = try? await IntentDonationManager.shared.donate(intent: PlayFlowIntent(flow: entity)) }
    }
}

// MARK: On screen

extension View {
    /// Tells Siri which saved ritual, pose or flow this view shows, so "this
    /// one" or "the second one" means it (KAN-21). Nothing before iOS 18.4,
    /// and nothing for a nil id (a ritual that isn't saved has no entity).
    @ViewBuilder
    func siriShows<Entity: AppEntity>(_ type: Entity.Type, id: String?) -> some View where Entity.ID == String {
        #if SIRI_ONSCREEN
        if #available(iOS 18.4, *) {
            appEntityIdentifier(id.map { EntityIdentifier(for: type, identifier: $0) })
        } else {
            self
        }
        #else
        self
        #endif
    }
}
