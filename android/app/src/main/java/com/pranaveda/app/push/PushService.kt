package com.pranaveda.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.calendar.CalendarStore
import com.pranaveda.app.calendar.FreeTimeNotice
import kotlinx.coroutines.launch

/** Receives the server's free-time nudges (KAN-31) and new tokens from Firebase. */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val app = application as PranaVedaApplication
        if (app.auth.isSignedIn && app.calendar.remindersOn) app.appScope.launch { app.push.registered(token) }
    }

    /** A data message, so the app decides: shown like a free-time reminder, never while PranaVeda is on screen. */
    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (!PushNudges.isServerNudge(data)) return
        val prefs = getSharedPreferences("pranaveda", MODE_PRIVATE)
        if (prefs.getBoolean(CalendarStore.ON_SCREEN_KEY, false)) return
        val body = data["body"] ?: return
        FreeTimeNotice.show(this, data["title"] ?: "Amrita", body)
    }
}
