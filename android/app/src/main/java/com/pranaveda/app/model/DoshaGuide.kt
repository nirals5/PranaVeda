package com.pranaveda.app.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

/** The balancing reference behind the Dosha Profile screen, from GET /api/dosha-guide (the website shows the same text). */
@Serializable
data class DoshaGuide(
    val doshas: Map<String, DoshaGuideEntry>,
    val note: String,
)

@Serializable
data class DoshaGuideEntry(
    val tagline: String,
    val qualities: String,
    val aggravatedBy: String,
    val balancedBy: String,
    val diet: List<String>,
    val lifestyle: List<String>,
    val breath: String,
    val practiceStyle: String,
    val rhythm: String,
    val season: String,
)

/**
 * The dosha assessment Amrita saved to the wellness profile
 * (`profile.doshaProfile`): the card's fields plus the day it was made.
 */
@Serializable
data class SavedDoshaProfile(
    val primary: String,
    val secondary: String? = null,
    val balance: DoshaBalance,
    val essence: String? = null,
    val explanation: String? = null,
    val guidance: List<String>? = null,
    val confidence: String? = null,
    val assessedDate: String? = null,
) {
    companion object {
        /** Read from the profile as stored; null if there is none or it is incomplete. */
        fun from(profile: JsonObject): SavedDoshaProfile? =
            profile["doshaProfile"]?.let { runCatching { PvJson.decodeFromJsonElement<SavedDoshaProfile>(it) }.getOrNull() }

        /** "medium confidence · 2026-10-12", as on the website. */
        fun confidenceLine(confidence: String?, assessedDate: String?): String? =
            if (confidence == null) assessedDate else "$confidence confidence" + (assessedDate?.let { " · $it" } ?: "")
    }
}
