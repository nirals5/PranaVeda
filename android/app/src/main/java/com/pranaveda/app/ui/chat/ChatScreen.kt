package com.pranaveda.app.ui.chat

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
fun ChatScreen(model: ChatViewModel, insight: DailyInsightStore? = null, voice: AmritaVoice? = null) {
    var talking by rememberSaveable { mutableStateOf(false) }
    var draft by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    val listState = rememberLazyListState()

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
        if (model.items.isNotEmpty()) listState.animateScrollToItem(model.items.size)
    }

    if (talking) {
        VoiceSheet(onDismiss = { talking = false }, onSend = { model.send(it, spoken = true) })
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
                        IconButton(onClick = { voice.changeMuted(!voice.isMuted) }) {
                            Icon(
                                painterResource(if (voice.isMuted) R.drawable.ic_volume_off else R.drawable.ic_volume_up),
                                contentDescription = if (voice.isMuted) "Voice replies off" else "Voice replies on",
                                tint = if (voice.isMuted) Pv.stone500 else Pv.lavenderDeep,
                            )
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
            InputBar(
                draft = draft,
                onDraftChange = { draft = it },
                canSend = draft.isNotBlank() && !model.isStreaming,
                onSend = ::send,
                onSpeak = if (voice != null) ({ talking = true }) else null,
                modifier = Modifier.imePadding(),
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
        Text(greeting, style = Pv.display, color = Pv.ink)
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
            placeholder = { Text("Tell Amrita how you're feeling…", style = Pv.body, color = Pv.stone500) },
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
