import Foundation
import Testing
@testable import PranaVeda

/// Library → Flows and the pose pages' "Watch a flow with this pose".
struct FlowsTests {
    let json = """
    {"poses": [], "breathwork": [], "flows": [
      {"id": "warrior_flow", "title": "Warrior Flow", "group": "Standing & warrior", "minutes": 2,
       "videoUrl": "https://media.pranaveda.app/videos/warrior_flow.mp4",
       "coverUrl": "https://media.pranaveda.app/videos/warrior_flow.jpg", "poses": ["warrior_1", "warrior_2"]},
      {"id": "spinal_wave", "title": "Spinal Wave", "group": "Back & spine", "minutes": 2,
       "videoUrl": "https://media.pranaveda.app/videos/spinal_wave.mp4",
       "coverUrl": "https://media.pranaveda.app/videos/spinal_wave.jpg", "poses": []},
      {"id": "flow_of_energy", "title": "Flow of Energy", "group": "Standing & warrior", "minutes": 2,
       "videoUrl": "https://media.pranaveda.app/videos/flow_of_energy.mp4",
       "coverUrl": "https://media.pranaveda.app/videos/flow_of_energy.jpg", "poses": ["warrior_1", "downward_dog"]}
    ]}
    """

    @Test func decodesTheFlows() throws {
        let flows = try #require(try JSONDecoder().decode(Catalog.self, from: Data(json.utf8)).flows)
        #expect(flows.count == 3)
        #expect(flows[0].videoURL?.absoluteString == "https://media.pranaveda.app/videos/warrior_flow.mp4")
        #expect(flows[0].coverURL?.lastPathComponent == "warrior_flow.jpg")
    }

    @Test func olderServersHaveNoFlows() throws {
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(#"{"poses": [], "breathwork": []}"#.utf8))
        #expect(catalog.flows == nil)
    }

    @Test func groupsKeepTheServersOrder() throws {
        let flows = try #require(try JSONDecoder().decode(Catalog.self, from: Data(json.utf8)).flows)
        #expect(flows.grouped.map(\.group) == ["Standing & warrior", "Back & spine"])
        #expect(flows.grouped[0].flows.map(\.id) == ["warrior_flow", "flow_of_energy"])
    }

    @Test func findsTheFlowsWithAPose() throws {
        let flows = try #require(try JSONDecoder().decode(Catalog.self, from: Data(json.utf8)).flows)
        #expect(flows.featuring("warrior_1").map(\.id) == ["warrior_flow", "flow_of_energy"])
        #expect(flows.featuring("downward_dog").map(\.id) == ["flow_of_energy"])
        #expect(flows.featuring("tree_pose").isEmpty)
    }
}
