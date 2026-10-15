package com.pranaveda.app

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
import com.pranaveda.app.config.AppConfig
import androidx.activity.enableEdgeToEdge
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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pranaveda.app.ui.chat.ChatScreen
import com.pranaveda.app.ui.chat.ChatViewModel
import com.pranaveda.app.ui.library.CatalogViewModel
import com.pranaveda.app.ui.library.LibraryScreen
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.PranaVedaTheme

private const val LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
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
                var tab by rememberSaveable { mutableIntStateOf(0) }

                // Talking to the dev server on the Mac: from Android 17 the
                // user must allow local-network access first (debug builds).
                val askForLocalNetwork = rememberLauncherForActivityResult(RequestPermission()) { granted ->
                    if (granted) catalog.load()
                }
                LaunchedEffect(Unit) {
                    if (AppConfig.apiIsOnLocalNetwork && Build.VERSION.SDK_INT >= 37 &&
                        checkSelfPermission(LOCAL_NETWORK) != PackageManager.PERMISSION_GRANTED
                    ) {
                        askForLocalNetwork.launch(LOCAL_NETWORK)
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
                                NavigationBarItem(
                                    selected = tab == 0,
                                    onClick = { tab = 0 },
                                    icon = { Icon(painterResource(R.drawable.ic_lotus), contentDescription = null) },
                                    label = { Text("Amrita") },
                                    colors = itemColors,
                                )
                                NavigationBarItem(
                                    selected = tab == 1,
                                    onClick = { tab = 1 },
                                    icon = { Icon(painterResource(R.drawable.ic_library), contentDescription = null) },
                                    label = { Text("Library") },
                                    colors = itemColors,
                                )
                            }
                        },
                    ) { padding ->
                        Box(Modifier.padding(padding).consumeWindowInsets(padding)) {
                            when (tab) {
                                0 -> ChatScreen(chat)
                                else -> LibraryScreen(catalog)
                            }
                        }
                    }
                }
            }
        }
    }
}
