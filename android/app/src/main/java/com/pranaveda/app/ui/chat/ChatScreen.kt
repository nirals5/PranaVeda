package com.pranaveda.app.ui.chat

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import com.pranaveda.app.ui.theme.rememberReduceMotion
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.compose.ui.platform.LocalContext
import com.pranaveda.app.voice.VoiceListener
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.voice.HeyAmrita
import kotlinx.coroutines.delay
import com.pranaveda.app.voice.VoiceRequest
import android.os.SystemClock
import androidx.compose.material3.AlertDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.pranaveda.app.R
import com.pranaveda.app.model.ChatItem
import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.voice.AmritaVoice
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.practice.SavedRitualsCard
import com.pranaveda.app.practice.savedRitualStore
import com.pranaveda.app.ui.theme.Pv
import java.time.LocalTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    model: ChatViewModel,
    insight: DailyInsightStore? = null,
    voice: AmritaVoice? = null,
    voiceRequestedAt: Long = 0L,
    onVoiceRequestHandled: () -> Unit = {},
) {
    var draft by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    val listState = rememberLazyListState()
    val reduceMotion = rememberReduceMotion()

    // Set while speaking to Amrita: the input bar becomes the recording bar.
    val context = LocalContext.current
    var listener by remember { mutableStateOf<VoiceListener?>(null) }
    fun stopRecording() {
        listener?.release()
        listener = null
    }
    val askForMicrophone = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        listener?.let { if (granted) it.start() else it.notAllowed() }
    }
    fun startRecording() {
        focus.clearFocus()
        voice?.stop()
        val started = VoiceListener(context)
        listener = started
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) started.start()
        else askForMicrophone.launch(Manifest.permission.RECORD_AUDIO)
    }
    // "Hey Amrita": switched on here, and paused while the recording bar has the microphone.
    val heyAmrita = (context.applicationContext as PranaVedaApplication).heyAmrita
    var confirmingHeyAmrita by remember { mutableStateOf(false) }
    var heyAmritaProblem by remember { mutableStateOf<String?>(null) }
    val askForHeyAmritaMicrophone = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        if (granted) heyAmrita.changeEnabled(true)
        else heyAmritaProblem = "To listen for “Hey Amrita”, allow PranaVeda to use the microphone in Settings."
    }
    LaunchedEffect(listener == null) { heyAmrita.hold(HeyAmrita.Hold.Recording, listener != null) }
    LaunchedEffect(heyAmrita.state) {
        heyAmritaProblem = when (heyAmrita.state) {
            HeyAmrita.State.NotAllowed -> "To listen for “Hey Amrita”, allow PranaVeda to use the microphone in Settings."
            HeyAmrita.State.Unavailable -> "This phone can't recognise speech on the device (it needs Android 13 or later), so it can't listen for “Hey Amrita” privately."
            else -> return@LaunchedEffect
        }
        heyAmrita.changeEnabled(false)
    }
    if (confirmingHeyAmrita) {
        AlertDialog(
            onDismissRequest = { confirmingHeyAmrita = false },
            title = { Text("Listen for “Hey Amrita”?") },
            text = {
                Text(
                    "While this screen or a practice is open, PranaVeda listens for “Hey Amrita”, then opens the microphone for you. " +
                        "In a practice, say “Hey Amrita, pause” (or resume, next, back, end). Listening happens on this phone; nothing is sent anywhere.",
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirmingHeyAmrita = false
                    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) heyAmrita.changeEnabled(true)
                    else askForHeyAmritaMicrophone.launch(Manifest.permission.RECORD_AUDIO)
                }) { Text("Turn on") }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirmingHeyAmrita = false }) { Text("Not now") } },
        )
    }
    heyAmritaProblem?.let { problem ->
        AlertDialog(
            onDismissRequest = { heyAmritaProblem = null },
            title = { Text("“Hey Amrita” is off") },
            text = { Text(problem) },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { heyAmritaProblem = null }) { Text("OK") } },
        )
    }

    // The microphone is never left on: leaving the tab or the app stops it.
    DisposableEffect(Unit) { onDispose { stopRecording() } }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { stopRecording() }
    // "Hey Amrita" or a widget's "Talk to Amrita": start listening, once per
    // request. One made while Amrita is replying waits for the reply; a stale one
    // is dropped, and Hey Amrita, which let go of the microphone, listens again.
    LaunchedEffect(voiceRequestedAt, model.isStreaming) {
        val at = voiceRequestedAt
        if (at == 0L || voice == null) return@LaunchedEffect
        val now = SystemClock.elapsedRealtime()
        when (VoiceRequest.action(at, now, model.isStreaming)) {
            VoiceRequest.Action.Start -> {
                onVoiceRequestHandled()
                if (listener == null) startRecording()
            }
            VoiceRequest.Action.Wait -> {
                // Cancelled, and decided again, as soon as the reply ends.
                delay(VoiceRequest.TTL_MILLIS - (now - at) + 1)
                onVoiceRequestHandled()
                heyAmrita.resume()
            }
            VoiceRequest.Action.Drop -> {
                onVoiceRequestHandled()
                heyAmrita.resume()
            }
        }
    }

    fun send() {
        val text = draft
        draft = ""
        // Put the keyboard away so the reply has the whole screen.
        focus.clearFocus()
        model.send(text)
    }

    // Follow the reply as it streams in.
    val last = model.items.lastOrNull()
    LaunchedEffect(model.items.size, last?.text?.length, last?.cards?.size) {
        // A gentle glide, or a jump with Remove animations on.
        if (model.items.isNotEmpty()) {
            if (reduceMotion) listState.scrollToItem(model.items.size) else listState.animateScrollToItem(model.items.size)
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        // The app's tab bar already keeps clear of the system bars.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Amrita", style = Pv.heading, color = Pv.ink) },
                // Spoken replies on or off, kept between launches (as on the website).
                navigationIcon = {
                    if (voice != null) {
                        Row {
                            IconButton(onClick = { voice.changeMuted(!voice.isMuted) }) {
                                Icon(
                                    painterResource(if (voice.isMuted) R.drawable.ic_volume_off else R.drawable.ic_volume_up),
                                    contentDescription = if (voice.isMuted) "Voice replies off" else "Voice replies on",
                                    tint = if (voice.isMuted) Pv.stone500 else Pv.lavenderDeep,
                                )
                            }
                            IconButton(onClick = { if (heyAmrita.isEnabled) heyAmrita.changeEnabled(false) else confirmingHeyAmrita = true }) {
                                Icon(
                                    painterResource(R.drawable.ic_hearing),
                                    contentDescription = if (heyAmrita.isEnabled) "Listening for Hey Amrita" else "Not listening for Hey Amrita",
                                    tint = if (heyAmrita.isEnabled) Pv.lavenderDeep else Pv.stone500,
                                )
                            }
                        }
                    }
                },
                actions = {
                    // Starts a fresh conversation (the wellness profile is kept),
                    // like the website's "Begin a new conversation". Only shown
                    // when there is a conversation to clear.
                    if (model.items.isNotEmpty()) {
                        IconButton(onClick = model::reset) {
                            Icon(painterResource(R.drawable.ic_new_conversation), contentDescription = "New conversation", tint = Pv.lavenderDeep)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
        bottomBar = {
            val recording = listener
            if (recording != null) {
                VoiceRecorderBar(
                    recording,
                    onCancel = ::stopRecording,
                    onSend = { words ->
                        stopRecording()
                        model.send(words, spoken = true)
                    },
                    modifier = Modifier.imePadding(),
                )
            } else InputBar(
                draft = draft,
                onDraftChange = { draft = it },
                canSend = draft.isNotBlank() && !model.isStreaming,
                onSend = ::send,
                onSpeak = if (voice != null) ({ startRecording() }) else null,
                modifier = Modifier.imePadding(),
                placeholder = if (heyAmrita.isListening) "Say “Hey Amrita”, or type…" else "Tell Amrita how you're feeling…",
            )
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            if (model.items.isEmpty()) {
                item { Welcome(model.greetingName) }
                if (insight != null) {
                    item {
                        LaunchedEffect(Unit) { insight.loadIfNeeded(model.profile) }
                        DailyInsightCard(insight.state, Modifier.padding(top = 4.dp))
                    }
                }
                item { WelcomeSavedRituals() }
            }
            items(model.items, key = { it.id }) { item ->
                MessageRow(item, onOption = model::send)
            }
            item { Spacer(Modifier.size(1.dp)) }
        }
    }
}

/** The newest saved rituals under the reflection, as on the website's home page. */
@Composable
private fun WelcomeSavedRituals() {
    val saved = savedRitualStore()
    if (saved.rituals.isEmpty()) return
    var opening by remember { mutableStateOf<RecommendationResult?>(null) }
    SavedRitualsCard(saved, onOpen = { opening = it }, limit = 3)
    opening?.let { RitualSheet(it) { opening = null } }
}

/**
 * Which greeting fits the hour, as on the website (src/lib/greeting.ts):
 * morning starts at 5, so someone up after midnight is wished a good evening
 * rather than a good morning.
 */
fun timeOfDay(hour: Int): String = when (hour) {
    in 5..11 -> "morning"
    in 12..16 -> "afternoon"
    else -> "evening"
}

@Composable
private fun Welcome(name: String?) {
    val time = timeOfDay(LocalTime.now().hour)
    val greeting = name?.split(" ")?.firstOrNull()?.let { "Good $time, $it." }
        ?: mapOf(
            "morning" to "Good morning, seeker.",
            "afternoon" to "Good afternoon, reflective heart.",
            "evening" to "Good evening, peaceful traveler.",
        ).getValue(time)
    Column(Modifier.padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(greeting, style = Pv.display, color = Pv.ink, modifier = Modifier.semantics { heading() })
        Text(
            "Tell me how you feel, and I'll suggest a practice that fits your body, energy, and goals.",
            style = Pv.body,
            color = Pv.stone700,
        )
    }
}

@Composable
private fun InputBar(
    draft: String,
    onDraftChange: (String) -> Unit,
    canSend: Boolean,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    /** Opens the voice consultation; no microphone button without it. */
    onSpeak: (() -> Unit)? = null,
    placeholder: String = "Tell Amrita how you're feeling…",
) {
    val shape = RoundedCornerShape(28.dp)
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .background(Color.White.copy(alpha = 0.85f), shape)
            .border(1.dp, Pv.stone200.copy(alpha = 0.7f), shape)
            .padding(start = 4.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextField(
            value = draft,
            onValueChange = onDraftChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text(placeholder, style = Pv.body, color = Pv.stone500) },
            textStyle = Pv.body.copy(color = Pv.ink),
            maxLines = 4,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                cursorColor = Pv.lavenderDeep,
            ),
        )
        if (onSpeak != null) {
            FilledIconButton(
                onClick = onSpeak,
                modifier = Modifier.padding(end = 6.dp).size(44.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Pv.lavenderTint, contentColor = Pv.lavenderDeep),
            ) {
                Icon(painterResource(R.drawable.ic_mic), contentDescription = "Speak to Amrita")
            }
        }
        FilledIconButton(
            onClick = onSend,
            enabled = canSend,
            modifier = Modifier.size(44.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = Pv.ink,
                contentColor = Color.White,
                disabledContainerColor = Pv.stone200,
                disabledContentColor = Color.White,
            ),
        ) {
            Icon(painterResource(R.drawable.ic_send), contentDescription = "Send message")
        }
    }
}

@Composable
private fun MessageRow(item: ChatItem, onOption: (String) -> Unit) {
    when (item.role) {
        ChatItem.Role.User -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(
                item.text,
                style = Pv.body,
                color = Pv.ink,
                modifier = Modifier
                    .padding(start = 48.dp)
                    .background(Pv.lavenderTint, RoundedCornerShape(18.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
        ChatItem.Role.Assistant -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (item.text.isNotEmpty()) {
                SelectionContainer {
                    Text(inlineMarkdown(item.text), style = Pv.body, color = if (item.failed) Pv.terracotta else Pv.ink)
                }
            } else if (item.streaming && item.cards.isEmpty()) {
                CircularProgressIndicator(color = Pv.lavender, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            }
            item.cards.forEach { card -> CardView(card, onOption) }
        }
    }
}

/** **bold** and *italic*, the inline markdown Amrita uses. */
internal fun inlineMarkdown(text: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val bold = text.startsWith("**", i)
        val marker = if (bold) "**" else if (text[i] == '*') "*" else null
        val close = marker?.let { text.indexOf(it, i + it.length) } ?: -1
        if (marker != null && close > i + marker.length) {
            val style = if (bold) SpanStyle(fontWeight = FontWeight.SemiBold) else SpanStyle(fontStyle = FontStyle.Italic)
            withStyle(style) { append(text.substring(i + marker.length, close)) }
            i = close + marker.length
        } else {
            append(text[i])
            i++
        }
    }
}
