package com.pranaveda.app

import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.util.concurrent.TimeUnit

/**
 * The stand-in server's base URL, addressed by the IP it listens on.
 *
 * [MockWebServer.url] names the host "localhost", which also resolves to ::1,
 * and OkHttp tries that first. The server listens on 127.0.0.1 only, and on
 * macOS another program can hold the same port on ::1 (the Android emulator
 * does, on a handful of ephemeral ports). The request then goes to that
 * program, which never answers, and the test hangs until the read timeout.
 */
fun MockWebServer.baseUrl(): HttpUrl = url("/").newBuilder().host(socketAddress.address.hostAddress!!).build()

class TestServerTest {
    @Test fun reachesTheServerWhenAnotherProgramHoldsItsPortOnIpv6() {
        val loopback6 = runCatching { InetAddress.getByName("::1") as Inet6Address }.getOrNull()
        val squatter = runCatching { ServerSocket().apply { bind(InetSocketAddress(loopback6, 0)) } }.getOrNull()
        assumeTrue("needs IPv6 loopback", squatter != null)
        squatter!!.use {
            MockWebServer().use { server ->
                server.enqueue(MockResponse.Builder().body("ok").build())
                // Same port as the silent listener on ::1, as the emulator's ports collide by chance.
                val sharing = runCatching { server.start(InetAddress.getByName("127.0.0.1"), squatter.localPort) }
                assumeTrue("the system lets IPv4 and IPv6 share a port", sharing.isSuccess)
                val client = OkHttpClient.Builder().readTimeout(2, TimeUnit.SECONDS).build()
                val body = client.newCall(Request.Builder().url(server.baseUrl().resolve("ping")!!).build()).execute().use { it.body.string() }
                assertEquals("ok", body)
            }
        }
    }
}
