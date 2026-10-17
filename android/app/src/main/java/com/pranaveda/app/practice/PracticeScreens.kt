package com.pranaveda.app.practice

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.model.BreathworkPattern
import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PracticeStore
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.ui.chat.PoseImage
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable
private fun practiceStore(): PracticeStore = (LocalContext.current.applicationContext as PranaVedaApplication).practice

/** Full screen over the app, keeping the screen awake while it shows. */
@Composable
private fun PracticeDialog(onClose: () -> Unit, content: @Composable () -> Unit) {
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val view = LocalView.current
        DisposableEffect(Unit) {
            view.keepScreenOn = true
            // The dialog has its own window: give it dark status-bar icons, as
            // the rest of the light-only app has.
            (view.parent as? DialogWindowProvider)?.window?.let { window ->
                WindowCompat.getInsetsController(window, view).apply {
                    isAppearanceLightStatusBars = true
                    isAppearanceLightNavigationBars = true
                }
            }
            onDispose { view.keepScreenOn = false }
        }
        Box(Modifier.fillMaxSize().background(Pv.background).safeDrawingPadding()) { content() }
    }
}

/**
 * Calls [tick] with the seconds passed, about four times a second, while
 * [running]. Time comes from the clock, not from counting ticks, so a pause in
 * delivery loses nothing.
 */
@Composable
private fun PracticeClock(running: Boolean, tick: (Double) -> Unit) {
    LaunchedEffect(running) {
        if (!running) return@LaunchedEffect
        var last = System.nanoTime()
        while (isActive) {
            delay(250)
            val now = System.nanoTime()
            tick((now - last) / 1e9)
            last = now
        }
    }
}

@Composable
private fun rememberSpeechGuide(): SpeechGuide {
    val context = LocalContext.current
    val guide = remember { SpeechGuide(context) }
    DisposableEffect(guide) { onDispose { guide.shutdown() } }
    return guide
}

/**
 * A ritual's poses, one at a time: the picture, the instructions, a countdown
 * and spoken guidance. Finishing the last pose logs the practice.
 */
@Composable
fun GuidedPracticeScreen(result: RecommendationResult, onClose: () -> Unit) {
    val poses = result.yogaPractice.poses
    val practice = practiceStore()
    val guide = rememberSpeechGuide()
    val sequence = remember { PoseSequence(poses.map { poseSeconds(it.duration) }) }
    var version by remember { mutableIntStateOf(0) }
    var running by remember { mutableStateOf(true) }
    var finished by remember { mutableStateOf(false) }

    fun handle(events: List<PoseSequence.Event>, back: Boolean = false) {
        for (event in events) when (event) {
            is PoseSequence.Event.EnteredPose -> guide.speak(if (back) Guidance.returnToPose(poses[event.index]) else Guidance.enterPose(poses[event.index]))
            PoseSequence.Event.Finished -> {
                running = false
                practice.log(
                    PracticeLogEntry.Kind.Ritual,
                    result.yogaPractice.title,
                    result.yogaPractice.durationMinutes ?: (sequence.durations.sum() / 60),
                    result,
                )
                guide.speak(Guidance.RITUAL_COMPLETE)
                finished = true
            }
        }
        version++
    }

    LaunchedEffect(Unit) { poses.firstOrNull()?.let { guide.speak(Guidance.startPose(it)) } }
    PracticeClock(running && !finished) { handle(sequence.advance(it)) }

    PracticeDialog(onClose) {
        when {
            finished -> PracticeComplete(
                detail = "${result.yogaPractice.title} is saved to your practice.",
                breathwork = result.breathwork,
                result = result,
                onDone = onClose,
            )
            poses.isEmpty() -> Text("This ritual has no postures to guide.", style = Pv.body, color = Pv.stone700, modifier = Modifier.padding(24.dp))
            else -> {
                version // read so the screen follows the timer
                val pose = poses[sequence.index]
                Column(Modifier.fillMaxSize()) {
                    PracticeTopBar("Posture ${sequence.index + 1} of ${poses.size}", guide, onClose)
                    Column(
                        Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        PoseImage(pose.imageUrl, Modifier.fillMaxWidth().height(260.dp).clip(RoundedCornerShape(18.dp)))
                        Text(pose.nameEnglish, style = Pv.headingLarge, color = Pv.ink)
                        pose.nameSanskrit?.let { Text(it, style = Pv.bodySmall.copy(fontStyle = FontStyle.Italic), color = Pv.lavenderDeep) }
                        Text(
                            clockString(sequence.secondsLeft),
                            fontSize = 44.sp,
                            fontWeight = FontWeight.Light,
                            color = Pv.ink,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "${sequence.secondsLeft} seconds left" },
                        )
                        pose.instructions?.let { Text(it, style = Pv.body, color = Pv.stone700) }
                        Spacer(Modifier.height(12.dp))
                    }
                    PracticeControls(
                        running = running,
                        canGoBack = sequence.index > 0,
                        onBack = { handle(sequence.previous(), back = true) },
                        onToggle = { running = !running },
                        onNext = { handle(sequence.next()) },
                    )
                }
            }
        }
    }
}

