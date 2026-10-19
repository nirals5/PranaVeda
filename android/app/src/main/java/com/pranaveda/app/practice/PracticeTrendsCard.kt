package com.pranaveda.app.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pranaveda.app.model.PracticeStore
import com.pranaveda.app.model.PracticeTrends
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/** Recovery & Trends, part one: what the practice log shows, real data only. (Heart and sleep from Health Connect come next.) */
@Composable
fun PracticeTrendsCard(practice: PracticeStore) {
    val trends = PracticeTrends(practice.entries)
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionLabel("Recovery & Trends", heading = true)
        if (trends.isEmpty) {
            Text(
                "Your trends appear here as you practise: minutes each week, your streaks, and how rituals and breathwork balance out.",
                style = Pv.bodySmall,
                color = Pv.stone700,
            )
            return@Column
        }
        Column(Modifier.semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("This week", style = Pv.caption, color = Pv.stone500)
            Text(PracticeTrends.weekLine(trends.thisWeek), style = Pv.headingLarge, color = Pv.ink)
            Text(PracticeTrends.lastWeekLine(trends.lastWeek), style = Pv.bodySmall, color = Pv.stone700)
        }
        WeeklyMinutes(trends)
        HorizontalDivider(color = Pv.stone200.copy(alpha = 0.5f))
        Row(Modifier.fillMaxWidth()) {
            Stat("Current streak", trends.currentStreak, Modifier.weight(1f))
            Stat("Longest streak", trends.longestStreak, Modifier.weight(1f))
        }
        trends.ritualShare?.let { Balance(it) }
    }
}

/** Minutes each of the last eight weeks, a bar per week split by kind. */
@Composable
private fun WeeklyMinutes(trends: PracticeTrends) {
    val most = trends.weeks.maxOf { it.minutes }.coerceAtLeast(1)
    val label = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionLabel("Minutes each week")
        Row(Modifier.fillMaxWidth().height(140.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
            trends.weeks.forEach { week ->
                Column(
                    Modifier.weight(1f).fillMaxHeight().semantics(mergeDescendants = true) {
                        contentDescription = "Week of ${week.start.format(label)}: ${week.minutes} minutes, ${week.rituals} rituals, ${week.breathwork} breathwork"
                    },
                    verticalArrangement = Arrangement.Bottom,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (week.minutes > 0) {
                        Text("${week.minutes}", style = Pv.caption, color = Pv.stone500, modifier = Modifier.clearAndSetSemantics { })
                    }
                    val shape = RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp)
                    if (week.breathworkMinutes > 0) {
                        Box(Modifier.fillMaxWidth().height((100 * week.breathworkMinutes / most).dp).background(Pv.lavenderTint, if (week.ritualMinutes == 0) shape else RoundedCornerShape(0.dp)))
                    }
                    if (week.ritualMinutes > 0) {
                        Box(Modifier.fillMaxWidth().height((100 * week.ritualMinutes / most).dp).background(Pv.lavender, if (week.breathworkMinutes == 0) shape else RoundedCornerShape(0.dp)))
                    }
                    if (week.minutes == 0) Box(Modifier.fillMaxWidth().height(2.dp).background(Pv.stone200))
                }
            }
        }
        Row(Modifier.fillMaxWidth().clearAndSetSemantics { }, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Every other week is labelled, so each label has two bars' width.
            trends.weeks.chunked(2).forEach { pair ->
                Text(
                    pair.first().start.format(label),
                    style = Pv.caption,
                    color = Pv.stone500,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.weight(2f),
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.clearAndSetSemantics { }) {
            Legend(Pv.lavender, "Ritual")
            Legend(Pv.lavenderTint, "Breathwork")
        }
    }
}

@Composable
private fun Legend(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(text, style = Pv.caption, color = Pv.stone700)
    }
}

@Composable
private fun Stat(title: String, days: Int, modifier: Modifier = Modifier) {
    Column(modifier.semantics(mergeDescendants = true) { }) {
        Text(title, style = Pv.caption, color = Pv.stone500)
        Text(if (days == 1) "1 day" else "$days days", style = Pv.heading, color = Pv.ink)
    }
}

/** How the last eight weeks divide between rituals and breathwork. */
@Composable
private fun Balance(ritualShare: Double) {
    val ritual = (ritualShare * 100).roundToInt()
    Column(
        Modifier.clearAndSetSemantics { contentDescription = "Balance over the last 8 weeks: rituals $ritual percent, breathwork ${100 - ritual} percent" },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Balance, last 8 weeks", style = Pv.caption, color = Pv.stone500)
        Row(Modifier.fillMaxWidth().height(8.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            if (ritual > 0) Box(Modifier.weight(ritual.toFloat()).fillMaxHeight().background(Pv.lavender, CircleShape))
            if (ritual < 100) Box(Modifier.weight((100 - ritual).toFloat()).fillMaxHeight().background(Pv.lavenderTint, CircleShape))
        }
        Text("Rituals $ritual% · Breathwork ${100 - ritual}%", style = Pv.bodySmall, color = Pv.stone700)
    }
}
