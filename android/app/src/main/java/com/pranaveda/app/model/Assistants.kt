package com.pranaveda.app.model

import kotlinx.serialization.Serializable

/**
 * What the Smart assistants card shows. Alexa comes from the server, and only
 * once the skill is published (GET /api/assistants), so it appears without a
 * new release.
 */
@Serializable
data class Assistants(val alexa: Alexa? = null) {
    @Serializable
    data class Alexa(val url: String, val phrases: List<String>)

    companion object {
        /** The long-press menu on the app icon (res/xml/shortcuts.xml). */
        val PHONE_SHORTCUTS = listOf("Talk to Amrita", "Start my practice")
    }
}
