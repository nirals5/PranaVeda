package com.pranaveda.app.ui.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.R
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.practice.PracticeCalendarCard
import com.pranaveda.app.practice.PracticeTrendsCard
import com.pranaveda.app.practice.SavedRitualsCard
import com.pranaveda.app.ui.chat.RitualSheet
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import kotlinx.coroutines.launch

/** Optional sign-in, and the account once signed in. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(auth: AuthStore, onBegin: () -> Unit = {}) {
    var notice by remember { mutableStateOf<String?>(null) }

    Scaffold(
        containerColor = Color.Transparent,
        // The app's tab bar already keeps clear of the system bars.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text("You", style = Pv.heading, color = Pv.ink) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            val user = auth.user
            if (user != null) {
                SignedIn(user, auth, onNotice = { notice = it })
            } else {
                SignedOut(auth, onStart = { notice = null })
            }
            (auth.problem ?: notice)?.let { Text(it, style = Pv.bodySmall, color = Pv.terracotta) }
            val app = LocalContext.current.applicationContext as PranaVedaApplication
            var reopening by remember { mutableStateOf<RecommendationResult?>(null) }
            PracticeCalendarCard(app.practice, onOpenRitual = { reopening = it }, onBegin = onBegin)
            PracticeTrendsCard(app.practice, app.health)
            SavedRitualsCard(app.saved, onOpen = { reopening = it })
            reopening?.let { RitualSheet(it) { reopening = null } }
        }
    }
}

@Composable
private fun SignedOut(auth: AuthStore, onStart: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Guest", style = Pv.headingLarge, color = Pv.ink)
        Text(
            "Signing in is optional. It saves the wellness profile Amrita builds to your account, so it follows you to the website and your other devices.",
            style = Pv.body,
            color = Pv.stone700,
        )
        // Google's light button style: white, a thin grey border, the "G".
        OutlinedButton(
            onClick = {
                onStart()
                scope.launch { auth.signInWithGoogle(context) }
            },
            enabled = !auth.isBusy,
            modifier = Modifier.widthIn(max = 320.dp).fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White, contentColor = Color(0xFF1F1F1F)),
            border = BorderStroke(1.dp, Color(0xFF747775)),
        ) {
            Image(painterResource(R.drawable.ic_google), contentDescription = null, modifier = Modifier.size(20.dp))
            Text("Continue with Google", style = Pv.body.copy(fontWeight = FontWeight.Medium), modifier = Modifier.padding(start = 10.dp))
        }
    }
}

@Composable
private fun SignedIn(user: AccountUser, auth: AuthStore, onNotice: (String?) -> Unit) {
    val scope = rememberCoroutineScope()
    var confirmingDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionLabel("Signed in")
        Text(user.displayName ?: user.email ?: "Your account", style = Pv.headingLarge, color = Pv.ink)
        if (user.displayName != null && user.email != null) {
            Text(user.email, style = Pv.bodySmall, color = Pv.stone500)
        }
        Text(
            "Your wellness profile is saved to your account and shared with the website.",
            style = Pv.body,
            color = Pv.stone700,
        )
        TextButton(onClick = { onNotice(null); scope.launch { auth.signOut() } }) {
            Text("Sign out", style = Pv.body.copy(fontWeight = FontWeight.Medium), color = Pv.lavenderDeep)
        }
        TextButton(onClick = { confirmingDelete = true }, enabled = !deleting) {
            Text("Delete account", style = Pv.bodySmall, color = Pv.terracotta)
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete your PranaVeda account?") },
            text = {
                Text(
                    "Your account, your sign-in and the wellness profile saved to it are removed from our servers for good, " +
                        "and you are signed out on every device. This phone goes back to how it was before you signed in.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    deleting = true
                    scope.launch {
                        onNotice(
                            runCatching { auth.deleteAccount() }.fold(
                                onSuccess = { "Your account has been deleted." },
                                onFailure = { "Your account could not be deleted just now. Please try again." },
                            ),
                        )
                        deleting = false
                    }
                }) { Text("Delete account", color = Pv.terracotta) }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") } },
            containerColor = Pv.warmWhite,
        )
    }
}
