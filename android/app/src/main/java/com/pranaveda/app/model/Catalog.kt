package com.pranaveda.app.model

import com.pranaveda.app.config.AppConfig
import kotlinx.serialization.Serializable

/** The practice catalog from GET /api/catalog. */
@Serializable
data class Catalog(
    val poses: List<CatalogPose>,
    val breathwork: List<CatalogBreathwork> = emptyList(),
    /** Advanced poses Amrita never offers (G3), for Library → Explore. Empty from servers older than Explore. */
    val explore: List<ExplorePose> = emptyList(),
)

/** An explore-only pose: shown with an at-your-own-risk note, never guided, never logged. */
@Serializable
data class ExplorePose(
    val id: String,
    val nameSanskrit: String,
    val nameEnglish: String,
    val bodyFocus: String = "",
    val benefits: String = "",
    val cues: List<String> = emptyList(),
    val commonMistakes: List<String> = emptyList(),
    val modifications: String = "",
    val avoidWith: List<Condition> = emptyList(),
    val sourceCaution: String? = null,
    val followWith: String? = null,
    val avoidAfterMeal: Boolean = false,
) {
    @Serializable
    data class Condition(val code: String, val label: String, val words: List<String> = emptyList())

    /**
     * The conditions on their profile this pose must be avoided with, by the
     * server's matching (conditionConflicts in api/_lib/catalog.ts): a whole
     * word or phrase of the code, label or everyday words, or the older text
     * match on the code.
     */
    fun notFor(profileConditions: List<String>): List<String> {
        val said = profileConditions.map(::words)
        val older = profileConditions.map { it.lowercase().replace(Regex("\\s+"), "_") }
        return avoidWith.filter { c ->
            val terms = (listOf(c.code, c.label) + c.words).map(::words).filter { it.isNotBlank() }
            said.any { s -> terms.any { s.contains(it) } } || older.any { it.contains(c.code) || c.code.contains(it) }
        }.map { it.label }
    }

    private companion object {
        /** "Bad Knee!" → " bad knee ", so a phrase matches only as whole words. */
        fun words(s: String) = " " + s.lowercase().replace(Regex("[^a-z0-9]+"), " ").trim() + " "
    }
}

@Serializable
data class CatalogPose(
    val id: String,
    val nameSanskrit: String,
    val nameEnglish: String,
    val level: String,
    val bodyFocus: String,
    val cues: List<String> = emptyList(),
    val benefits: String,
    val modifications: String? = null,
    val contraindications: List<String> = emptyList(),
    val bestTime: String? = null,
    val defaultDurationMin: Double? = null,
    val poseImageUrl: String? = null,
    val sceneImageUrl: String? = null,
    /** "experienced" for the few practices Amrita offers only to experienced practitioners. */
    val minExperience: String? = null,
) {
    val imageUrl: String? get() = AppConfig.resolve(sceneImageUrl ?: poseImageUrl)
    val experiencedOnly: Boolean get() = minExperience == "experienced"
}

@Serializable
data class CatalogBreathwork(
    val id: String,
    val name: String,
    val sanskritName: String,
    val description: String,
    val inhale: Double,
    val holdActive: Double,
    val exhale: Double,
    val holdEmpty: Double,
    val cycles: Int,
    val benefits: String,
)
