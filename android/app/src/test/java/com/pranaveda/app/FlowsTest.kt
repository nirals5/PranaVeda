package com.pranaveda.app

import com.pranaveda.app.model.Catalog
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.model.featuring
import com.pranaveda.app.model.grouped
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Library → Flows and the pose pages' "Watch a flow with this pose". */
class FlowsTest {
    private val json = """
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
    """.trimIndent()

    @Test fun decodesTheFlows() {
        val flows = PvJson.decodeFromString<Catalog>(json).flows
        assertEquals(3, flows.size)
        assertEquals("https://media.pranaveda.app/videos/warrior_flow.mp4", flows[0].videoUrl)
    }

    @Test fun olderServersHaveNoFlows() {
        assertTrue(PvJson.decodeFromString<Catalog>("""{"poses": [], "breathwork": []}""").flows.isEmpty())
    }

    @Test fun groupsKeepTheServersOrder() {
        val grouped = PvJson.decodeFromString<Catalog>(json).flows.grouped()
        assertEquals(listOf("Standing & warrior", "Back & spine"), grouped.map { it.first })
        assertEquals(listOf("warrior_flow", "flow_of_energy"), grouped[0].second.map { it.id })
    }

    @Test fun findsTheFlowsWithAPose() {
        val flows = PvJson.decodeFromString<Catalog>(json).flows
        assertEquals(listOf("warrior_flow", "flow_of_energy"), flows.featuring("warrior_1").map { it.id })
        assertEquals(listOf("flow_of_energy"), flows.featuring("downward_dog").map { it.id })
        assertTrue(flows.featuring("tree_pose").isEmpty())
    }
}