/**
 * Paces a breathwork pattern with a growing and shrinking circle and spoken
 * cues sized to each phase. Completing every cycle logs the practice.
 */
@Composable
fun BreathworkPacerScreen(pattern: BreathworkPattern, result: RecommendationResult?, onClose: () -> Unit) {
    val practice = practiceStore()
    val guide = rememberSpeechGuide()
    val pacer = remember { BreathPacer(pattern) }
    var version by remember { mutableIntStateOf(0) }
    var started by remember { mutableStateOf(false) }
    var running by remember { mutableStateOf(false) }
    var finished by remember { mutableStateOf(false) }

    fun handle(events: List<BreathPacer.Event>, speak: Boolean = true) {
        for (event in events) when (event) {
            // The opening line already covers the very first inhale.
            is BreathPacer.Event.PhaseStarted -> if (speak) guide.speak(Guidance.cue(event.phase, event.seconds))
            BreathPacer.Event.Finished -> {
                running = false
                practice.log(PracticeLogEntry.Kind.Breathwork, pattern.name, pacer.totalMinutes, result)
                guide.speak(Guidance.breathworkComplete(pattern.name))
                finished = true
            }
        }
        version++
    }

    PracticeClock(running && !finished) { handle(pacer.advance(it)) }

    PracticeDialog(onClose) {
        if (finished) {
            PracticeComplete(detail = "${pattern.name} is saved to your practice.", breathwork = null, result = null, onDone = onClose)
            return@PracticeDialog
        }
        version // read so the screen follows the timer
        // Full on the in-breath and while holding full; small on the out-breath and while resting.
        val target = if (!started) 0.6f else when (pacer.phase) {
            BreathPacer.Phase.Inhale, BreathPacer.Phase.HoldFull -> 1f
            else -> 0.55f
        }
        val scale by animateFloatAsState(target, tween(durationMillis = if (started) pacer.phaseSeconds * 1000 else 300), label = "breath")
        val phaseName = when (pacer.phase) {
            BreathPacer.Phase.Inhale -> "Inhale"
            BreathPacer.Phase.HoldFull -> "Hold full"
            BreathPacer.Phase.Exhale -> "Exhale"
            BreathPacer.Phase.HoldEmpty -> "Hold empty"
        }
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            PracticeTopBar(pattern.name, guide, onClose)
            Spacer(Modifier.weight(1f))
            Box(Modifier.size(280.dp), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.fillMaxSize().scale(scale).clip(CircleShape)
                        .background(Brush.radialGradient(listOf(Pv.lavenderTint, Pv.blueTint.copy(alpha = 0.6f))))
                        .border(2.dp, Color.White.copy(alpha = 0.9f), CircleShape),
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (started) phaseName else "Ready", style = Pv.headingLarge, color = Pv.ink)
                    if (started) Text("${pacer.secondsLeft}", fontSize = 28.sp, color = Pv.stone700)
                }
            }
            Spacer(Modifier.weight(1f))
            SectionLabel(if (started) "Cycle ${pacer.cycle} of ${pacer.cycles}" else "${pattern.rhythm} · ${pattern.cycles} cycles")
            Button(
                onClick = {
                    if (!started) {
                        started = true
                        guide.speak(Guidance.beginBreathwork(pattern.name))
                        handle(listOf(pacer.startEvent), speak = false)
                    }
                    running = !running
                },
                colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
                modifier = Modifier.padding(top = 12.dp, bottom = 32.dp),
            ) {
                Text(if (running) "PAUSE" else if (started) "RESUME" else "BEGIN", style = Pv.label, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
            }
        }
    }
}

