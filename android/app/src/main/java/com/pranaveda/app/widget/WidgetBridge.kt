package com.pranaveda.app.widget

import android.content.Context
import androidx.compose.runtime.snapshotFlow
import androidx.glance.appwidget.updateAll
import com.pranaveda.app.PranaVedaApplication
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import java.io.File
import java.time.LocalDate

/**
 * Keeps the widgets' snapshot in step with the app: whenever the practice log,
 * saved rituals or today's insight change, it saves the snapshot and redraws
 * the widgets.
 */
object WidgetBridge {
    fun start(app: PranaVedaApplication) {
        val file = File(app.filesDir, "widget-snapshot.json")
        var last = WidgetSnapshot.load(file)
        // Created here, not inside snapshotFlow: making a store writes its
        // state, which a read-only snapshot does not allow (it crashed the app).
        val practice = app.practice
        val saved = app.saved
        val insight = app.insight
        app.appScope.launch {
            snapshotFlow { Triple(practice.entries, saved.rituals, insight.state) }
                .distinctUntilChanged()
                .collectLatest { (entries, saved, insight) ->
                    val snapshot = WidgetSnapshot.from(entries, saved, insight, LocalDate.now(), previousInsight = last.insight)
                    if (snapshot == last) return@collectLatest
                    last = snapshot
                    snapshot.save(file)
                    redraw(app)
                }
        }
    }

    suspend fun redraw(context: Context) {
        runCatching {
            TodayWidget().updateAll(context)
            WeekWidget().updateAll(context)
        }
    }
}
