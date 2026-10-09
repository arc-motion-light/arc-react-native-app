package com.example.lampble.mesh

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.util.UUID

/** Current WBA BLE transport. MeshManager is retained only as the JS ABI name.
 * No Nordic network, proxy, provisioning, OOB or unprovisioned UUID operations.
 * Service/response validation establishes protocol compatibility, not cryptographic ownership.
 * Ownership and command grants remain in the shared app's existing authorization path.
 */
@SuppressLint("MissingPermission")
class ArcBleModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val handler = Handler(Looper.getMainLooper())
  private val preferences = context.getSharedPreferences("arc_wba_ble_v1", Context.MODE_PRIVATE)
  private val nodes = loadMetadata("nodes")
  private val routes = loadMetadata("routes")
  private val candidates = mutableMapOf<String, Pair<BluetoothDevice, String>>()
  private val sessions = mutableMapOf<String, Session>()
  private val requested = mutableSetOf<String>()
  private val retries = mutableMapOf<String, Int>()
  private var scan: ScanCallback? = null
  private var scanPromise: Promise? = null
  private val service = UUID.fromString("00000000-0001-11e1-9ab4-0002a5d5c51b")
  private val env = UUID.fromString("000c0000-0001-11e1-ac36-0002a5d5c51b")
  private val rx = UUID.fromString("01000000-0001-11e1-ac36-0002a5d5c51b")
  private val tx = UUID.fromString("01000001-0001-11e1-ac36-0002a5d5c51b")
  private val debug = UUID.fromString("00d00000-0001-11e1-ac36-0002a5d5c51b")
  private val cccd = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  private val adapter get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
  // Android GATT callbacks carry characteristic/descriptor identity, but no
  // transaction ID. Match the callback to the in-flight operation; a timed-out
  // operation closes its session rather than allowing a late callback to advance
  // another queued command. Matching writes to the same characteristic still
  // rely on Android's one-at-a-time GATT callback contract.
  private enum class OpType { MTU, DESCRIPTOR_WRITE, CHARACTERISTIC_READ, CHARACTERISTIC_WRITE, LOCAL }
  private data class Operation(
    val type: OpType,
    val target: UUID?,
    val start: () -> Boolean,
    val done: (Boolean) -> Unit
  )
  private inner class Session(val id: String, val name: String, val kind: String, val completion: Promise?, var telemetry: Boolean) {
    lateinit var gatt: BluetoothGatt
    val queue = ArrayDeque<Operation>()
    var active: Operation? = null
    var ready = false
    var completed = false
    var validated = false
    var mtu = 23
    var lastStatus: String? = null
    var lastProbeThreadDebug: String? = null
    var timeout: Runnable? = null
  }
  private fun loadMetadata(key: String): JSONObject = try {
    JSONObject(preferences.getString(key, "{}") ?: "{}")
  } catch (_: Exception) { JSONObject() }
  private val bluetoothState = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1) == BluetoothAdapter.STATE_ON) handler.post {
        requested.toList().forEach { id -> if (sessions[id] == null && nodes.has(id)) { retries[id] = 0; connect(id, null, true) } }
      }
    }
  }
  override fun initialize() {
    super.initialize()
    ContextCompat.registerReceiver(context, bluetoothState, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), ContextCompat.RECEIVER_EXPORTED)
  }
  override fun getName() = "MeshManager"
  @ReactMethod fun addListener(name: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
  @ReactMethod fun initialize(promise: Promise) { promise.resolve(null) }
  private fun event(name: String, body: WritableMap) {
    if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, body)
  }
  private fun connection(id: String, connected: Boolean) = event("MeshConnection", Arguments.createMap().apply {
    putString("nodeId", id); putBoolean("connected", connected)
  })
  private fun log(id: String, message: String) = event("MeshProvisioningDebug", Arguments.createMap().apply {
    putString("nodeId", id); putString("message", message)
  })
  private fun permitted(promise: Promise, scanning: Boolean = false): Boolean {
    val permissions = if (Build.VERSION.SDK_INT >= 31) {
      if (scanning) listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT) else listOf(Manifest.permission.BLUETOOTH_CONNECT)
    } else if (scanning) listOf(Manifest.permission.ACCESS_FINE_LOCATION) else emptyList()
    if (permissions.any { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }) {
      promise.reject("BLE_PERMISSION", "Bluetooth permission is required."); return false
    }
    if (adapter?.isEnabled != true) { promise.reject("BLUETOOTH_NOT_READY", "Bluetooth is not powered on."); return false }
    return true
  }
  private fun role(name: String): String = when {
    name.startsWith("ARC Lamp") -> "lamp"
    name.startsWith("ARC Probe") || name == "ARC_T" -> "probe"
    name.startsWith("ARC Gateway") -> "gateway"
    else -> "other"
  }
  // Only entries previously validated by this WBA transport are stored here;
  // unlike an advertisement name, their role survives a display-name change.
  // This is cached protocol identity, NOT cryptographic authentication.
  private fun verifiedKind(id: String): String? = nodes.optJSONObject(id)
    ?.optString("kind")?.takeIf { it in listOf("lamp", "probe", "gateway") }
  @ReactMethod fun scanArcDevices(promise: Promise) = handler.post {
    if (!permitted(promise, true)) return@post
    if (scan != null) { promise.reject("SCAN_IN_PROGRESS", "An ARC BLE scan is already in progress."); return@post }
    candidates.clear()
    scanPromise = promise
    scan = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val id = result.device.address
        val name = result.scanRecord?.deviceName ?: result.device.name
          ?: nodes.optJSONObject(id)?.optString("name")?.takeIf { it.isNotBlank() } ?: return
        // New peripherals require a recognizable ARC advertisement; a previously
        // validated BLE identity may advertise a custom name later.
        if (role(name) == "other" && verifiedKind(id) == null) return
        handler.post { candidates[id] = result.device to name }
      }
      override fun onScanFailed(errorCode: Int) = handler.post {
        finishScan("BLE scan failed with error $errorCode")
      }.let { Unit }
    }
    try {
      adapter.bluetoothLeScanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scan)
      handler.postDelayed({ if (scanPromise === promise) finishScan(null) }, 8000)
    } catch (error: Exception) { finishScan(error.message ?: "BLE scan failed") }
  }.let { Unit }
  private fun finishScan(error: String?) {
    val pending = scanPromise ?: return
    try { adapter?.bluetoothLeScanner?.stopScan(scan) } catch (_: Exception) {}
    scan = null; scanPromise = null
    if (error != null) { pending.reject("SCAN_FAILED", error); return }
    pending.resolve(Arguments.createArray().apply {
      candidates.forEach { (id, candidate) -> pushMap(Arguments.createMap().apply {
        val previous = nodes.optJSONObject(id)
        val knownKind = verifiedKind(id)
        putString("id", id)
        putString("blePeripheralId", id)
        putString("name", previous?.optString("name")?.takeIf { it.isNotBlank() } ?: candidate.second)
        putString("nodeKind", knownKind ?: role(candidate.second))
        putBoolean("arcLocalRoleAdvertised", role(candidate.second) != "other")
        putBoolean("arcPreviouslyValidated", knownKind != null)
      }) }
    })
  }
  @ReactMethod fun listNodes(promise: Promise) = handler.post {
    promise.resolve(Arguments.createArray().apply {
      nodes.keys().forEach { id ->
        val node = nodes.getJSONObject(id)
        pushMap(Arguments.createMap().apply {
          putString("id", id); putString("blePeripheralId", id)
          putString("name", node.getString("name")); putString("nodeKind", node.getString("kind"))
          putString("abbreviation", "ARC"); putString("color", "#22c55e")
          putBoolean("provisioned", true); putBoolean("connected", sessions[id]?.validated == true)
        })
      }
    })
  }.let { Unit }
  @ReactMethod fun connectNode(nodeId: String, promise: Promise) = handler.post {
    if (!permitted(promise)) return@post
    val owner = routes.optString(nodeId).ifEmpty { nodeId }
    requested.add(owner); retries[owner] = 0
    connect(owner, promise, true)
  }.let { Unit }
  private fun connect(id: String, promise: Promise?, telemetry: Boolean) {
    val existing = sessions[id]
    if (existing != null) {
      if (existing.validated) { if (telemetry && !existing.telemetry) { existing.telemetry = true; connection(id, true) }; promise?.resolve(null) } else promise?.reject("CONNECT_IN_PROGRESS", "ARC BLE validation is already in progress.")
      return
    }
    val previous = nodes.optJSONObject(id)
    val name = previous?.optString("name")?.takeIf { it.isNotBlank() } ?: candidates[id]?.second
    val kind = verifiedKind(id) ?: candidates[id]?.second?.let { role(it) } ?: "other"
    if (!BluetoothAdapter.checkBluetoothAddress(id) || name == null || kind == "other") {
      promise?.reject("ARC_DEVICE_UNKNOWN", "Scan for a current ARC BLE device first."); return
    }
    val session = Session(id, name, kind, promise, telemetry)
    sessions[id] = session
    try {
      val device = candidates[id]?.first ?: adapter.getRemoteDevice(id)
      session.gatt = device.connectGatt(context, false, callbacks(session), BluetoothDevice.TRANSPORT_LE)
      session.timeout = Runnable { if (!session.validated && sessions[id] === session) close(session, "ARC GATT/protocol validation timed out.") }
      handler.postDelayed(session.timeout!!, 20000)
    } catch (error: Exception) { close(session, error.message ?: "BLE connection failed") }
  }
  private fun enqueue(s: Session, type: OpType, target: UUID? = null, start: () -> Boolean, done: (Boolean) -> Unit = {}) {
    s.queue.add(Operation(type, target, start, done)); pump(s)
  }
  private fun pump(s: Session) {
    if (s.active != null || sessions[s.id] !== s) return
    s.active = if (s.queue.isEmpty()) null else s.queue.removeFirst()
    val operation = s.active ?: return
    try { if (operation.start() != true) complete(s, false, operation.type, operation.target) }
    catch (_: Exception) { complete(s, false, operation.type, operation.target) }
    if (s.active === operation) handler.postDelayed({
      if (sessions[s.id] === s && s.active === operation) close(s, "BLE operation timed out.")
    }, 10000)
  }
  private fun matches(s: Session, type: OpType, target: UUID? = null): Boolean =
    sessions[s.id] === s && s.active?.type == type && s.active?.target == target

  private fun complete(s: Session, success: Boolean, type: OpType, target: UUID? = null) {
    if (!matches(s, type, target)) return
    val operation = s.active ?: return
    s.active = null
    operation.done(success)
    pump(s)
  }
  private fun write(s: Session, data: ByteArray, done: (Boolean) -> Unit) {
    val characteristic = s.gatt.getService(service)?.getCharacteristic(rx)
    if (characteristic == null || data.size > s.mtu - 3) { done(false); return }
    enqueue(s, OpType.CHARACTERISTIC_WRITE, rx, {
      characteristic.writeType = if (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT else BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      if (Build.VERSION.SDK_INT >= 33) s.gatt.writeCharacteristic(characteristic, data, characteristic.writeType) == BluetoothStatusCodes.SUCCESS
      else { characteristic.value = data; s.gatt.writeCharacteristic(characteristic) }
    }, done)
  }
  private fun callbacks(s: Session) = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      handler.post {
        if (sessions[s.id] !== s) return@post
        if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
          // Request sufficient ATT MTU for the existing schema-3 schedule and
          // history frames; do not split application records into a new protocol.
          enqueue(s, OpType.MTU, start = { gatt.requestMtu(247) }) { if (!gatt.discoverServices()) close(s, "Service discovery could not start.") }
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) close(s, "BLE disconnected (status $status).")
      }
    }
    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) { handler.post {
      if (!matches(s, OpType.MTU)) return@post
      if (status == BluetoothGatt.GATT_SUCCESS) s.mtu = mtu
      complete(s, status == BluetoothGatt.GATT_SUCCESS, OpType.MTU)
    } }
    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) { handler.post {
      if (sessions[s.id] !== s) return@post
      val current = gatt.getService(service)
      val input = current?.getCharacteristic(rx)
      val output = current?.getCharacteristic(tx)
      if (status != BluetoothGatt.GATT_SUCCESS || input == null || output == null ||
        input.properties and (BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) == 0 ||
        output.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY == 0) {
        close(s, "Current ARC WBA Loader service/characteristics missing."); return@post
      }
      val notificationChars = listOfNotNull(output, current.getCharacteristic(env)).filter { it.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 }
      notificationChars.forEach { ch ->
        val descriptor = ch.getDescriptor(cccd)
        if (descriptor == null || !gatt.setCharacteristicNotification(ch, true)) { close(s, "ARC notification subscription unavailable."); return@post }
        enqueue(s, OpType.DESCRIPTOR_WRITE, ch.uuid, {
          if (Build.VERSION.SDK_INT >= 33) gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS
          else { descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE; gatt.writeDescriptor(descriptor) }
        }) { ok -> if (!ok) close(s, "ARC notification subscription failed.") else log(s.id, "[ArcGATT] CCCD ready ${ch.uuid}") }
      }
      enqueue(s, OpType.LOCAL, start = { handler.post { complete(s, true, OpType.LOCAL) }; true }) { ok -> if (ok) { s.ready = true; log(s.id, "[ArcGATT] subscriptions ready; application validation starts") } }
      // Read the same ENV / Loader TX channels as iOS. A Lamp additionally
      // answers the existing read-only 0x02 request before it can be selected.
      listOfNotNull(current.getCharacteristic(env), output).filter { it.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0 }.forEach { ch -> enqueue(s, OpType.CHARACTERISTIC_READ, ch.uuid, { gatt.readCharacteristic(ch) }) }
      // A sleepy Probe may expose no current ENV sample. As on iOS, its
      // configuration link is admitted by the exact requested identity and
      // current Loader service, not by requiring a fresh sensor measurement.
      if (s.kind == "probe") enqueue(s, OpType.LOCAL, start = { handler.post { complete(s, true, OpType.LOCAL) }; true }) { ok -> if (ok) validate(s) }
      if (s.kind == "lamp") write(s, byteArrayOf(2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) { ok -> if (!ok) close(s, "ARC status request failed.") }

    } }
    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) { handler.post {
      if (descriptor.uuid == cccd) complete(s, status == BluetoothGatt.GATT_SUCCESS, OpType.DESCRIPTOR_WRITE, descriptor.characteristic.uuid)
    } }
    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) { handler.post {
      complete(s, status == BluetoothGatt.GATT_SUCCESS, OpType.CHARACTERISTIC_WRITE, characteristic.uuid)
    } }
    @Deprecated("Used on Android below API 33")
    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (Build.VERSION.SDK_INT < 33) receive(s, characteristic.uuid, characteristic.value ?: byteArrayOf(), status, true)
    }
    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) = receive(s, characteristic.uuid, value, status, true)
    @Deprecated("Used on Android below API 33")
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT < 33) receive(s, characteristic.uuid, characteristic.value ?: byteArrayOf(), BluetoothGatt.GATT_SUCCESS, false)
    }
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) = receive(s, characteristic.uuid, value, BluetoothGatt.GATT_SUCCESS, false)
  }
  private fun receive(s: Session, uuid: UUID, value: ByteArray, status: Int, read: Boolean) = handler.post {
    if (sessions[s.id] !== s || (read && !matches(s, OpType.CHARACTERISTIC_READ, uuid))) return@post
    if (status == BluetoothGatt.GATT_SUCCESS && value.isNotEmpty()) {
      if (uuid == tx && (value.size == 11 || value.size >= 15) && (value[0].toInt() and 255) == 3) {
        s.lastStatus = Base64.encodeToString(value, Base64.NO_WRAP)
        if (s.ready && s.kind == "lamp") validate(s)
      }
      if (s.ready && s.kind == "probe" && uuid == env && value.size >= 6 &&
        (value[2].toInt() and 255) in listOf(0, 0x28, 0x64, 0xa8, 0xe4) &&
        (value[4].toInt() and 255) in listOf(0, 0x10, 0x11, 0x20, 0x21, 0x22, 0x30) &&
        (value[2].toInt() != 0 || value[3].toInt() != 0 || value[4].toInt() != 0)) validate(s)
      if (s.ready && s.kind == "gateway" && uuid == tx && value.size >= 48 && value[0].toInt() == 0x57 && value[1].toInt() == 2) validate(s)
      if (s.telemetry && s.validated && (uuid == tx || uuid == env)) event("MeshTelemetry", Arguments.createMap().apply {
        putString("nodeId", s.id)
        putString(if (uuid == tx) "payloadBase64" else "probeEnvBase64", Base64.encodeToString(value, Base64.NO_WRAP))
      })
      if (uuid == debug) {
        val message = ArcProbeThreadDebug.decode(value)
        if (message != null && message != s.lastProbeThreadDebug) {
          s.lastProbeThreadDebug = message
          log(s.id, message)
        }
      }
    }
    if (read) complete(s, status == BluetoothGatt.GATT_SUCCESS, OpType.CHARACTERISTIC_READ, uuid)
  }.let { Unit }
  private fun validate(s: Session) {
    if (s.validated || sessions[s.id] !== s) return
    s.validated = true; retries[s.id] = 0
    log(s.id, if (s.kind == "probe") "[ArcGATT] Probe configuration service ready" else "[ArcGATT] validated ${s.kind} application protocol")
    s.timeout?.let { handler.removeCallbacks(it) }
    nodes.put(s.id, JSONObject().put("name", s.name).put("kind", s.kind))
    preferences.edit().putString("nodes", nodes.toString()).apply()
    if (s.telemetry) connection(s.id, true)
    if (!s.completed) { s.completed = true; s.completion?.resolve(null) }
  }
  private fun close(s: Session, reason: String) {
    if (sessions[s.id] !== s) return
    sessions.remove(s.id)
    s.timeout?.let { handler.removeCallbacks(it) }
    try { s.gatt.disconnect(); s.gatt.close() } catch (_: Exception) {}
    val pending = listOfNotNull(s.active) + s.queue.toList()
    s.active = null; s.queue.clear(); pending.forEach { it.done(false) }
    if (!s.completed) { s.completed = true; s.completion?.reject("ARC_BLE_LINK", reason) }
    if (s.telemetry) { connection(s.id, false); log(s.id, reason) }
    if (s.telemetry && requested.contains(s.id) && nodes.has(s.id)) {
      val attempt = (retries[s.id] ?: 0) + 1
      retries[s.id] = attempt
      if (attempt <= 3) handler.postDelayed({ if (requested.contains(s.id) && sessions[s.id] == null) connect(s.id, null, true) }, 1500L * attempt)
    }
  }
  @ReactMethod fun disconnectNode(nodeId: String, promise: Promise) = handler.post {
    val owner = routes.optString(nodeId).ifEmpty { nodeId }
    requested.remove(owner)
    sessions[owner]?.let { close(it, "Disconnected by user.") }
    promise.resolve(null)
  }.let { Unit }
  @ReactMethod fun getHistorySessionState(nodeId: String, promise: Promise) = handler.post {
    promise.resolve(if (sessions[nodeId]?.validated == true && sessions[nodeId]?.ready == true) "SESSION_READY" else "DISCONNECTED")
  }.let { Unit }
  @ReactMethod fun writeLoaderControl(nodeId: String, payloadBase64: String, promise: Promise) = handler.post {
    val s = sessions[nodeId]
    val data = try { Base64.decode(payloadBase64, Base64.DEFAULT) } catch (_: Exception) { byteArrayOf() }
    if (s?.validated != true || !s.ready) { promise.reject("LOADER_CONTROL_LINK", "Validated ARC BLE link is not available."); return@post }
    if (!validControl(data)) { promise.reject("LOADER_CONTROL_PAYLOAD", "Unsupported Loader RX command or payload length."); return@post }
    write(s, data) { ok -> if (ok) promise.resolve(null) else promise.reject("LOADER_CONTROL_WRITE", "ARC Loader RX write failed.") }
  }.let { Unit }
  private fun validControl(data: ByteArray): Boolean {
    if (data.isEmpty()) return false
    val op = data[0].toInt() and 255
    return when (op) {
      0x01, 0x02, 0x10, 0x20 -> data.size == 11
      0x30 -> data.size == 31
      0x32 -> data.size == 2 && data[1].toInt() == 3
      0x40, 0x42, 0x43, 0x44 -> data.size == 10
      0x41 -> data.size in listOf(3, 4, 10)
      0x62 -> data.size == 2 && data[1].toInt() == 1
      0x64 -> (data.size == 6 && data[1].toInt() == 1) || (data.size == 11 && data[1].toInt() == 2)
      0x66, 0x74 -> data.size == 6 && data[1].toInt() == 1
      0x75 -> data.size == 12 && data[1].toInt() == 1
      else -> false
    }
  }
  @ReactMethod fun sendVendorMessage(params: ReadableMap, promise: Promise) {
    // Shared encoders already supply the complete current application frame.
    writeLoaderControl(params.getString("nodeId") ?: "", params.getString("payloadBase64") ?: "", promise)
  }
  @ReactMethod fun readVendorStatus(params: ReadableMap, promise: Promise) = handler.post {
    promise.resolve(sessions[params.getString("nodeId")]?.lastStatus?.let { Arguments.createMap().apply { putString("payloadBase64", it) } })
  }.let { Unit }
  @ReactMethod fun configureProbeGatewayRoute(params: ReadableMap, promise: Promise) = handler.post {
    if (!permitted(promise)) return@post
    val probeId = params.getString("probeNodeId") ?: ""
    val owner = params.getString("gatewayNodeId") ?: ""
    val mode = if (params.hasKey("routeMode") && params.getInt("routeMode") == 0) 0 else 1
    val probeKind = verifiedKind(probeId) ?: candidates[probeId]?.second?.let { role(it) }
    if (probeKind != "probe" || verifiedKind(owner) !in listOf("lamp", "gateway")) { promise.reject("ROUTE_IDENTITY", "A known ARC Probe and validated ARC bridge are required."); return@post }
    val length = minOf(24, owner.length)
    val payload = ByteArray(4 + length).apply { this[0] = 0x52; this[1] = 1; this[2] = mode.toByte(); this[3] = length.toByte(); for (i in 0 until length) this[4 + i] = owner[i].code.toByte() }
    // Configuration uses the exact requested Probe; never another scanned
    // peripheral or the Lamp as a fallback. Telemetry continues on the bridge.
    val routePromise = object : Promise by promise {
      override fun resolve(value: Any?) {
        val s = sessions[probeId] ?: run { promise.reject("ROUTE_LINK", "Probe configuration link unavailable."); return }
        write(s, payload) { ok ->
          if (!ok) { promise.reject("ROUTE_WRITE", "ARC route-set write failed."); return@write }
          s.telemetry = mode == 0
          connection(probeId, mode == 0)
          // This is the DESIRED route used for reconnect decisions, not evidence
          // of a confirmed Thread child/telemetry association. Confirmation is
          // tracked by the existing shared application's Probe route state.
          if (mode == 0) routes.remove(probeId) else routes.put(probeId, owner)
          preferences.edit().putString("routes", routes.toString()).apply()
          s.gatt.getService(service)?.getCharacteristic(debug)?.let { ch ->
            enqueue(s, OpType.CHARACTERISTIC_READ, ch.uuid, { s.gatt.readCharacteristic(ch) })
            handler.postDelayed({ if (sessions[probeId] === s) enqueue(s, OpType.CHARACTERISTIC_READ, ch.uuid, { s.gatt.readCharacteristic(ch) }) }, 8000)
          }
          promise.resolve(Arguments.createMap().apply {
            putBoolean("requestAccepted", true)
            putBoolean("confirmed", false)
            putString("transport", "ARC_BLE")
            putString("detail", "ARC route-set 0x52 written to Probe BLE Loader RX; route requested, awaiting Thread confirmation.")
          })
          if (mode == 1) { requested.add(owner); connect(owner, null, true) }
        }
      }
    }
    if (sessions[probeId]?.validated == true) routePromise.resolve(null) else connect(probeId, routePromise, mode == 0)
  }.let { Unit }
  override fun invalidate() {
    try { context.unregisterReceiver(bluetoothState) } catch (_: Exception) {}
    handler.post {
      requested.clear(); finishScan("ARC transport stopped.")
      sessions.values.toList().forEach { close(it, "ARC transport stopped.") }
      handler.removeCallbacksAndMessages(null)
    }
    super.invalidate()
  }
}
