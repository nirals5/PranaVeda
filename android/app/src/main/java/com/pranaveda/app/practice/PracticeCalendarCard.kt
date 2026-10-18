package com.pranaveda.app.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pranaveda.app.R
import com.pranaveda.app.model.PracticeCalendar
import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PracticeStore
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * The website's practice calendar: a month of days marked with what was
 * practiced (a filled dot for a ritual, a ring for breathwork), and the chosen
 * day's practices below. A ritual that still has its snapshot opens again.
 */
@Composable
fun PracticeCalendarCard(
    practice: PracticeStore,
    onOpenRitual: (RecommendationResult) -> Unit,
    onBegin: () -> Unit,
) {
    val grid = remember { PracticeCalendar() }
    val today = LocalDate.now()
    var month by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    var selected by rememberSaveable { mutableStateOf(today.toString()) }
    val shownMonth = YearMonth.parse(month)
    val selectedDay = LocalDate.parse(selected)
    val byDay = PracticeCalendar.byDay(practice.entries)
    val days = grid.days(shownMonth)
    val monthCount = days.sumOf { byDay[it.toString()]?.size ?: 0 }
    val locale = Locale.getDefault()

    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Practice calendar", Modifier.weight(1f), heading = true)
            TextButton(onClick = {
                month = YearMonth.now().toString()
                selected = LocalDate.now().toString()
            }) { Text("TODAY", style = Pv.label, color = Pv.lavenderDeep) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                shownMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy", locale)),
                style = Pv.headingLarge,
                color = Pv.ink,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            MonthButton(R.drawable.ic_chevron_left, "Previous month") { month = shownMonth.minusMonths(1).toString() }
            MonthButton(R.drawable.ic_chevron_right, "Next month") { month = shownMonth.plusMonths(1).toString() }
        }
        Text(PracticeCalendar.monthLine(monthCount, practice.streak), style = Pv.caption, color = Pv.stone500)

        // Weekday initials, then the days in rows of seven.
        Row(Modifier.fillMaxWidth()) {
            grid.weekdays.forEach { (short, long) ->
                Text(
                    short,
                    style = Pv.label,
                    color = Pv.stone500,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.weight(1f).semantics { contentDescription = long },
                )
            }
        }
        val cells: List<LocalDate?> = List(grid.leadingBlanks(shownMonth)) { null } + days
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                week.forEach { day ->
                    Box(Modifier.weight(1f)) {
                        if (day != null) {
                            DayCell(
                                day = day,
                                entries = byDay[day.toString()].orEmpty(),
                                isSelected = day == selectedDay,
                                today = today,
                                description = grid.dayDescription(day, byDay[day.toString()]?.size ?: 0, today),
                                onClick = { selected = day.toString() },
                            )
                        }
                    }
                }
                repeat(7 - week.size) { Spacer(Modifier.weight(1f)) }
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(18.dp),
            modifier = Modifier.clearAndSetSemantics { },
        ) {
            LegendItem(PracticeLogEntry.Kind.Ritual, "RITUAL")
            LegendItem(PracticeLogEntry.Kind.Breathwork, "BREATHWORK")
        }
        HorizontalDivider(color = Pv.stone200.copy(alpha = 0.5f))
        SelectedDay(selectedDay, today, byDay[selected].orEmpty(), onOpenRitual, onBegin)
    }
}

@Composable
private fun MonthButton(icon: Int, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Box(
            Modifier.size(36.dp).background(Color.White.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(icon), contentDescription = label, tint = Pv.stone700, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun DayCell(
    day: LocalDate,
    entries: List<PracticeLogEntry>,
    isSelected: Boolean,
    today: LocalDate,
    description: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    val isToday = day == today
    Column(
        Modifier.fillMaxWidth()
            .heightIn(min = 48.dp)
            .background(if (isSelected) Pv.lavender.copy(alpha = 0.9f) else Color.Transparent, shape)
            .then(if (isToday && !isSelected) Modifier.border(1.dp, Pv.lavender.copy(alpha = 0.6f), shape) else Modifier)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                this.selected = isSelected
            }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            day.dayOfMonth.toString(),
            style = Pv.body.copy(fontWeight = if (isToday) FontWeight.SemiBold else FontWeight.Normal),
            color = when {
                isSelected -> Color.White
                day > today -> Pv.stone500
                else -> Pv.ink
            },
            modifier = Modifier.clearAndSetSemantics { },
        )
        Row(Modifier.height(6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            entries.take(3).forEach { PracticeMarker(it.kind, inverted = isSelected) }
        }
    }
}

/** A ritual is a filled dot, breathwork a hollow ring: the shape carries the meaning, so it still reads on the selected day. */
@Composable
fun PracticeMarker(kind: PracticeLogEntry.Kind, inverted: Boolean = false) {
    val tone = if (inverted) Color.White else Pv.lavender
    Box(
        Modifier.size(6.dp)
            .border(1.dp, tone, CircleShape)
            .background(if (kind == PracticeLogEntry.Kind.Ritual) tone else Color.Transparent, CircleShape),
    )
}

@Composable
private fun LegendItem(kind: PracticeLogEntry.Kind, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        PracticeMarker(kind)
        Text(label, style = Pv.label, color = Pv.stone500)
    }
}

@Composable
private fun SelectedDay(
    day: LocalDate,
    today: LocalDate,
    entries: List<PracticeLogEntry>,
    onOpenRitual: (RecommendationResult) -> Unit,
    onBegin: () -> Unit,
) {
    val locale = Locale.getDefault()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(
            when {
                day == today -> "Today"
                day > today -> "Ahead"
                else -> "That day"
            },
        )
        Text(day.format(DateTimeFormatter.ofPattern("EEEE, MMMM d", locale)), style = Pv.heading, color = Pv.ink)
        if (entries.isEmpty()) {
            Text(
                PracticeCalendar.emptyDayLine(day, today),
                style = Pv.quote,
                color = Pv.stone700,
            )
            if (day == today) {
                Button(
                    onClick = onBegin,
                    colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
                ) { Text("BEGIN WITH AMRITA  →", style = Pv.label) }
            }
        } else {
            entries.forEachIndexed { index, entry ->
                Column(
                    Modifier.semantics(mergeDescendants = true) { },
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PracticeMarker(entry.kind)
                        Text(entryDetail(entry).uppercase(), style = Pv.label, color = Pv.stone500)
                    }
                    Text(entry.title, style = Pv.heading, color = Pv.ink)
                    entry.result?.let { result ->
                        TextButton(onClick = { onOpenRitual(result) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            Text("OPEN RITUAL  →", style = Pv.label, color = Pv.lavenderDeep)
                        }
                    }
                }
                if (index < entries.lastIndex) HorizontalDivider(color = Pv.stone200.copy(alpha = 0.5f))
            }
        }
    }
}

/** "Ritual · 7:30 PM · 10 min" */
private fun entryDetail(entry: PracticeLogEntry): String {
    val kind = if (entry.kind == PracticeLogEntry.Kind.Ritual) "Ritual" else "Breathwork"
    val time = runCatching {
        Instant.parse(entry.completedAt).atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(Locale.getDefault()))
    }.getOrNull()
    return listOfNotNull(kind, time, "${entry.durationMinutes} min").joinToString(" · ")
}
