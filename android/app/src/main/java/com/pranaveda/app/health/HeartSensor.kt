package com.pranaveda.app.health

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import com.pranaveda.app.model.HeartMeasurement
import com.pranaveda.app.model.HeartSummary
import java.util.UUID

/**
 * Live heart rate from a nearby Bluetooth sensor, through the standard Heart
 * Rate service (chest straps, arm bands, and watches in "broadcast heart rate"
 * mode), as on the website (src/hooks/useHeartRateMonitor.ts). Nothing happens
 * until someone picks a sensor under Heart & sleep. After that a guided
 * practice connects to it, and the connection ends with the practice.
 */
class HeartSensor(private val context: Context) {
    data class Found(val name: String, val address: String)

    private val prefs = context.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private val adapter get() = context.getSystemService(BluetoothManager::class.java)?.adapter

    var sensorName by mutableStateOf(prefs.getString(NAME_KEY, null))
        private set
    private var sensorAddress = prefs.getString(ADDRESS_KEY, null)

    /** The latest reading while connected. */
    var bpm by mutableStateOf<Int?>(null)
        private set
    var isScanning by mutableStateOf(false)
        private set
    val found = mutableStateListOf<Found>()

    private var gatt: BluetoothGatt? = null
    private var holds by mutableIntStateOf(0)
    private var bpms = mutableListOf<Int>()
    private var rrMs = mutableListOf<Double>()
    private var practicing = false

    /** Connecting, or trying to, for a practice or a check. */
    val isWanted get() = holds > 0
    val bluetoothIsOn get() = adapter?.isEnabled == true
    val hasPermission get() = PERMISSIONS.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

    // MARK: Finding a sensor

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val address = result.device.address
            val name = runCatching { result.device.name }.getOrNull() ?: result.scanRecord?.deviceName ?: "Heart-rate sensor"
            main.post { if (found.none { it.address == address }) found += Found(name, address) }
        }

        override fun onScanFailed(errorCode: Int) {
            main.post { isScanning = false }
        }
    }
    private val endScan = Runnable { stopScan() }

    @SuppressLint("MissingPermission")
    fun startScan() {
        val scanner = adapter?.bluetoothLeScanner ?: return
        if (!hasPermission || isScanning) return
        found.clear()
        runCatching {
            scanner.startScan(
                listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(HEART_RATE_SERVICE)).build()),
                ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
                scanCallback,
            )
            isScanning = true
            main.postDelayed(endScan, SCAN_MILLIS)
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        main.removeCallbacks(endScan)
        if (isScanning) runCatching { adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
        isScanning = false
    }

    fun choose(sensor: Found) {
        stopScan()
        disconnect()
        sensorName = sensor.name
        sensorAddress = sensor.address
        prefs.edit().putString(NAME_KEY, sensor.name).putString(ADDRESS_KEY, sensor.address).apply()
        if (holds > 0) connect(autoConnect = false)
    }

    fun forget() {
        stopScan()
        disconnect()
        sensorName = null
        sensorAddress = null
        prefs.edit().remove(NAME_KEY).remove(ADDRESS_KEY).apply()
    }

    // MARK: The connection

    /** Something wants readings: connect if nothing else already has. Pair with [release]. */
    fun hold() {
        holds++
        if (gatt == null) connect(autoConnect = false)
    }

    fun release() {
        holds = (holds - 1).coerceAtLeast(0)
        if (holds == 0) disconnect()
    }

    @SuppressLint("MissingPermission")
    private fun connect(autoConnect: Boolean) {
        val address = sensorAddress ?: return
        if (!hasPermission || !bluetoothIsOn) return
        runCatching {
            gatt = adapter?.getRemoteDevice(address)?.connectGatt(context, autoConnect, gattCallback, BluetoothDevice.TRANSPORT_LE)
        }
    }

    @SuppressLint("MissingPermission")
    private fun disconnect() {
        val current = gatt
        gatt = null
        bpm = null
        runCatching {
            current?.disconnect()
            current?.close()
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(changed: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                runCatching { changed.discoverServices() }
                return
            }
            if (newState != BluetoothProfile.STATE_DISCONNECTED) return
            // Dropped while still wanted: wait for it to come back in range.
            main.post {
                runCatching { changed.close() }
                if (gatt !== changed) return@post
                gatt = null
                bpm = null
                if (holds > 0) connect(autoConnect = true)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(changed: BluetoothGatt, status: Int) {
            val measurement = changed.getService(HEART_RATE_SERVICE)?.getCharacteristic(HEART_RATE_MEASUREMENT) ?: return
            val config = measurement.getDescriptor(CLIENT_CONFIG) ?: return
            runCatching {
                changed.setCharacteristicNotification(measurement, true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    changed.writeDescriptor(config, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    @Suppress("DEPRECATION")
                    config.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    @Suppress("DEPRECATION")
                    changed.writeDescriptor(config)
                }
            }
        }

        override fun onCharacteristicChanged(changed: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            received(value)
        }

        @Deprecated("Before Android 13")
        override fun onCharacteristicChanged(changed: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) characteristic.value?.let(::received)
        }
    }

    private fun received(bytes: ByteArray) {
        val reading = HeartMeasurement.parse(bytes) ?: return
        main.post {
            // Outside this range there's no skin contact yet, or it's noise.
            if (reading.bpm !in 25..240 || gatt == null) return@post
            bpm = reading.bpm
            if (practicing) {
                bpms += reading.bpm
                rrMs += reading.rrMs
            }
        }
    }

    // MARK: A practice

    /** A practice started: keep what the sensor reads from now on. */
    fun begin() {
        bpms = mutableListOf()
        rrMs = mutableListOf()
        practicing = true
    }

    /** The practice finished: its summary, or null with too few readings. */
    fun finish(): HeartSummary? {
        if (!practicing) return null
        practicing = false
        return HeartSummary.summarize(bpms, rrMs)
    }

    /** Closed before the end: nothing is kept. */
    fun cancel() {
        practicing = false
        bpms = mutableListOf()
        rrMs = mutableListOf()
    }

    companion object {
        private const val NAME_KEY = "pranaveda_heart_sensor_name"
        private const val ADDRESS_KEY = "pranaveda_heart_sensor_address"
        private const val SCAN_MILLIS = 15_000L
        private val HEART_RATE_SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
        private val HEART_RATE_MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
        private val CLIENT_CONFIG = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        /** Android 12 and up has Bluetooth permissions of its own; before that, finding nearby devices needs location. */
        val PERMISSIONS: Array<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }
}
