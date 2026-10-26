package com.pranaveda.app.model

import com.pranaveda.app.config.AppConfig
import kotlinx.serialization.Serializable

/** The practice catalog from GET /api/catalog. */
@Serializable
data class Catalog(
    val poses: List<CatalogPose>,
    val breathwork: List<CatalogBreathwork> = emptyList(),
)

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
