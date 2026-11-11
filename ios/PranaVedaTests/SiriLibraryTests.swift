import AppIntents
import Foundation
import Testing
@testable import PranaVeda

/// KAN-21: Siri can find the Library's poses and flows, show a pose and play
/// a flow. The explore-only poses stay out, as they do with Amrita.
struct SiriLibraryTests {
    let json = """
    {"poses": [
      {"id": "balasana", "nameSanskrit": "Balasana", "nameEnglish": "Child's Pose", "level": "Beginner",
       "bodyFocus": "Back / Hips / Rest", "cues": ["Knees wide"], "benefits": "Calms the mind.",
       "modifications": null, "contraindications": [], "bestTime": null, "defaultDurationMin": 2,
       "poseImageUrl": null, "sceneImageUrl": null, "minExperience": null},
      {"id": "virabhadrasana_2", "nameSanskrit": "Virabhadrasana II", "nameEnglish": "Warrior II", "level": "Beginner",
       "bodyFocus": "Legs / Hips", "cues": [], "benefits": "Builds stamina.",
       "modifications": null, "contraindications": [], "bestTime": null, "defaultDurationMin": 1,
       "poseImageUrl": null, "sceneImageUrl": null, "minExperience": null}
    ], "breathwork": [],
    "explore": [
      {"id": "sirsasana", "nameSanskrit": "Sirsasana", "nameEnglish": "Headstand", "bodyFocus": "Inversion",
       "benefits": "x", "cues": [], "commonMistakes": [], "modifications": "x", "avoidWith": [],
       "sourceCaution": null, "followWith": null, "avoidAfterMeal": null}
    ],
    "flows": [
      {"id": "warrior_flow", "title": "Warrior Flow", "group": "Standing & warrior", "minutes": 2,
       "videoUrl": "https://media.pranaveda.app/videos/warrior_flow.mp4",
       "coverUrl": "https://media.pranaveda.app/videos/warrior_flow.jpg", "poses": ["virabhadrasana_2"]},
      {"id": "yin_dragon", "title": "Yin Dragon with Puppy", "group": "Yin", "minutes": 6,
       "videoUrl": "https://media.pranaveda.app/videos/yin_dragon.mp4",
       "coverUrl": "https://media.pranaveda.app/videos/yin_dragon.jpg", "poses": []}
    ]}
    """
    var catalog: Catalog { try! JSONDecoder().decode(Catalog.self, from: Data(json.utf8)) }

    @Test func findsAPoseByEitherName() {
        let poses = catalog.poses
        #expect(LibraryPoseEntity.matching("child's pose", in: poses).map(\.id) == ["balasana"])
        #expect(LibraryPoseEntity.matching("the warrior two pose", in: poses).first?.id == "virabhadrasana_2")
        #expect(LibraryPoseEntity.matching("balasana", in: poses).map(\.id) == ["balasana"])
        #expect(LibraryPoseEntity.matching("headstand", in: poses).isEmpty)
        #expect(LibraryPoseEntity.matching("pose", in: poses).isEmpty)
    }

    @Test func findsAFlowByTitleOrGroup() {
        let flows = catalog.flows ?? []
        #expect(FlowEntity.matching("warrior flow", in: flows).map(\.id) == ["warrior_flow"])
        #expect(FlowEntity.matching("a yin video", in: flows).map(\.id) == ["yin_dragon"])
        #expect(FlowEntity.matching("flow", in: flows).isEmpty)
    }

    @Test func aFlowNamesItsPosesInEnglish() {
        let flow = FlowEntity(catalog.flows![0], poses: catalog.poses)
        #expect(flow.title == "Warrior Flow")
        #expect(flow.minutes == 2)
        #expect(flow.poses == ["Warrior II"])
    }

    @Test func theCatalogIsKeptForSiri() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "catalog-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        #expect(Catalog.saved(fileURL: file) == nil)
        catalog.save(to: file)
        let kept = try #require(Catalog.saved(fileURL: file))
        #expect(kept.poses.map(\.id) == ["balasana", "virabhadrasana_2"])
        #expect(kept.flows?.map(\.id) == ["warrior_flow", "yin_dragon"])
    }

    // "Play a yin video" found no flow: the index needs the kind of flow and
    // what it is, not only its title.
    @Test func theIndexKnowsWhatAFlowAndAPoseAre() throws {
        guard #available(iOS 18.0, *) else { return }
        let flow = FlowEntity(catalog.flows![1], poses: catalog.poses).attributeSet
        #expect(flow.displayName == "Yin Dragon with Puppy")
        #expect(try #require(flow.keywords).contains("Yin"))
        #expect(try #require(flow.keywords).contains("yoga flow"))
        #expect(try #require(flow.contentDescription).contains("6 minutes"))
        let pose = LibraryPoseEntity(catalog.poses[0]).attributeSet
        #expect(pose.displayName == "Child's Pose")
        #expect(try #require(pose.keywords).contains("Balasana"))
        #expect(pose.contentDescription == "Calms the mind.")
    }

    // Siri took only the first 20 of a list-all query, so the yin flows (21st
    // on) were out of its reach. Indexed entities are looked up in Spotlight.
    @Test func siriLooksThemUpInsteadOfListingThem() {
        #expect(!(FlowQuery() is any EnumerableEntityQuery))
        #expect(!(LibraryPoseQuery() is any EnumerableEntityQuery))
        #expect(!(SavedRitualQuery() is any EnumerableEntityQuery))
    }

    // Asked "which one?", Siri matched the answer against the suggested list
    // only, and took its first 20.
    @Test func posesAndFlowsSuggestNothing() async throws {
        #expect(try await FlowQuery().suggestedEntities().isEmpty)
        #expect(try await LibraryPoseQuery().suggestedEntities().isEmpty)
    }

    @Test func linksOpenAPoseOrAFlow() {
        #expect(WidgetLink.pose("balasana").absoluteString == "pranaveda://pose/balasana")
        #expect(WidgetLink.flow("warrior_flow").absoluteString == "pranaveda://flow/warrior_flow")
    }
}