@Composable
private fun PracticeTopBar(title: String, guide: SpeechGuide, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onClose, modifier = Modifier.semantics { contentDescription = "End practice" }) {
            Text("✕", fontSize = 20.sp, color = Pv.stone700)
        }
        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { SectionLabel(title) }
        TextButton(
            onClick = { guide.changeMuted(!guide.isMuted) },
            modifier = Modifier.semantics { contentDescription = if (guide.isMuted) "Turn spoken guidance on" else "Turn spoken guidance off" },
        ) {
            Text(if (guide.isMuted) "🔇" else "🔊", fontSize = 18.sp)
        }
    }
}

@Composable
private fun PracticeControls(running: Boolean, canGoBack: Boolean, onBack: () -> Unit, onToggle: () -> Unit, onNext: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.6f)).padding(vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(36.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack, enabled = canGoBack, modifier = Modifier.semantics { contentDescription = "Previous posture" }) {
            Text("⏮", fontSize = 26.sp, color = if (canGoBack) Pv.ink else Pv.stone200)
        }
        FilledIconButton(
            onClick = onToggle,
            modifier = Modifier.size(72.dp).semantics { contentDescription = if (running) "Pause" else "Resume" },
            colors = IconButtonDefaults.filledIconButtonColors(containerColor = Pv.lavender, contentColor = Color.White),
        ) {
            Text(if (running) "❚❚" else "▶", fontSize = 24.sp, color = Color.White, fontFamily = FontFamily.SansSerif)
        }
        IconButton(onClick = onNext, modifier = Modifier.semantics { contentDescription = "Next posture" }) {
            Text("⏭", fontSize = 26.sp, color = Pv.ink)
        }
    }
}

/** "Namaste": the practice is done and saved. After a ritual, its breathwork is offered next. */
@Composable
private fun PracticeComplete(detail: String, breathwork: BreathworkPattern?, result: RecommendationResult?, onDone: () -> Unit) {
    var showingBreathwork by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.weight(1f))
        Text("✓", fontSize = 48.sp, color = Pv.lavender)
        Text("Namaste", style = Pv.display, color = Pv.ink)
        Text(detail, style = Pv.body, color = Pv.stone700, textAlign = TextAlign.Center)
        Spacer(Modifier.weight(1f))
        breathwork?.let {
            Button(
                onClick = { showingBreathwork = true },
                colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
            ) {
                Text("CONTINUE WITH ${it.name.uppercase()}", style = Pv.label, modifier = Modifier.padding(vertical = 6.dp))
            }
        }
        TextButton(onClick = onDone) { Text("Done", style = Pv.body.copy(fontWeight = FontWeight.Medium), color = Pv.lavenderDeep) }
        Spacer(Modifier.height(16.dp))
    }
    if (showingBreathwork && breathwork != null) {
        BreathworkPacerScreen(breathwork, result) {
            showingBreathwork = false
            onDone()
        }
    }
}
