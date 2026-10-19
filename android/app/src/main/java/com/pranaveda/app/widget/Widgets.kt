package com.pranaveda.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontFamily
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.pranaveda.app.MainActivity
import com.pranaveda.app.R
import java.io.File
import java.time.LocalDate
import java.time.format.TextStyle as DayNameStyle
import java.util.Locale

// The app's palette (Pv in Theme.kt). Glance draws with the system's serif and
// sans faces: home-screen widgets cannot load the app's own fonts.
private val lavender = Color(0xFF8A79A5)
private val lavenderDeep = Color(0xFF71608E)
private val ink = Color(0xFF2D3436)
private val stone700 = Color(0xFF44515A)
private val stone500 = Color(0xFF78909C)
private fun c(color: Color) = ColorProvider(color)

private fun label(size: Int = 11) = TextStyle(color = c(stone500), fontSize = size.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
private fun serif(size: Int, color: Color = ink) = TextStyle(color = c(color), fontSize = size.sp, fontFamily = FontFamily.Serif)
private fun sans(size: Int, color: Color = stone700, italic: Boolean = false, bold: Boolean = false) = TextStyle(
    color = c(color), fontSize = size.sp, fontFamily = FontFamily.SansSerif,
    fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
    fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
)

private fun snapshotFile(context: Context) = File(context.filesDir, "widget-snapshot.json")

// Into the running app if there is one (MainActivity.onNewIntent), else a fresh start.
private fun open(context: Context, link: String) = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
)

@Composable
private fun Card(modifier: GlanceModifier = GlanceModifier, content: @Composable () -> Unit) {
    Box(
        modifier.fillMaxSize().background(ImageProvider(R.drawable.widget_background)).cornerRadius(20.dp).padding(14.dp),
    ) { content() }
}

// MARK: Today

class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(140.dp, 140.dp), DpSize(260.dp, 140.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshot.load(snapshotFile(context))
        provideContent { TodayContent(context, snapshot, LocalDate.now()) }
    }
}

@Composable
private fun TodayContent(context: Context, snapshot: WidgetSnapshot, today: LocalDate) {
    val streak = snapshot.streak(today)
    val practised = snapshot.practised(today) != null
    val todayLine = if (practised) "✓ Practised today" else "Not yet today"
    val wide = LocalSize.current.width >= 250.dp
    Card(GlanceModifier.clickable(open(context, WidgetLink.TALK))) {
        if (!wide) {
            Column(GlanceModifier.fillMaxSize()) {
                Text("YOUR PRACTICE", style = label())
                Spacer(GlanceModifier.defaultWeight())
                Text("$streak", style = serif(40))
                Text("day streak", style = sans(13))
                Text(todayLine, style = sans(12, if (practised) lavenderDeep else stone500))
            }
        } else {
            Row(GlanceModifier.fillMaxSize()) {
                Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
                    Text("TODAY", style = label())
                    val insight = snapshot.insight(today)
                    if (insight != null) {
                        Text(insight.headline, style = serif(16), maxLines = 2)
                        Text(insight.tip, style = sans(12, italic = true), maxLines = 3)
                    } else {
                        Text("Open PranaVeda for today's reflection", style = serif(15), maxLines = 3)
                    }
                    Spacer(GlanceModifier.defaultWeight())
                    Box(
                        GlanceModifier.background(c(lavender)).cornerRadius(16.dp).padding(horizontal = 12.dp, vertical = 6.dp)
                            .clickable(open(context, WidgetLink.TALK))
                            .semantics { contentDescription = "Talk to Amrita" },
                    ) { Text("🎙  Talk to Amrita", style = sans(12, Color.White, bold = true)) }
                }
                Spacer(GlanceModifier.width(12.dp))
                Column(GlanceModifier.width(104.dp).fillMaxHeight()) {
                    Text("$streak", style = serif(34))
                    Text("day streak", style = sans(12))
                    Text(todayLine, style = sans(11, if (practised) lavenderDeep else stone500))
                    Spacer(GlanceModifier.defaultWeight())
                    snapshot.newestSaved?.let { saved ->
                        Text(
                            "🔖 ${saved.title}",
                            style = sans(11, lavenderDeep),
                            maxLines = 2,
                            modifier = GlanceModifier.clickable(open(context, WidgetLink.savedRitual(saved.id))),
                        )
                    }
                }
            }
        }
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

// MARK: Week

class WeekWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(140.dp, 140.dp), DpSize(260.dp, 140.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshot.load(snapshotFile(context))
        provideContent { WeekContent(context, snapshot, LocalDate.now()) }
    }
}

@Composable
private fun WeekContent(context: Context, snapshot: WidgetSnapshot, today: LocalDate) {
    val week = snapshot.week(today)
    val count = week.count { it.second != null }
    val wide = LocalSize.current.width >= 250.dp
    Card(GlanceModifier.clickable(open(context, WidgetLink.YOU)).semantics { contentDescription = "$count of 7 days practised this week" }) {
        Column(GlanceModifier.fillMaxSize()) {
            Text("THIS WEEK", style = label())
            Text(if (count == 1) "1 day of practice" else "$count days of practice", style = serif(if (wide) 20 else 16), maxLines = 2)
            Spacer(GlanceModifier.defaultWeight())
            Row(GlanceModifier.fillMaxWidth()) {
                week.forEach { (date, day) ->
                    Column(GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            date.dayOfWeek.getDisplayName(DayNameStyle.NARROW, Locale.getDefault()),
                            style = label(10).copy(color = c(if (date == today) lavenderDeep else stone500)),
                        )
                        Spacer(GlanceModifier.height(4.dp))
                        // A ritual is a filled dot, breathwork a ring, as on the calendar.
                        Box(GlanceModifier.size(10.dp)) {
                            androidx.glance.Image(
                                ImageProvider(
                                    when {
                                        day?.ritual == true -> R.drawable.widget_dot_ritual
                                        day?.breathwork == true -> R.drawable.widget_dot_breathwork
                                        else -> R.drawable.widget_dot_empty
                                    },
                                ),
                                contentDescription = null,
                                modifier = GlanceModifier.size(10.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

class WeekWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WeekWidget()
}
