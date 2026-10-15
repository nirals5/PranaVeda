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
import androidx.compose.foundation.lazy.grid.GridCells
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pranaveda.app.model.Catalog
import com.pranaveda.app.model.CatalogPose
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
fun LibraryScreen(model: CatalogViewModel) {
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val selected = model.catalog?.poses?.firstOrNull { it.id == selectedId }
    BackHandler(enabled = selected != null) { selectedId = null }

    Scaffold(
        containerColor = Color.Transparent,
        // The app's tab bar already keeps clear of the system bars.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text(selected?.nameEnglish ?: "Library", style = Pv.heading, color = Pv.ink) },
                navigationIcon = {
                    if (selected != null) TextButton(onClick = { selectedId = null }) { Text("‹ Library", color = Pv.lavenderDeep) }
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
                poses != null -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 160.dp),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(poses, key = { it.id }) { pose -> Tile(pose) { selectedId = pose.id } }
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
    }
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
