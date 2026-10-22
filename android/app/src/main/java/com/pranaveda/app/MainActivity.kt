package com.pranaveda.app

import com.pranaveda.app.ui.chat.RitualSheet
import com.pranaveda.app.practice.GuidedPracticeScreen
import com.pranaveda.app.model.RecommendationResult
import androidx.compose.runtime.mutableStateOf
import android.net.Uri
import android.content.Intent
import androidx.compose.ui.unit.sp
import com.pranaveda.app.ui.theme.cappedSp
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import com.pranaveda.app.ui.account.AccountScreen
import com.pranaveda.app.ui.dosha.DoshaGuideViewModel
import com.pranaveda.app.ui.dosha.DoshaScreen
import kotlinx.coroutines.launch
import com.pranaveda.app.config.AppConfig
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.pranaveda.app.voice.HeyAmrita
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pranaveda.app.ui.chat.ChatScreen
import com.pranaveda.app.ui.chat.ChatViewModel
import com.pranaveda.app.ui.library.CatalogViewModel
import com.pranaveda.app.ui.library.LibraryScreen
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.PranaVedaTheme

private const val LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK"

class MainActivity : ComponentActivity() {
    /** A link waiting to be followed (pranaveda://talk, …/you, …/ritual/<id>, …/practice). */
    private var link by mutableStateOf<Uri?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        link = intent.data
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        if (savedInstanceState == null) link = intent?.data
        // Light design always: dark status and navigation bar icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        setContent {
            PranaVedaTheme {
                val chat: ChatViewModel = viewModel()
                val catalog: CatalogViewModel = viewModel()
                val doshaGuide: DoshaGuideViewModel = viewModel()
                val auth = (application as PranaVedaApplication).auth
                val insight = (application as PranaVedaApplication).insight
                val scope = rememberCoroutineScope()
                var tab by rememberSaveable { mutableIntStateOf(0) }
                // Raised by the widgets' "Talk to Amrita": the chat starts listening.
                var voiceRequest by remember { mutableIntStateOf(0) }
                var openedRitual by remember { mutableStateOf<RecommendationResult?>(null) }
                // A saved ritual begun straight away ("Start my practice").
                var practicing by remember { mutableStateOf<RecommendationResult?>(null) }
                LaunchedEffect(link) {
                    val uri = link ?: return@LaunchedEffect
                    when (uri.host) {
                        "talk" -> {
                            tab = 0
                            voiceRequest++
                        }
                        "you" -> tab = 3
                        "practice" -> {
                            openedRitual = null
                            val newest = (application as PranaVedaApplication).saved.rituals.firstOrNull()
                            if (newest != null) practicing = newest.result else tab = 2
                        }
                        "ritual" -> {
                            val saved = (application as PranaVedaApplication).saved.rituals.firstOrNull { it.id == uri.lastPathSegment }
                            if (saved != null) openedRitual = saved.result else tab = 3
                        }
                    }
                    link = null
                }
                // "Hey Amrita": listens on the Amrita tab (practice screens hand
                // it their own commands), never in the background or over
                // Amrita's own voice. Outside a practice it opens the chat listening.
                val app = application as PranaVedaApplication
                val heyAmrita = app.heyAmrita
                LaunchedEffect(Unit) {
                    heyAmrita.onWake = {
                        tab = 0
                        voiceRequest++
                    }
                }
                LaunchedEffect(tab == 0 && openedRitual == null) { heyAmrita.chatShowing = tab == 0 && openedRitual == null }
                LaunchedEffect(app.voice.isSpeaking) { heyAmrita.hold(HeyAmrita.Hold.Replying, app.voice.isSpeaking) }
                LifecycleEventEffect(Lifecycle.Event.ON_START) { heyAmrita.hold(HeyAmrita.Hold.Background, false) }
                LifecycleEventEffect(Lifecycle.Event.ON_STOP) { heyAmrita.hold(HeyAmrita.Hold.Background, true) }

                openedRitual?.let { RitualSheet(it) { openedRitual = null } }
                practicing?.let { GuidedPracticeScreen(it) { practicing = null } }

                // Talking to the dev server on the Mac: from Android 17 the
                // user must allow local-network access first (debug builds).
                val askForLocalNetwork = rememberLauncherForActivityResult(RequestPermission()) { granted ->
                    if (granted) {
                        catalog.load()
                        scope.launch { auth.restore() }
                    }
                }
                LaunchedEffect(Unit) {
                    if (AppConfig.apiIsOnLocalNetwork && Build.VERSION.SDK_INT >= 37 &&
                        checkSelfPermission(LOCAL_NETWORK) != PackageManager.PERMISSION_GRANTED
                    ) {
                        askForLocalNetwork.launch(LOCAL_NETWORK)
                    } else {
                        // A session saved on an earlier launch: confirm it and
                        // bring the profile in line with the account.
                        auth.restore()
                    }
                }

                Box(Modifier.fillMaxSize().background(Pv.background)) {
                    Scaffold(
                        containerColor = androidx.compose.ui.graphics.Color.Transparent,
                        bottomBar = {
                            NavigationBar(containerColor = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f)) {
                                val itemColors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Pv.lavenderDeep,
                                    selectedTextColor = Pv.lavenderDeep,
                                    indicatorColor = Pv.lavenderTint,
                                    unselectedIconColor = Pv.stone500,
                                    unselectedTextColor = Pv.stone500,
                                )
                                listOf(
                                    R.drawable.ic_lotus to "Ask Amrita",
                                    R.drawable.ic_vata to "Dosha",
                                    R.drawable.ic_library to "Library",
                                    R.drawable.ic_person to "You",
                                ).forEachIndexed { index, (icon, label) ->
                                    NavigationBarItem(
                                        selected = tab == index,
                                        onClick = { tab = index },
                                        icon = { Icon(painterResource(icon), contentDescription = null) },
                                        // Tab labels grow with the font size only so far, so "Ask Amrita" still fits.
                                        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = cappedSp(12.sp)) },
                                        colors = itemColors,
                                    )
                                }
                            }
                        },
                    ) { padding ->
                        Box(Modifier.padding(padding).consumeWindowInsets(padding)) {
                            when (tab) {
                                0 -> ChatScreen(chat, insight, (application as PranaVedaApplication).voice, voiceRequest)
                                1 -> DoshaScreen(chat.profile, doshaGuide) { message ->
                                    // As on the website: over to the chat, with the question asked.
                                    tab = 0
                                    chat.send(message)
                                }
                                2 -> LibraryScreen(catalog)
                                else -> AccountScreen(auth, onBegin = { tab = 0 })
                            }
                        }
                    }
                }
            }
        }
    }
}
