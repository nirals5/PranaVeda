package com.pranaveda.app.ui.library

import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pranaveda.app.model.Catalog
import com.pranaveda.app.model.CatalogPose
import com.pranaveda.app.model.ExplorePose
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.ui.chat.PoseImage
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The practice catalog from /api/catalog. */
class CatalogViewModel : ViewModel() {
    var catalog by mutableStateOf<Catalog?>(null)
        private set
    var loadError by mutableStateOf<String?>(null)
        private set
    private val api = ApiClient()

    init {
        load()
    }

    fun load() {
        loadError = null
        viewModelScope.launch {
            try {
                catalog = api.catalog()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w("PranaVeda", "Catalog failed to load", e)
                loadError = "The library could not be loaded. Is the PranaVeda server running?"
            }
        }
    }
}

/** Every pose Amrita can draw on. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(model: CatalogViewModel, conditions: List<String> = emptyList()) {
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val selected = model.catalog?.poses?.firstOrNull { it.id == selectedId }
    val exploring = model.catalog?.explore?.firstOrNull { it.id == selectedId }
    BackHandler(enabled = selected != null || exploring != null) { selectedId = null }

    Scaffold(
        containerColor = Color.Transparent,
        // The app's tab bar already keeps clear of the system bars.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text(selected?.nameEnglish ?: exploring?.nameEnglish ?: "Library", style = Pv.heading, color = Pv.ink) },
                navigationIcon = {
                    if (selected != null || exploring != null) TextButton(onClick = { selectedId = null }) { Text("‹ Library", color = Pv.lavenderDeep) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            val poses = model.catalog?.poses
            val error = model.loadError
            when {
                selected != null -> PoseDetail(selected)
                exploring != null -> ExploreDetail(exploring, exploring.notFor(conditions))
                poses != null -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 160.dp),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(poses, key = { it.id }) { pose -> Tile(pose) { selectedId = pose.id } }
                    // G3: the advanced poses Amrita never offers, after the library.
                    val explore = model.catalog?.explore.orEmpty()
                    if (explore.isNotEmpty()) {
                        item(key = "explore", span = { GridItemSpan(maxLineSpan) }) {
                            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Explore", style = Pv.headingLarge, color = Pv.ink)
                                Text("Advanced poses, at your own risk. Amrita won't suggest these.", style = Pv.bodySmall, color = Pv.stone700)
                            }
                        }
                        items(explore, key = { "explore-${it.id}" }) { pose -> ExploreTile(pose, pose.notFor(conditions).isNotEmpty()) { selectedId = pose.id } }
                    }
                }
                error != null -> Column(
                    Modifier.padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(error, style = Pv.body, color = Pv.stone700, textAlign = TextAlign.Center)
                    TextButton(onClick = model::load) { Text("Try again", color = Pv.lavenderDeep) }
                }
                else -> CircularProgressIndicator(color = Pv.lavender)
            }
        }
    }
}

@Composable
private fun Tile(pose: CatalogPose, onClick: () -> Unit) {
    Column(Modifier.clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PoseImage(pose.imageUrl, Modifier.fillMaxWidth().height(110.dp).clip(RoundedCornerShape(12.dp)))
        Text(pose.nameEnglish, style = Pv.itemTitle, color = Pv.ink, maxLines = 2)
        SectionLabel(pose.level)
        if (pose.experiencedOnly) ExperiencedOnlyLabel()
    }
}

@Composable
private fun ExploreTile(pose: ExplorePose, notForThem: Boolean, onClick: () -> Unit) {
    Column(Modifier.clickable(onClick = onClick), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ExplorePlaceholder(Modifier.fillMaxWidth().height(110.dp))
        Text(pose.nameEnglish, style = Pv.itemTitle, color = Pv.ink, maxLines = 2)
        if (notForThem) Text("Not for you".uppercase(), style = Pv.label, color = Pv.terracotta) else ExperiencedOnlyLabel()
    }
}

/** Explore poses have no photographs yet. */
@Composable
private fun ExplorePlaceholder(modifier: Modifier) {
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(Pv.lavenderTint), contentAlignment = Alignment.Center) {
        Text("🧘", style = Pv.headingLarge)
    }
}

/** One explore-only pose: the caveat first, then how it is done. No guided practice and no logging. */
@Composable
private fun ExploreDetail(pose: ExplorePose, notFor: List<String>) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ExplorePlaceholder(Modifier.fillMaxWidth().height(180.dp))
        Text(pose.nameSanskrit, style = Pv.bodySmall.copy(fontStyle = FontStyle.Italic), color = Pv.lavenderDeep)
        SectionLabel(pose.bodyFocus)
        ExperiencedOnlyLabel()
        val shape = RoundedCornerShape(14.dp)
        Column(
            Modifier.fillMaxWidth().clip(shape).background(Pv.terracotta.copy(alpha = 0.08f)).border(1.dp, Pv.terracotta.copy(alpha = 0.35f), shape).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            SectionLabel("At your own risk")
            Text(
                "Amrita won't suggest this pose. It is best learned with a teacher. Practise it only if you are experienced, and stop if anything hurts.",
                style = Pv.bodySmall, color = Pv.ink,
            )
            if (notFor.isNotEmpty()) {
                Text("Not for you: you've said ${notFor.joinToString(", ").lowercase()}.", style = Pv.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = Pv.terracotta)
            }
            if (pose.avoidWith.isNotEmpty()) {
                Text("Avoid with: ${pose.avoidWith.joinToString(", ") { it.label }.lowercase()}.", style = Pv.bodySmall, color = Pv.stone700)
            }
            if (pose.avoidAfterMeal) Text("Not within 2 hours of a meal.", style = Pv.bodySmall, color = Pv.stone700)
        }
        Text(pose.benefits, style = Pv.body, color = Pv.stone700)
        BulletCard("Cues", pose.cues)
        BulletCard("Common mistakes", pose.commonMistakes)
        if (pose.modifications.isNotBlank() || pose.followWith != null) {
            Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionLabel("Build up to it")
                if (pose.modifications.isNotBlank()) Text(pose.modifications, style = Pv.bodySmall, color = Pv.ink)
                pose.followWith?.let { Text("Follow with $it.", style = Pv.bodySmall, color = Pv.ink) }
            }
        }
    }
}

@Composable
private fun BulletCard(title: String, items: List<String>) {
    if (items.isEmpty()) return
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionLabel(title)
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("•", style = Pv.bodySmall, color = Pv.lavender)
                Text(item, style = Pv.bodySmall, color = Pv.ink)
            }
        }
    }
}

/** The practices Amrita offers only to experienced practitioners (G2). */
@Composable
private fun ExperiencedOnlyLabel() {
    Text("For experienced practitioners".uppercase(), style = Pv.label, color = Pv.terracotta)
}

@Composable
private fun PoseDetail(pose: CatalogPose) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        PoseImage(pose.imageUrl, Modifier.fillMaxWidth().height(240.dp).clip(RoundedCornerShape(16.dp)))
        Text(pose.nameSanskrit, style = Pv.bodySmall.copy(fontStyle = FontStyle.Italic), color = Pv.lavenderDeep)
        SectionLabel("${pose.level} · ${pose.bodyFocus}")
        if (pose.experiencedOnly) ExperiencedOnlyLabel()
        Text(pose.benefits, style = Pv.body, color = Pv.stone700)
        Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SectionLabel("Cues")
            pose.cues.forEach { cue ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("•", style = Pv.bodySmall, color = Pv.lavender)
                    Text(cue, style = Pv.bodySmall, color = Pv.ink)
                }
            }
        }
    }
}
