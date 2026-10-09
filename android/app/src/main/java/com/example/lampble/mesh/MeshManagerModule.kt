package com.example.lampble.mesh

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import no.nordicsemi.android.mesh.MeshManagerApi
import no.nordicsemi.android.mesh.MeshManagerCallbacks
import no.nordicsemi.android.mesh.MeshNetwork
import no.nordicsemi.android.mesh.MeshProvisioningStatusCallbacks
import no.nordicsemi.android.mesh.MeshStatusCallbacks
import no.nordicsemi.android.mesh.provisionerstates.ProvisioningState
import no.nordicsemi.android.mesh.provisionerstates.UnprovisionedMeshNode
import no.nordicsemi.android.mesh.transport.ConfigAppKeyAdd
import no.nordicsemi.android.mesh.transport.ConfigAppKeyStatus
import no.nordicsemi.android.mesh.transport.ConfigCompositionDataGet
import no.nordicsemi.android.mesh.transport.ConfigCompositionDataStatus
import no.nordicsemi.android.mesh.transport.ConfigDefaultTtlGet
import no.nordicsemi.android.mesh.transport.ConfigDefaultTtlStatus
import no.nordicsemi.android.mesh.transport.ConfigModelAppBind
import no.nordicsemi.android.mesh.transport.ConfigModelAppStatus
import no.nordicsemi.android.mesh.transport.ConfigModelPublicationSet
import no.nordicsemi.android.mesh.transport.ProxyConfigSetFilterType
import no.nordicsemi.android.mesh.transport.ControlMessage
import no.nordicsemi.android.mesh.transport.MeshMessage
import no.nordicsemi.android.mesh.transport.ProvisionedMeshNode
import no.nordicsemi.android.mesh.transport.VendorModelMessageAcked
import no.nordicsemi.android.mesh.transport.VendorModelMessageStatus
import no.nordicsemi.android.mesh.transport.VendorModelMessageUnacked
import no.nordicsemi.android.mesh.utils.ProxyFilterType
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class MeshManagerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private var listenerCount = 0
  private var initialized = false
  private val meshManagerApi = MeshManagerApi(reactContext)
  private val initializing = AtomicBoolean(false)
  private var initPromise: Promise? = null
  private var pendingNetworkSetup = false
  private val handler = Handler(Looper.getMainLooper())
  private val unprovisionedDevices = mutableMapOf<String, UnprovisionedDevice>()
  private val unprovisionedServiceData = mutableMapOf<String, ByteArray>()
  private var scanCallback: ScanCallback? = null
  private var scanPromise: Promise? = null
  private var provisioningGatt: BluetoothGatt? = null
  private var provisioningDataIn: BluetoothGattCharacteristic? = null
  private var provisioningDataOut: BluetoothGattCharacteristic? = null
  private var provisioningNodeId: String? = null
  private var provisioningNodeUuid: UUID? = null
  private var provisioningOobHex: String? = null
  private var provisioningPromise: Promise? = null
  private var provisioningMeshNode: UnprovisionedMeshNode? = null
  private var pendingProvisioningNode: UnprovisionedMeshNode? = null
  private var pendingProvisioningStart = false
  private var provisioningDiscoverStarted = false
  private var provisioningAuthSent = false
  private var provisioningIdentifySent = false
  private var lastProvisioningWriteRaw: ByteArray? = null
  private val enableIdentifyBeforeProvisioning = false
  private var provisioningUseStaticOob = false
  private var provisioningStaticOobFallback = false
  private var capabilityProbeActive = false
  private var capabilityProbeStopPending = false
  private var capabilityProbePromise: Promise? = null
  private var capabilityProbeTimeout: Runnable? = null
  private var provisioningLinkOnly = false
  private var provisioningLinkPromise: Promise? = null
  private var provisioningNotificationsEnabled = false
  private var provisioningUnicastOverride: Int? = null
  private var provisioningMtuSize = 20
  private val provisioningWriteQueue = ArrayDeque<ByteArray>()
  private var provisioningWriteActive = false
  private var proxyMtuSize = 20
  private var proxyGatt: BluetoothGatt? = null
  private var proxyDataIn: BluetoothGattCharacteristic? = null
  private var proxyDataOut: BluetoothGattCharacteristic? = null
  private var activeNodeId: String? = null
  private var proxyConnectPromise: Promise? = null
  private var proxyDiscoverStarted = false
  private val pendingStatusPromises = mutableMapOf<String, Promise>()
  private val pendingStatusTimeouts = mutableMapOf<String, Runnable>()
  private val latestVendorStatusPayloads = mutableMapOf<String, ByteArray>()
  private val proxyWriteQueue = ArrayDeque<ByteArray>()
  private var proxyWriteActive = false

  // Post-provisioning config flow state
  private var setupProvisionedNode = false
  private var setupNodeAddress: Int? = null
  private var setupConfigInProgress = false
  private var pendingPostProvisioningConnectPromise: Promise? = null
  private var postProvisioningConnectTimeout: Runnable? = null

  private val provisioningDataInUuid = UUID.fromString("00002adb-0000-1000-8000-00805f9b34fb")
  private val provisioningDataOutUuid = UUID.fromString("00002adc-0000-1000-8000-00805f9b34fb")
  private val proxyDataInUuid = UUID.fromString("00002add-0000-1000-8000-00805f9b34fb")
  private val proxyDataOutUuid = UUID.fromString("00002ade-0000-1000-8000-00805f9b34fb")
  private val cccdUuid = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  private val openMeshStatusOpcode = 0x03
  private val openMeshLampConfigStatusOpcode = 0x31
  private val heartbeatCfgSetOpcode = 0x23
  private val defaultHeartbeatIntervalSeconds = 5

  // Must match app/src/mesh/index.ts
  private val vendorCompanyId = 0x1234
  private val vendorModelId = 0x0001
  private val vendorModelIdentifier = (vendorCompanyId shl 16) or (vendorModelId and 0xFFFF)

  override fun getName(): String = "MeshManager"

  override fun initialize() {
    super.initialize()
    reactContext.addLifecycleEventListener(this)
  }

  override fun onHostResume() {
    // no-op
  }

  override fun onHostPause() {
    // no-op
  }

  override fun onHostDestroy() {
    // no-op
  }

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = (listenerCount - count).coerceAtLeast(0)
  }

  @ReactMethod
  fun initialize(promise: Promise) {
    if (initialized) {
      promise.resolve(null)
      return
    }
    if (initializing.getAndSet(true)) {
      initPromise = promise
      return
    }

    initPromise = promise
    meshManagerApi.setMeshManagerCallbacks(meshManagerCallbacks)
    meshManagerApi.setProvisioningStatusCallbacks(provisioningCallbacks)
    meshManagerApi.setMeshStatusCallbacks(meshStatusCallbacks)

    try {
      meshManagerApi.loadMeshNetwork()
      pendingNetworkSetup = true
    } catch (err: Exception) {
      initializing.set(false)
      initPromise?.reject("INIT_FAILED", err.message, err)
      initPromise = null
    }
  }

  @ReactMethod
  fun scanUnprovisioned(promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (!ensureBluetoothEnabled(promise)) return
    if (!ensureScanPermission(promise)) return
    if (scanPromise != null) {
      promise.reject("SCAN_IN_PROGRESS", "Mesh scan already in progress.")
      return
    }
    val adapter = getBluetoothAdapter()
    if (adapter == null) {
      promise.reject("NO_BLUETOOTH", "Bluetooth adapter not available.")
      return
    }
    val scanner = adapter.bluetoothLeScanner
    if (scanner == null) {
      promise.reject("NO_SCANNER", "Bluetooth LE scanner not available.")
      return
    }

    unprovisionedDevices.clear()
    unprovisionedServiceData.clear()
    scanPromise = promise
    val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(MeshManagerApi.MESH_PROVISIONING_UUID)).build())
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()

    scanCallback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val device = result.device ?: return
        val record = result.scanRecord
        val serviceData = record?.getServiceData(ParcelUuid(MeshManagerApi.MESH_PROVISIONING_UUID))
        val uuid = serviceData?.let { parseProvisioningUuid(it) }
        val id = uuid?.toString() ?: device.address
        val name = device.name ?: record?.deviceName
        unprovisionedDevices[id] = UnprovisionedDevice(device, uuid, name)
        if (serviceData != null) {
          unprovisionedServiceData[device.address] = serviceData
        }
      }

      override fun onScanFailed(errorCode: Int) {
        stopScanInternal()
        scanPromise?.reject("SCAN_FAILED", "BLE scan failed with error $errorCode")
        scanPromise = null
      }
    }

    scanner.startScan(filters, settings, scanCallback)
    handler.postDelayed({
      stopScanInternal()
      val results = Arguments.createArray()
      unprovisionedDevices.values.forEach { deviceInfo ->
        val map = Arguments.createMap()
        val id = deviceInfo.uuid?.toString() ?: deviceInfo.device.address
        map.putString("id", id)
        map.putString("uuid", deviceInfo.uuid?.toString())
        map.putString("name", deviceInfo.name)
        results.pushMap(map)
      }
      scanPromise?.resolve(results)
      scanPromise = null
    }, 8000)
  }

  @ReactMethod
  fun identifyNode(nodeId: String, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    val deviceInfo = unprovisionedDevices[nodeId]
    val serviceData = deviceInfo?.device?.address?.let { unprovisionedServiceData[it] }
    val uuid = deviceInfo?.uuid
      ?: if (nodeId.contains(":")) {
        unprovisionedServiceData[nodeId]?.let { parseProvisioningUuid(it) }
      } else null
      ?: runCatching { UUID.fromString(nodeId) }.getOrNull()
    if (uuid == null) {
      promise.reject("NO_UUID", "Missing unprovisioned device UUID.")
      return
    }
    try {
      logDebug("identify request nodeId=$nodeId uuid=$uuid serviceData=${serviceData?.let { bytesToHex(it) } ?: "none"}")
      meshManagerApi.identifyNode(uuid, 5)
      val map = Arguments.createMap()
      map.putString("nodeId", nodeId)
      map.putBoolean("ok", true)
      emit("MeshIdentify", map)
      promise.resolve(null)
    } catch (err: Exception) {
      val map = Arguments.createMap()
      map.putString("nodeId", nodeId)
      map.putBoolean("ok", false)
      map.putString("error", err.message)
      emit("MeshIdentify", map)
      promise.reject("IDENTIFY_FAILED", err.message, err)
    }
  }

  @ReactMethod
  fun fetchCapabilities(nodeId: String, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (!ensureBluetoothEnabled(promise)) return
    if (!ensureConnectPermission(promise)) return
    if (provisioningPromise != null || capabilityProbeActive) {
      promise.reject("PROVISIONING", "Provisioning already in progress.")
      return
    }
    val adapter = getBluetoothAdapter()
    if (adapter == null) {
      promise.reject("NO_BLUETOOTH", "Bluetooth adapter not available.")
      return
    }
    val deviceInfo = unprovisionedDevices[nodeId]
    val device = deviceInfo?.device
      ?: if (nodeId.contains(":")) adapter.getRemoteDevice(nodeId) else null
    if (device == null) {
      promise.reject("NOT_FOUND", "Unprovisioned device not found. Rescan and retry.")
      return
    }
    val uuid = deviceInfo?.uuid
      ?: unprovisionedServiceData[device.address]?.let { parseProvisioningUuid(it) }
      ?: runCatching { UUID.fromString(nodeId) }.getOrNull()
    if (uuid == null) {
      promise.reject("NO_UUID", "Missing unprovisioned device UUID.")
      return
    }

    val reuseLink = provisioningGatt != null && provisioningNodeId == nodeId && provisioningLinkOnly
    if (!reuseLink) {
      closeProvisioningGatt()
    }
    provisioningNodeId = nodeId
    provisioningNodeUuid = uuid
    provisioningOobHex = null
    provisioningUseStaticOob = false
    provisioningStaticOobFallback = false
    provisioningLinkOnly = false
    pendingProvisioningNode = UnprovisionedMeshNode(uuid)
    capabilityProbeActive = true
    capabilityProbeStopPending = false
    capabilityProbePromise = promise
    capabilityProbeTimeout?.let { handler.removeCallbacks(it) }
    capabilityProbeTimeout = Runnable {
      if (!capabilityProbeActive) return@Runnable
      logDebug("capability probe timeout nodeId=$nodeId")
      capabilityProbeActive = false
      capabilityProbeStopPending = true
      capabilityProbePromise?.reject("CAPABILITY_TIMEOUT", "Capabilities not received in time")
      capabilityProbePromise = null
      closeProvisioningGatt()
    }
    handler.postDelayed(capabilityProbeTimeout!!, 8000)
    val serviceData = unprovisionedServiceData[device.address]
    logDebug("capability probe start nodeId=$nodeId uuid=$uuid addr=${device.address} serviceData=${serviceData?.let { bytesToHex(it) } ?: "none"}")
    if (provisioningGatt != null && provisioningNotificationsEnabled && pendingProvisioningNode != null) {
      safeStartProvisioning(pendingProvisioningNode!!)
    } else {
      provisioningGatt = connectGatt(device, provisioningGattCallback)
    }
  }

  @ReactMethod
  fun openProvisioningLink(nodeId: String, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (!ensureBluetoothEnabled(promise)) return
    if (!ensureConnectPermission(promise)) return
    if (provisioningPromise != null || capabilityProbeActive) {
      promise.reject("PROVISIONING", "Provisioning already in progress.")
      return
    }
    val adapter = getBluetoothAdapter()
    if (adapter == null) {
      promise.reject("NO_BLUETOOTH", "Bluetooth adapter not available.")
      return
    }
    val deviceInfo = unprovisionedDevices[nodeId]
    val device = deviceInfo?.device
      ?: if (nodeId.contains(":")) adapter.getRemoteDevice(nodeId) else null
    if (device == null) {
      promise.reject("NOT_FOUND", "Unprovisioned device not found. Rescan and retry.")
      return
    }
    val uuid = deviceInfo?.uuid
      ?: unprovisionedServiceData[device.address]?.let { parseProvisioningUuid(it) }
      ?: runCatching { UUID.fromString(nodeId) }.getOrNull()
    if (uuid == null) {
      promise.reject("NO_UUID", "Missing unprovisioned device UUID.")
      return
    }
    closeProvisioningGatt()
    provisioningNodeId = nodeId
    provisioningNodeUuid = uuid
    provisioningOobHex = null
    provisioningUseStaticOob = false
    provisioningStaticOobFallback = false
    provisioningLinkOnly = true
    provisioningLinkPromise = promise
    pendingProvisioningNode = UnprovisionedMeshNode(uuid)
    logDebug("provisioning link open nodeId=$nodeId uuid=$uuid addr=${device.address}")
    provisioningGatt = connectGatt(device, provisioningGattCallback)
  }

  @ReactMethod
  fun setProvisioningUnicastAddress(address: Int, promise: Promise) {
    try {
      provisioningUnicastOverride = address
      promise.resolve(null)
    } catch (err: Exception) {
      promise.reject("BAD_UNICAST", err.message, err)
    }
  }

  @ReactMethod
  fun setProvisioningUnicastAddressAuto(promise: Promise) {
    provisioningUnicastOverride = null
    promise.resolve(null)
  }

  @ReactMethod
  fun provision(nodeId: String, oobHex: String?, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (!ensureBluetoothEnabled(promise)) return
    if (!ensureConnectPermission(promise)) return
    if (provisioningPromise != null) {
      promise.reject("PROVISIONING", "Provisioning already in progress.")
      return
    }
    val adapter = getBluetoothAdapter()
    if (adapter == null) {
      promise.reject("NO_BLUETOOTH", "Bluetooth adapter not available.")
      return
    }
    val deviceInfo = unprovisionedDevices[nodeId]
    val device = deviceInfo?.device
      ?: if (nodeId.contains(":")) adapter.getRemoteDevice(nodeId) else null
    if (device == null) {
      promise.reject("NOT_FOUND", "Unprovisioned device not found. Rescan and retry.")
      return
    }
    val uuid = deviceInfo?.uuid
      ?: unprovisionedServiceData[device.address]?.let { parseProvisioningUuid(it) }
      ?: runCatching { UUID.fromString(nodeId) }.getOrNull()
    if (uuid != null) {
      if (provisioningGatt != null && provisioningNotificationsEnabled && provisioningNodeId == nodeId) {
        provisioningPromise = promise
        provisioningNodeId = nodeId
        provisioningNodeUuid = uuid
        provisioningOobHex = oobHex?.trim()?.lowercase()?.ifBlank { null }
        provisioningUseStaticOob = !provisioningOobHex.isNullOrBlank()
        provisioningStaticOobFallback = false
        provisioningLinkOnly = false
        pendingProvisioningNode = UnprovisionedMeshNode(uuid)
        logDebug("provisioning request (reuse link) nodeId=$nodeId uuid=$uuid oobLen=${provisioningOobHex?.length ?: 0}")
        startProvisioning(pendingProvisioningNode!!)
      } else {
        startProvisioning(device, nodeId, uuid, oobHex, promise)
      }
      return
    }

    val scanner = adapter.bluetoothLeScanner
    if (scanner == null) {
      logDebug("provisioning no scanner for nodeId=$nodeId")
      promise.reject("NO_SCANNER", "Bluetooth LE scanner not available.")
      return
    }
    if (!ensureScanPermission(promise)) return

    logDebug("provisioning uuid missing, scanning for service data address=${device.address}")
    val filters = listOf(
      ScanFilter.Builder()
        .setServiceUuid(ParcelUuid(MeshManagerApi.MESH_PROVISIONING_UUID))
        .setDeviceAddress(device.address)
        .build()
    )
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    var resolved = false
    var quickScanCallback: ScanCallback? = null
    val timeout = Runnable {
      if (resolved) return@Runnable
      resolved = true
      try {
        quickScanCallback?.let { scanner.stopScan(it) }
      } catch (_: Exception) {
        // ignore stop scan errors
      }
      logDebug("provisioning scan timeout for uuid address=${device.address}")
      promise.reject("NO_UUID", "Missing unprovisioned device UUID.")
    }
    quickScanCallback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        if (resolved) return
        val serviceData = result.scanRecord?.getServiceData(ParcelUuid(MeshManagerApi.MESH_PROVISIONING_UUID))
        val resolvedUuid = serviceData?.let { parseProvisioningUuid(it) }
        if (resolvedUuid == null) return
        resolved = true
        handler.removeCallbacks(timeout)
        try {
          scanner.stopScan(this)
        } catch (_: Exception) {
          // ignore stop scan errors
        }
        val name = deviceInfo?.name ?: device.name
        val updated = UnprovisionedDevice(device, resolvedUuid, name)
        unprovisionedDevices[resolvedUuid.toString()] = updated
        unprovisionedDevices[device.address] = updated
        unprovisionedServiceData[device.address] = serviceData
        startProvisioning(device, nodeId, resolvedUuid, oobHex, promise)
      }

      override fun onScanFailed(errorCode: Int) {
        if (resolved) return
        resolved = true
        handler.removeCallbacks(timeout)
        try {
          scanner.stopScan(this)
        } catch (_: Exception) {
          // ignore stop scan errors
        }
        promise.reject("SCAN_FAILED", "Provisioning scan failed with error $errorCode")
      }
    }
    scanner.startScan(filters, settings, quickScanCallback)
    handler.postDelayed(timeout, 3000)
  }

  @ReactMethod
  fun listNodes(promise: Promise) {
    val network = meshManagerApi.meshNetwork
    if (network == null) {
      promise.resolve(Arguments.createArray())
      return
    }
    val nodes = Arguments.createArray()
    val allNodes = network.nodes
    allNodes?.forEach { node ->
      if (node is ProvisionedMeshNode) {
        val map = Arguments.createMap()
        val uuid = node.uuid
        val id = uuid ?: node.unicastAddress.toString()
        map.putString("id", id)
        map.putString("uuid", uuid)
        map.putString("name", node.nodeName)
        map.putString("abbreviation", "LP")
        map.putString("color", "#22c55e")
        map.putBoolean("provisioned", true)
        nodes.pushMap(map)
      }
    }
    promise.resolve(nodes)
  }

  @ReactMethod
  fun connectProxy(promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (!ensureBluetoothEnabled(promise)) return
    if (!ensureConnectPermission(promise)) return
    connectProxyInternal(null, promise)
  }

  @ReactMethod
  fun disconnectProxy(promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    val previous = activeNodeId
    closeProxyGatt()
    emitConnectionChange(previous, false, emitAll = previous == null)
    promise.resolve(null)
  }

  @ReactMethod
  fun connectNode(nodeId: String, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (!ensureBluetoothEnabled(promise)) return
    if (!ensureConnectPermission(promise)) return
    connectProxyInternal(nodeId, promise)
  }

  @ReactMethod
  fun disconnectNode(nodeId: String, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    if (activeNodeId == null || activeNodeId == nodeId) {
      closeProxyGatt()
      emitConnectionChange(nodeId, false, emitAll = false)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun sendVendorMessage(params: com.facebook.react.bridge.ReadableMap, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    val network = meshManagerApi.meshNetwork
    if (network == null) {
      promise.reject("NO_NETWORK", "Mesh network not initialized.")
      return
    }
    val appKey = ensureAppKey(network)
    if (appKey == null) {
      promise.reject("NO_APPKEY", "Mesh app key not available.")
      return
    }
    val nodeId = params.getString("nodeId") ?: run {
      promise.reject("BAD_PARAMS", "nodeId is required")
      return
    }
    val companyId = params.getInt("companyId")
    val modelId = params.getInt("modelId")
    val opcode = params.getInt("opcode")
    val responseExpected = params.getBoolean("responseExpected")
    val payloadBase64 = params.getString("payloadBase64")
    val payload = payloadBase64?.let { Base64.decode(it, Base64.DEFAULT) } ?: ByteArray(0)
    logDebug(
      "vendor tx request node=$nodeId opcode=0x${Integer.toHexString(opcode)} responseExpected=$responseExpected len=${payload.size}"
    )

    val dst = resolveNodeAddress(network, nodeId)
    if (dst == null) {
      promise.reject("NODE_NOT_FOUND", "Mesh node not found for $nodeId")
      return
    }
    if (proxyGatt == null || proxyDataIn == null) {
      promise.reject("NOT_CONNECTED", "Mesh proxy not connected.")
      return
    }

    val modelIdentifier = (companyId shl 16) or (modelId and 0xFFFF)
    val message: MeshMessage = if (responseExpected) {
      VendorModelMessageAcked(appKey, modelIdentifier, companyId, opcode, payload)
    } else {
      VendorModelMessageUnacked(appKey, modelIdentifier, companyId, opcode, payload)
    }
    try {
      meshManagerApi.createMeshPdu(dst, message)
      logDebug(
        "vendor tx queued dst=0x${String.format("%04x", dst)} opcode=0x${Integer.toHexString(opcode)} len=${payload.size} acked=$responseExpected"
      )
      promise.resolve(null)
    } catch (err: Exception) {
      logDebug(
        "vendor tx failed dst=0x${String.format("%04x", dst)} opcode=0x${Integer.toHexString(opcode)} len=${payload.size} error=${err.message}"
      )
      promise.reject("SEND_FAILED", err.message, err)
    }
  }

  @ReactMethod
  fun readVendorStatus(params: com.facebook.react.bridge.ReadableMap, promise: Promise) {
    if (!initialized) {
      promise.reject("NOT_READY", "MeshManager.initialize must be called first.")
      return
    }
    val network = meshManagerApi.meshNetwork
    if (network == null) {
      promise.reject("NO_NETWORK", "Mesh network not initialized.")
      return
    }
    val appKey = ensureAppKey(network)
    if (appKey == null) {
      promise.reject("NO_APPKEY", "Mesh app key not available.")
      return
    }
    val nodeId = params.getString("nodeId") ?: run {
      promise.reject("BAD_PARAMS", "nodeId is required")
      return
    }
    val companyId = params.getInt("companyId")
    val modelId = params.getInt("modelId")
    val opcode = params.getInt("opcode")
    val key = "$nodeId:$opcode"

    latestVendorStatusPayloads.remove(key)?.let { payload ->
      val result = Arguments.createMap()
      result.putString("payloadBase64", Base64.encodeToString(payload, Base64.NO_WRAP))
      promise.resolve(result)
      return
    }

    if (pendingStatusPromises.containsKey(key)) {
      promise.reject("IN_PROGRESS", "Status request already in progress.")
      return
    }

    val dst = resolveNodeAddress(network, nodeId)
    if (dst == null) {
      promise.reject("NODE_NOT_FOUND", "Mesh node not found for $nodeId")
      return
    }
    if (proxyGatt == null || proxyDataIn == null) {
      promise.reject("NOT_CONNECTED", "Mesh proxy not connected.")
      return
    }

    pendingStatusPromises[key] = promise
    val timeout = Runnable {
      pendingStatusPromises.remove(key)?.reject("TIMEOUT", "Mesh status request timed out.")
      pendingStatusTimeouts.remove(key)
    }
    pendingStatusTimeouts[key] = timeout
    handler.postDelayed(timeout, 5000)

    logDebug(
      "readVendorStatus waiting node=$nodeId opcode=0x${Integer.toHexString(opcode)}"
    )
  }

  private fun configureNetwork(network: MeshNetwork) {
    if (network.meshName.isNullOrBlank()) {
      network.setMeshName("ARC Mesh")
    }
    if (network.provisioners.isEmpty()) {
      try {
        val provisioner = network.createProvisioner("ARC Provisioner")
        provisioner?.setLastSelected(true)
      } catch (_: Exception) {
        // ignore provisioning defaults
      }
    }
    if (network.selectedProvisioner == null && network.provisioners.isNotEmpty()) {
      network.provisioners.forEach { it.setLastSelected(false) }
      network.provisioners.firstOrNull()?.setLastSelected(true)
    }
    if (network.netKeys.isEmpty()) {
      try {
        network.createNetworkKey()
      } catch (_: Exception) {
        // ignore key creation errors
      }
    }
    if (network.appKeys.isEmpty()) {
      try {
        val appKey = network.createAppKey()
        network.addAppKey(appKey)
      } catch (_: Exception) {
        // ignore key creation errors
      }
    }
  }

  private fun ensureAppKey(network: MeshNetwork) = network.appKeys.firstOrNull() ?: run {
    try {
      val appKey = network.createAppKey()
      network.addAppKey(appKey)
      appKey
    } catch (_: Exception) {
      null
    }
  }

  private fun finalizeInitialization(network: MeshNetwork?) {
    if (network == null) {
      initializing.set(false)
      initPromise?.reject("INIT_FAILED", "Mesh network failed to load.")
      initPromise = null
      return
    }

    configureNetwork(network)
    initialized = true
    initializing.set(false)
    initPromise?.resolve(null)
    initPromise = null
  }

  private val meshManagerCallbacks = object : MeshManagerCallbacks {
    override fun onNetworkLoaded(meshNetwork: MeshNetwork) {
      finalizeInitialization(meshNetwork)
    }

    override fun onNetworkUpdated(meshNetwork: MeshNetwork) {
      if (pendingNetworkSetup && !initialized) {
        pendingNetworkSetup = false
        finalizeInitialization(meshNetwork)
      }
    }

    override fun onNetworkLoadFailed(error: String) {
      try {
        meshManagerApi.createMeshNetwork()
        val network = meshManagerApi.meshNetwork
        finalizeInitialization(network)
      } catch (err: Exception) {
        initializing.set(false)
        initPromise?.reject("INIT_FAILED", error, err)
        initPromise = null
      }
    }

    override fun onNetworkImported(meshNetwork: MeshNetwork) {
      finalizeInitialization(meshNetwork)
    }

    override fun onNetworkImportFailed(error: String) {
      initializing.set(false)
      initPromise?.reject("INIT_FAILED", error)
      initPromise = null
    }

    override fun sendProvisioningPdu(node: UnprovisionedMeshNode, pdu: ByteArray) {
      writeProvisioningPdu(pdu)
    }

    override fun onMeshPduCreated(pdu: ByteArray) {
      writeProxyPdu(pdu)
    }

    override fun getMtu(): Int = if (proxyGatt != null) proxyMtuSize else provisioningMtuSize
  }

  private val provisioningCallbacks = object : MeshProvisioningStatusCallbacks {
    override fun onProvisioningStateChanged(
      unprovisionedMeshNode: UnprovisionedMeshNode,
      states: ProvisioningState.States,
      data: ByteArray?
    ) {
      logDebug("provisioning state=$states")
      provisioningMeshNode = unprovisionedMeshNode
      if (data != null && data.isNotEmpty()) {
        logDebug("provisioning state data=${bytesToHex(data)}")
      }
      val stateMap = Arguments.createMap()
      stateMap.putString("state", states.name)
      provisioningNodeId?.let { stateMap.putString("nodeId", it) }
      emit("MeshProvisioningState", stateMap)
      if (states.name == "PROVISIONING_CAPABILITIES" || states.name == "PROVISIONING_CAPABILITIES_STATE") {
        emitProvisioningCapabilities(unprovisionedMeshNode)
        if (capabilityProbeActive) {
          capabilityProbeActive = false
          capabilityProbeStopPending = true
          capabilityProbeTimeout?.let { handler.removeCallbacks(it) }
          capabilityProbePromise?.resolve(null)
          capabilityProbePromise = null
          handler.postDelayed({ closeProvisioningGatt() }, 150)
          return
        }
      }
      val oobHex = provisioningOobHex
      val stateName = states.name
      if (oobHex.isNullOrBlank()) {
        if (stateName == "PROVISIONING_AUTHENTICATION_STATIC_OOB_WAITING") {
          logDebug("provisioning auth waiting but no static OOB provided")
        }
        return
      }
      if (provisioningAuthSent) return
      if (
        stateName == "PROVISIONING_CAPABILITIES_STATE" ||
        stateName == "PROVISIONING_CAPABILITIES" ||
        stateName == "PROVISIONING_AUTHENTICATION_STATIC_OOB_WAITING"
      ) {
        try {
          meshManagerApi.setProvisioningAuthentication(oobHex)
          provisioningAuthSent = true
          logDebug("provisioning auth set")
          val authMap = Arguments.createMap()
          provisioningNodeId?.let { authMap.putString("nodeId", it) }
          emit("MeshProvisioningAuth", authMap)
        } catch (err: Exception) {
          logDebug("provisioning auth error: ${err.message}")
        }
      }
    }

    override fun onProvisioningFailed(
      unprovisionedMeshNode: UnprovisionedMeshNode,
      states: ProvisioningState.States,
      data: ByteArray?
    ) {
      provisioningMeshNode = unprovisionedMeshNode
      if (data != null && data.isNotEmpty()) {
        logDebug("provisioning failed data=${bytesToHex(data)}")
      }
      val promise = provisioningPromise
      provisioningPromise = null
      if (capabilityProbePromise != null) {
        capabilityProbeTimeout?.let { handler.removeCallbacks(it) }
        capabilityProbePromise?.reject("PROVISION_FAILED", "Provisioning failed at $states")
        capabilityProbePromise = null
      }
      closeProvisioningGatt()
      promise?.reject("PROVISION_FAILED", "Provisioning failed at $states")
    }

    override fun onProvisioningCompleted(
      provisionedMeshNode: ProvisionedMeshNode,
      states: ProvisioningState.States,
      data: ByteArray?
    ) {
      if (data != null && data.isNotEmpty()) {
        logDebug("provisioning completed data=${bytesToHex(data)}")
      }
      val unicast = provisionedMeshNode.unicastAddress
      logDebug("provisioning completed unicast=0x${String.format("%04x", unicast)}")
      val map = Arguments.createMap()
      provisioningNodeId?.let { map.putString("nodeId", it) }
      map.putInt("unicastAddress", unicast)
      map.putString("unicastHex", String.format("0x%04x", unicast))
      emit("MeshProvisioned", map)
      val promise = provisioningPromise
      provisioningPromise = null
      setupProvisionedNode = true
      setupNodeAddress = provisionedMeshNode.unicastAddress
      closeProvisioningGatt()
      promise?.resolve(null)
    }
  }

  private val meshStatusCallbacks = object : MeshStatusCallbacks {
    override fun onTransactionFailed(dst: Int, hasIncompleteTimerExpired: Boolean) {
      // no-op
    }

    override fun onUnknownPduReceived(src: Int, pdu: ByteArray) {
      // no-op
    }

    override fun onBlockAcknowledgementProcessed(src: Int, controlMessage: ControlMessage) {
      // no-op
    }

    override fun onBlockAcknowledgementReceived(src: Int, controlMessage: ControlMessage) {
      // no-op
    }

    override fun onHeartbeatMessageReceived(src: Int, controlMessage: ControlMessage) {
      // no-op
    }

    override fun onMeshMessageProcessed(dst: Int, meshMessage: MeshMessage) {
      // no-op
    }

    override fun onMeshMessageReceived(dst: Int, meshMessage: MeshMessage) {
      if (meshMessage is ConfigCompositionDataStatus) {
        if (setupProvisionedNode) {
          setupNodeAddress = meshMessage.src
          sendDefaultTtlGet(meshMessage.src)
        }
      } else if (meshMessage is ConfigDefaultTtlStatus) {
        if (setupProvisionedNode) {
          setupNodeAddress = meshMessage.src
          sendAppKeyAdd(meshMessage.src)
        }
      } else if (meshMessage is ConfigAppKeyStatus) {
        if (setupProvisionedNode) {
          setupNodeAddress = meshMessage.src
          if (meshMessage.isSuccessful) {
            sendVendorModelAppBind(meshMessage.src)
          } else {
            logDebug("config app key add failed status=${meshMessage.statusCodeName}")
            setupProvisionedNode = false
            setupConfigInProgress = false
            finishPostProvisioningConnect()
          }
        }
      } else if (meshMessage is ConfigModelAppStatus) {
        if (setupProvisionedNode) {
          if (meshMessage.isSuccessful) {
            logDebug(
              "config model app bind ok element=0x${String.format("%04x", meshMessage.elementAddress)} model=0x${Integer.toHexString(meshMessage.modelIdentifier)} keyIndex=${meshMessage.appKeyIndex}"
            )
            setupNodeAddress = meshMessage.src
            sendVendorModelPublicationSet(meshMessage.src, meshMessage.appKeyIndex)
            sendHeartbeatCfgSet(meshMessage.src)
          } else {
            logDebug("config model app bind failed status=${meshMessage.statusCodeName}")
          }
          setupProvisionedNode = false
          setupConfigInProgress = false
          finishPostProvisioningConnect()
        }
      }
      if (meshMessage is VendorModelMessageStatus) {
        val companyId = meshMessage.companyIdentifier
        val modelId = meshMessage.modelIdentifier
        val transportOpcode = meshMessage.opCode
        val payload = meshMessage.parameters
        val src = meshMessage.src
        val payloadLen = payload?.size ?: 0
        val payloadOpcode = if (payloadLen > 0) payload?.get(0)?.toInt()?.and(0xFF) else null
        logDebug(
          "vendor status src=0x${String.format("%04x", src)} transportOpcode=0x${Integer.toHexString(transportOpcode)} payloadOpcode=0x${payloadOpcode?.let { Integer.toHexString(it) } ?: "-"} company=0x${String.format("%04x", companyId)} model=0x${Integer.toHexString(modelId)} len=$payloadLen"
        )
        val nodeId = resolveNodeId(src)
        if (nodeId != null && payload != null) {
          val transportKey = "$nodeId:$transportOpcode"
          latestVendorStatusPayloads[transportKey] = payload

          payloadOpcode?.let { appOpcode ->
            val payloadKey = "$nodeId:$appOpcode"
            latestVendorStatusPayloads[payloadKey] = payload
          }

          // Schedule writes/reads resolve from a full 0x31 configuration echo,
          // not a normal 0x03 telemetry status frame.  Forward both frames so
          // the JS config waiter can observe the acknowledgement.
          if (payloadOpcode == openMeshStatusOpcode || payloadOpcode == openMeshLampConfigStatusOpcode) {
            val map = Arguments.createMap()
            map.putString("nodeId", nodeId)
            map.putString("payloadBase64", Base64.encodeToString(payload, Base64.NO_WRAP))
            emit("MeshTelemetry", map)
          }

          var resolved = false
          pendingStatusPromises.remove(transportKey)?.let { pendingPromise ->
            pendingStatusTimeouts.remove(transportKey)?.let { handler.removeCallbacks(it) }
            val result = Arguments.createMap()
            result.putString("payloadBase64", Base64.encodeToString(payload, Base64.NO_WRAP))
            pendingPromise.resolve(result)
            resolved = true
          }

          if (!resolved && payloadOpcode != null) {
            val payloadKey = "$nodeId:$payloadOpcode"
            pendingStatusPromises.remove(payloadKey)?.let { pendingPromise ->
              pendingStatusTimeouts.remove(payloadKey)?.let { handler.removeCallbacks(it) }
              val result = Arguments.createMap()
              result.putString("payloadBase64", Base64.encodeToString(payload, Base64.NO_WRAP))
              pendingPromise.resolve(result)
            }
          }
        }
      }
    }

    override fun onMessageDecryptionFailed(errorMessage: String, pdu: String) {
      // no-op
    }
  }

  private fun emit(eventName: String, payload: com.facebook.react.bridge.WritableMap) {
    if (listenerCount <= 0) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun emitProvisioningCapabilities(node: UnprovisionedMeshNode) {
    val capabilities = node.provisioningCapabilities ?: return
    val map = Arguments.createMap()
    provisioningNodeId?.let { map.putString("nodeId", it) }
    map.putInt("numberOfElements", capabilities.numberOfElements.toInt())
    map.putBoolean("publicKeyAvailable", capabilities.isPublicKeyInformationAvailable)
    map.putBoolean("staticOobAvailable", capabilities.isStaticOOBInformationAvailable)
    map.putInt("outputOobSize", capabilities.outputOOBSize.toInt())
    map.putInt("inputOobSize", capabilities.inputOOBSize.toInt())

    val algorithms = Arguments.createArray()
    capabilities.supportedAlgorithmTypes.forEach { algorithms.pushString(it.name) }
    map.putArray("algorithms", algorithms)

    val outputActions = Arguments.createArray()
    capabilities.supportedOutputOOBActions.forEach { outputActions.pushString(it.name) }
    map.putArray("outputOobActions", outputActions)

    val inputActions = Arguments.createArray()
    capabilities.supportedInputOOBActions.forEach { inputActions.pushString(it.name) }
    map.putArray("inputOobActions", inputActions)

    emit("MeshProvisioningCapabilities", map)
  }

  private fun emitProvisioningDebug(message: String) {
    val map = Arguments.createMap()
    provisioningNodeId?.let { map.putString("nodeId", it) }
    map.putString("message", message)
    emit("MeshProvisioningDebug", map)
  }

  private fun logDebug(message: String) {
    Log.d("MeshManager", message)
  }

  private fun bytesToHex(data: ByteArray): String {
    val sb = StringBuilder(data.size * 2)
    data.forEach { byte ->
      sb.append(String.format("%02x", byte))
    }
    return sb.toString()
  }

  private fun normalizeProvisioningPdu(data: ByteArray): Pair<ByteArray, Boolean> {
    if (data.size <= 1) return Pair(data, false)
    val first = data[0].toInt() and 0xFF
    val second = data[1].toInt() and 0xFF
    val looksLikeProxyProvisioning = first == 0x03 && second <= 0x09
    return if (looksLikeProxyProvisioning) {
      Pair(data.copyOfRange(1, data.size), true)
    } else {
      Pair(data, false)
    }
  }

  private fun getBluetoothAdapter(): BluetoothAdapter? {
    val manager = reactContext.getSystemService(BluetoothManager::class.java)
    return manager?.adapter
  }

  private fun ensureBluetoothEnabled(promise: Promise): Boolean {
    val adapter = getBluetoothAdapter()
    if (adapter == null) {
      promise.reject("NO_BLUETOOTH", "Bluetooth adapter not available.")
      return false
    }
    if (!adapter.isEnabled) {
      promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled.")
      return false
    }
    return true
  }

  private fun ensureScanPermission(promise: Promise): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    val granted = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.reject("NO_PERMISSION", "BLUETOOTH_SCAN permission not granted.")
    }
    return granted
  }

  private fun ensureConnectPermission(promise: Promise): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    val granted = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.reject("NO_PERMISSION", "BLUETOOTH_CONNECT permission not granted.")
    }
    return granted
  }

  @SuppressLint("MissingPermission")
  private fun connectGatt(device: BluetoothDevice, callback: BluetoothGattCallback): BluetoothGatt {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      device.connectGatt(reactContext, false, callback, BluetoothDevice.TRANSPORT_LE)
    } else {
      device.connectGatt(reactContext, false, callback)
    }
  }

  private fun stopScanInternal() {
    val adapter = getBluetoothAdapter() ?: return
    val scanner = adapter.bluetoothLeScanner ?: return
    scanCallback?.let { scanner.stopScan(it) }
    scanCallback = null
  }

  private fun bytesToUuid(data: ByteArray): UUID? {
    if (data.size < 16) return null
    val buffer = ByteBuffer.wrap(data.copyOfRange(0, 16)).order(ByteOrder.BIG_ENDIAN)
    val high = buffer.long
    val low = buffer.long
    return UUID(high, low)
  }

  private fun parseProvisioningUuid(serviceData: ByteArray): UUID? {
    return try {
      meshManagerApi.getDeviceUuid(serviceData)
    } catch (_: Exception) {
      bytesToUuid(serviceData)
    }
  }

  private fun startProvisioning(
    device: BluetoothDevice,
    nodeId: String,
    uuid: UUID,
    oobHex: String?,
    promise: Promise
  ) {
    closeProvisioningGatt()
    provisioningPromise = promise
    provisioningNodeId = nodeId
    provisioningNodeUuid = uuid
    provisioningOobHex = oobHex?.trim()?.lowercase()?.ifBlank { null }
    provisioningUseStaticOob = !provisioningOobHex.isNullOrBlank()
    provisioningStaticOobFallback = false
    logDebug("provisioning request nodeId=$nodeId uuid=$uuid oobLen=${provisioningOobHex?.length ?: 0}")
    provisioningGatt = connectGatt(device, provisioningGattCallback)
  }

  private fun enableNotifications(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic): Boolean {
    gatt.setCharacteristicNotification(characteristic, true)
    val descriptor = characteristic.getDescriptor(cccdUuid) ?: return false
    val supportsNotify = (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0
    val supportsIndicate = (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
    val cccdValue = if (supportsNotify) {
      BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    } else if (supportsIndicate) {
      BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
    } else {
      BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    }
    return if (Build.VERSION.SDK_INT >= 33) {
      gatt.writeDescriptor(descriptor, cccdValue)
      true
    } else {
      descriptor.value = cccdValue
      gatt.writeDescriptor(descriptor)
    }
  }

  private fun closeProvisioningGatt() {
    provisioningGatt?.close()
    provisioningGatt = null
    provisioningDataIn = null
    provisioningDataOut = null
    provisioningNodeId = null
    provisioningNodeUuid = null
    provisioningAuthSent = false
    provisioningIdentifySent = false
    provisioningUseStaticOob = false
    provisioningStaticOobFallback = false
    provisioningMeshNode = null
    capabilityProbeActive = false
    capabilityProbeStopPending = false
    capabilityProbePromise = null
    capabilityProbeTimeout?.let { handler.removeCallbacks(it) }
    capabilityProbeTimeout = null
    provisioningLinkOnly = false
    provisioningLinkPromise = null
    provisioningNotificationsEnabled = false
    provisioningWriteQueue.clear()
    provisioningWriteActive = false
    pendingProvisioningNode = null
    pendingProvisioningStart = false
    provisioningDiscoverStarted = false
  }

  private fun closeProxyGatt() {
    proxyGatt?.close()
    proxyGatt = null
    proxyDataIn = null
    proxyDataOut = null
    activeNodeId = null
    proxyDiscoverStarted = false
    proxyWriteQueue.clear()
    proxyWriteActive = false
  }

  private fun writeProvisioningPdu(pdu: ByteArray) {
    if (capabilityProbeStopPending) return
    lastProvisioningWriteRaw = pdu.copyOf()
    logDebug("provisioning write pdu=${bytesToHex(pdu)}")
    val map = Arguments.createMap()
    provisioningNodeId?.let { map.putString("nodeId", it) }
    map.putString("direction", "tx")
    map.putString("hex", bytesToHex(pdu))
    emit("MeshProvisioningPdu", map)
    enqueueProvisioningChunks(pdu)
  }

  private fun enqueueProvisioningChunks(pdu: ByteArray) {
    val mtu = provisioningMtuSize.coerceAtLeast(1)
    var offset = 0
    while (offset < pdu.size) {
      val end = (offset + mtu).coerceAtMost(pdu.size)
      provisioningWriteQueue.addLast(pdu.copyOfRange(offset, end))
      offset = end
    }
    if (!provisioningWriteActive) {
      provisioningWriteActive = true
      writeNextProvisioningChunk()
    }
  }

  private fun writeNextProvisioningChunk() {
    val gatt = provisioningGatt ?: run {
      provisioningWriteQueue.clear()
      provisioningWriteActive = false
      return
    }
    val characteristic = provisioningDataIn ?: run {
      provisioningWriteQueue.clear()
      provisioningWriteActive = false
      return
    }
    val chunk = provisioningWriteQueue.removeFirstOrNull()
    if (chunk == null) {
      provisioningWriteActive = false
      return
    }
    characteristic.value = chunk
    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
    val wrote = gatt.writeCharacteristic(characteristic)
    if (wrote) {
      meshManagerApi.handleWriteCallbacks(provisioningMtuSize, chunk)
      handler.postDelayed({ writeNextProvisioningChunk() }, 10)
    } else {
      logDebug("provisioning write failed to enqueue")
      provisioningWriteQueue.clear()
      provisioningWriteActive = false
    }
  }

  private fun writeProxyPdu(pdu: ByteArray) {
    enqueueProxyChunks(pdu)
  }

  private fun enqueueProxyChunks(pdu: ByteArray) {
    val mtu = proxyMtuSize.coerceAtLeast(1)
    var offset = 0
    while (offset < pdu.size) {
      val end = (offset + mtu).coerceAtMost(pdu.size)
      proxyWriteQueue.addLast(pdu.copyOfRange(offset, end))
      offset = end
    }
    if (!proxyWriteActive) {
      proxyWriteActive = true
      writeNextProxyChunk()
    }
  }

  private fun writeNextProxyChunk() {
    val gatt = proxyGatt ?: run {
      proxyWriteQueue.clear()
      proxyWriteActive = false
      return
    }
    val characteristic = proxyDataIn ?: run {
      proxyWriteQueue.clear()
      proxyWriteActive = false
      return
    }
    val chunk = proxyWriteQueue.removeFirstOrNull()
    if (chunk == null) {
      proxyWriteActive = false
      return
    }
    characteristic.value = chunk
    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    val wrote = gatt.writeCharacteristic(characteristic)
    if (!wrote) {
      logDebug("proxy write failed to enqueue")
      proxyWriteQueue.clear()
      proxyWriteActive = false
    }
  }

  private fun handleProvisioningNotification(data: ByteArray) {
    logDebug("provisioning notify pdu=${bytesToHex(data)}")
    val map = Arguments.createMap()
    provisioningNodeId?.let { map.putString("nodeId", it) }
    map.putString("direction", "rx")
    map.putString("hex", bytesToHex(data))
    emit("MeshProvisioningPdu", map)
    try {
      meshManagerApi.handleNotifications(provisioningMtuSize, data)
    } catch (err: Exception) {
      logDebug("provisioning notify handle error: ${err.message}")
    }
  }

  private fun handleProxyNotification(data: ByteArray) {
    meshManagerApi.handleNotifications(proxyMtuSize, data)
  }

  private fun startProvisioning(unprovNode: UnprovisionedMeshNode) {
    val oobHex = provisioningOobHex
    logDebug("provisioning start oobHex=${oobHex?.length ?: 0}")
    val uuid = provisioningNodeUuid
    var didIdentify = false
    if (enableIdentifyBeforeProvisioning && uuid != null && !provisioningIdentifySent) {
      try {
        meshManagerApi.identifyNode(uuid, 5)
        didIdentify = true
        provisioningIdentifySent = true
        logDebug("provisioning identify sent")
        val map = Arguments.createMap()
        provisioningNodeId?.let { map.putString("nodeId", it) }
        map.putBoolean("ok", true)
        emit("MeshProvisioningIdentify", map)
      } catch (err: Exception) {
        logDebug("provisioning identify error: ${err.message}")
        val map = Arguments.createMap()
        provisioningNodeId?.let { map.putString("nodeId", it) }
        map.putBoolean("ok", false)
        map.putString("error", err.message)
        emit("MeshProvisioningIdentify", map)
      }
    }
    if (didIdentify) {
      handler.postDelayed({
        safeStartProvisioning(unprovNode)
      }, 300)
    } else {
      safeStartProvisioning(unprovNode)
    }
  }

  private fun safeStartProvisioning(unprovNode: UnprovisionedMeshNode) {
    try {
      val effectiveNode = provisioningMeshNode ?: unprovNode
      logDebug(
        "provisioning start invoke node=${provisioningNodeId} uuid=${provisioningNodeUuid} cap=${effectiveNode.provisioningCapabilities != null}"
      )
      emitProvisioningDebug("provisioning start cap=${effectiveNode.provisioningCapabilities != null}")
      try {
        val network = meshManagerApi.meshNetwork
        if (network != null) {
          val provisioner = network.selectedProvisioner
          val elements = effectiveNode.provisioningCapabilities?.numberOfElements?.toInt() ?: 1
          val unicast = provisioningUnicastOverride
            ?: network.nextAvailableUnicastAddress(elements, provisioner)
          network.assignUnicastAddress(unicast)
          logDebug("provisioning unicast assigned 0x${String.format("%04x", unicast)}")
          val map = Arguments.createMap()
          provisioningNodeId?.let { map.putString("nodeId", it) }
          map.putInt("unicastAddress", unicast)
          map.putString("unicastHex", String.format("0x%04x", unicast))
          map.putBoolean("auto", provisioningUnicastOverride == null)
          emit("MeshProvisioningUnicast", map)
        }
      } catch (err: Exception) {
        logDebug("provisioning unicast assign failed: ${err.message}")
      }
      if (capabilityProbeActive) {
        meshManagerApi.startProvisioning(effectiveNode)
      } else if (provisioningUseStaticOob && effectiveNode.provisioningCapabilities != null) {
        try {
          meshManagerApi.startProvisioningWithStaticOOB(effectiveNode)
        } catch (innerErr: Exception) {
          provisioningStaticOobFallback = true
          logDebug("provisioning static oob failed, fallback to standard: ${innerErr.message}")
          meshManagerApi.startProvisioning(effectiveNode)
        }
      } else {
        meshManagerApi.startProvisioning(effectiveNode)
      }
    } catch (err: Exception) {
      logDebug("provisioning start failed: ${err.message}")
      provisioningPromise?.reject("PROVISION_FAILED", err.message, err)
    }
  }

  private fun resolveNodeAddress(network: MeshNetwork, nodeId: String): Int? {
    val node = network.getNode(nodeId)
    if (node is ProvisionedMeshNode) return node.unicastAddress
    val asInt = nodeId.toIntOrNull()
    if (asInt != null) return asInt
    return null
  }

  private fun resolveNodeId(src: Int): String? {
    val network = meshManagerApi.meshNetwork ?: return null
    val node = network.getNode(src)
    if (node is ProvisionedMeshNode) {
      return node.uuid ?: src.toString()
    }
    return src.toString()
  }

  private fun schedulePostProvisioningConfig() {
    val network = meshManagerApi.meshNetwork ?: return
    val address = setupNodeAddress ?: return
    setupConfigInProgress = true
    handler.postDelayed({
      try {
        val compositionDataGet = ConfigCompositionDataGet()
        meshManagerApi.createMeshPdu(address, compositionDataGet)
        logDebug("config composition get sent addr=0x${String.format("%04x", address)}")
        emitProvisioningDebug("config composition get sent")
      } catch (err: Exception) {
        logDebug("config composition get failed: ${err.message}")
        emitProvisioningDebug("config composition get failed")
        setupConfigInProgress = false
      }
    }, 2000)
  }

  private fun sendDefaultTtlGet(address: Int) {
    handler.postDelayed({
      try {
        val configDefaultTtlGet = ConfigDefaultTtlGet()
        meshManagerApi.createMeshPdu(address, configDefaultTtlGet)
        logDebug("config default ttl get sent addr=0x${String.format("%04x", address)}")
        emitProvisioningDebug("config default ttl get sent")
      } catch (err: Exception) {
        logDebug("config default ttl get failed: ${err.message}")
        emitProvisioningDebug("config default ttl get failed")
      }
    }, 500)
  }

  private fun sendAppKeyAdd(address: Int) {
    val network = meshManagerApi.meshNetwork ?: return
    val appKey = ensureAppKey(network) ?: run {
      setupConfigInProgress = false
      return
    }
    val netKey = network.netKeys.getOrNull(appKey.boundNetKeyIndex) ?: run {
      setupConfigInProgress = false
      return
    }
    handler.postDelayed({
      try {
        val configAppKeyAdd = ConfigAppKeyAdd(netKey, appKey)
        meshManagerApi.createMeshPdu(address, configAppKeyAdd)
        logDebug("config app key add sent addr=0x${String.format("%04x", address)}")
        emitProvisioningDebug("config app key add sent")
      } catch (err: Exception) {
        logDebug("config app key add failed: ${err.message}")
        emitProvisioningDebug("config app key add failed")
        setupConfigInProgress = false
      }
    }, 1500)
  }

  private fun sendVendorModelAppBind(address: Int) {
    val network = meshManagerApi.meshNetwork ?: run {
      setupProvisionedNode = false
      setupConfigInProgress = false
      finishPostProvisioningConnect()
      return
    }
    val appKey = ensureAppKey(network) ?: run {
      setupProvisionedNode = false
      setupConfigInProgress = false
      finishPostProvisioningConnect()
      return
    }
    val appKeyIndex = appKey.keyIndex
    val elementAddress = address
    handler.postDelayed({
      try {
        val bind = ConfigModelAppBind(elementAddress, vendorModelIdentifier, appKeyIndex)
        meshManagerApi.createMeshPdu(address, bind)
        logDebug("config model app bind sent addr=0x${String.format("%04x", address)}")
        emitProvisioningDebug("config model app bind sent")
      } catch (err: Exception) {
        logDebug("config model app bind failed: ${err.message}")
        emitProvisioningDebug("config model app bind failed")
        setupProvisionedNode = false
        setupConfigInProgress = false
        finishPostProvisioningConnect()
      }
    }, 500)
  }

  private fun sendVendorModelPublicationSet(address: Int, appKeyIndex: Int) {
    val network = meshManagerApi.meshNetwork ?: return
    val provisioner = network.selectedProvisioner
    val publishAddress = provisioner?.provisionerAddress
    if (publishAddress == null) {
      logDebug("config model publish skipped: provisioner address missing")
      return
    }
    try {
      val publishTtl = 0xFF
      val message = ConfigModelPublicationSet(
        address,
        publishAddress,
        appKeyIndex,
        false,
        publishTtl,
        0,
        0,
        0,
        0,
        vendorModelIdentifier
      )
      meshManagerApi.createMeshPdu(address, message)
      logDebug("config model publish set addr=0x${String.format("%04x", address)} pub=0x${String.format("%04x", publishAddress)}")
      emitProvisioningDebug("config model publish set")
    } catch (err: Exception) {
      logDebug("config model publish set failed: ${err.message}")
      emitProvisioningDebug("config model publish set failed")
    }
  }

  private fun sendHeartbeatCfgSet(address: Int) {
    val network = meshManagerApi.meshNetwork ?: return
    val appKey = ensureAppKey(network) ?: return
    val interval = defaultHeartbeatIntervalSeconds
    if (interval <= 0) return
    val payload = ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(interval.toShort()).array()
    try {
      val message = VendorModelMessageUnacked(appKey, vendorModelIdentifier, vendorCompanyId, heartbeatCfgSetOpcode, payload)
      meshManagerApi.createMeshPdu(address, message)
      logDebug("heartbeat cfg set sent interval=${interval}s")
    } catch (err: Exception) {
      logDebug("heartbeat cfg set failed: ${err.message}")
    }
  }

  private fun setProxyFilterAllowAll() {
    try {
      val filterType = ProxyFilterType(ProxyFilterType.EXCLUSION_LIST_FILTER)
      val message = ProxyConfigSetFilterType(filterType)
      meshManagerApi.createMeshPdu(0x0000, message)
      logDebug("proxy filter set to exclusion list")
    } catch (err: Exception) {
      logDebug("proxy filter set failed: ${err.message}")
    }
  }

  private fun finishPostProvisioningConnect() {
    postProvisioningConnectTimeout?.let { handler.removeCallbacks(it) }
    postProvisioningConnectTimeout = null
    pendingPostProvisioningConnectPromise?.resolve(null)
    pendingPostProvisioningConnectPromise = null
  }

  private fun emitConnectionChange(nodeId: String?, connected: Boolean, emitAll: Boolean) {
    val network = meshManagerApi.meshNetwork
    if (emitAll && network != null) {
      val nodes = network.nodes
      nodes?.forEach { node ->
        if (node is ProvisionedMeshNode) {
          val map = Arguments.createMap()
          val id = node.uuid ?: node.unicastAddress.toString()
          map.putString("nodeId", id)
          map.putBoolean("connected", connected)
          emit("MeshConnection", map)
        }
      }
      return
    }
    if (nodeId != null) {
      val map = Arguments.createMap()
      map.putString("nodeId", nodeId)
      map.putBoolean("connected", connected)
      emit("MeshConnection", map)
    }
  }

  private fun connectProxyInternal(nodeId: String?, promise: Promise) {
    if (proxyGatt != null) {
      activeNodeId = nodeId
      emitConnectionChange(nodeId, true, emitAll = nodeId == null)
      promise.resolve(null)
      return
    }
    if (proxyConnectPromise != null) {
      promise.reject("CONNECTING", "Mesh proxy connection already in progress.")
      return
    }
    val adapter = getBluetoothAdapter()
    val scanner = adapter?.bluetoothLeScanner
    if (scanner == null) {
      promise.reject("NO_SCANNER", "Bluetooth LE scanner not available.")
      return
    }
    if (!ensureScanPermission(promise)) return

    activeNodeId = nodeId
    proxyConnectPromise = promise
    val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(MeshManagerApi.MESH_PROXY_UUID)).build())
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val device = result.device ?: return
        scanner.stopScan(this)
        proxyGatt = connectGatt(device, proxyGattCallback)
      }

      override fun onScanFailed(errorCode: Int) {
        scanner.stopScan(this)
        proxyConnectPromise?.reject("SCAN_FAILED", "Proxy scan failed with error $errorCode")
        proxyConnectPromise = null
      }
    }
    scanner.startScan(filters, settings, callback)
    handler.postDelayed({
      try {
        scanner.stopScan(callback)
      } catch (_: Exception) {
        // ignore stop scan errors
      }
      if (proxyGatt == null) {
        emitConnectionChange(activeNodeId, false, emitAll = activeNodeId == null)
        proxyConnectPromise?.resolve(null)
        proxyConnectPromise = null
      }
    }, 8000)
  }

  private val provisioningGattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      logDebug("provisioning conn state=$newState status=$status")
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        provisioningDiscoverStarted = false
        val requested = gatt.requestMtu(517)
        if (!requested) {
          provisioningDiscoverStarted = true
          gatt.discoverServices()
        }
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        if (provisioningLinkPromise != null) {
          provisioningLinkPromise?.reject("DISCONNECTED", "Provisioning link disconnected.")
          provisioningLinkPromise = null
        }
        if (provisioningPromise != null) {
          val promise = provisioningPromise
          provisioningPromise = null
          promise?.reject("DISCONNECTED", "Provisioning device disconnected.")
        }
        closeProvisioningGatt()
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      logDebug("provisioning mtu=$mtu status=$status")
      provisioningMtuSize = (mtu - 3).coerceAtLeast(20)
      if (!provisioningDiscoverStarted) {
        provisioningDiscoverStarted = true
        gatt.discoverServices()
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      logDebug("provisioning services discovered status=$status")
      if (status != BluetoothGatt.GATT_SUCCESS) {
        provisioningPromise?.reject("DISCOVERY_FAILED", "Service discovery failed")
        return
      }
      val service = gatt.getService(MeshManagerApi.MESH_PROVISIONING_UUID) ?: run {
        provisioningPromise?.reject("NO_SERVICE", "Provisioning service not found")
        return
      }
      provisioningDataIn = service.getCharacteristic(provisioningDataInUuid)
      provisioningDataOut = service.getCharacteristic(provisioningDataOutUuid)
      val dataOut = provisioningDataOut
      if (provisioningDataIn == null || dataOut == null) {
        provisioningPromise?.reject("NO_CHAR", "Provisioning characteristics missing")
        return
      }
      provisioningDataIn?.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      val uuid = provisioningNodeUuid
      if (uuid == null) {
        provisioningPromise?.reject("NO_UUID", "Missing unprovisioned device UUID.")
        return
      }
      pendingProvisioningNode = UnprovisionedMeshNode(uuid)
      pendingProvisioningStart = provisioningPromise != null || capabilityProbeActive
      if (!enableNotifications(gatt, dataOut)) {
        pendingProvisioningStart = false
        pendingProvisioningNode = null
        provisioningPromise?.reject("NO_NOTIFY", "Failed to enable provisioning notifications")
        return
      }
      logDebug("provisioning notifications enabled")
    }

    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int
    ) {
      logDebug("provisioning cccd write status=$status uuid=${descriptor.characteristic.uuid}")
      if (descriptor.uuid != cccdUuid) return
      if (descriptor.characteristic.uuid != provisioningDataOutUuid) return
      if (status != BluetoothGatt.GATT_SUCCESS) {
        provisioningPromise?.reject("NO_NOTIFY", "Failed to enable provisioning notifications")
        return
      }
      provisioningNotificationsEnabled = true
      if (provisioningLinkOnly) {
        pendingProvisioningStart = false
        provisioningLinkPromise?.resolve(null)
        provisioningLinkPromise = null
        return
      }
      if (!pendingProvisioningStart) return
      val unprovNode = pendingProvisioningNode ?: return
      pendingProvisioningStart = false
      startProvisioning(unprovNode)
    }

    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (characteristic.uuid == provisioningDataOutUuid) {
        val data = characteristic.value ?: return
        logDebug("provisioning notify len=${data.size}")
        handleProvisioningNotification(data)
      }
    }

    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray
    ) {
      if (characteristic.uuid == provisioningDataOutUuid) {
        logDebug("provisioning notify len=${value.size}")
        handleProvisioningNotification(value)
      }
    }

    override fun onCharacteristicWrite(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      if (characteristic.writeType == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) return
      logDebug("provisioning write status=$status len=${characteristic.value?.size ?: 0}")
      val data = characteristic.value ?: return
      val (normalized, stripped) = normalizeProvisioningPdu(data)
      if (stripped) {
        logDebug("provisioning write cb stripped from=${bytesToHex(data)} to=${bytesToHex(normalized)}")
      } else {
        logDebug("provisioning write cb pdu=${bytesToHex(normalized)}")
      }
      val raw = lastProvisioningWriteRaw
      if (raw != null && raw.contentEquals(data).not()) {
        logDebug("provisioning write cb using raw=${bytesToHex(raw)}")
      }
      val callbackData = raw ?: normalized
      lastProvisioningWriteRaw = null
      try {
        meshManagerApi.handleWriteCallbacks(provisioningMtuSize, callbackData)
      } catch (err: Exception) {
        logDebug("provisioning write cb error: ${err.message}")
      }
    }
  }

  private val proxyGattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      logDebug("proxy conn state=$newState status=$status")
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        proxyDiscoverStarted = false
        val requested = gatt.requestMtu(517)
        if (!requested) {
          proxyDiscoverStarted = true
          gatt.discoverServices()
        }
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        emitConnectionChange(activeNodeId, false, emitAll = activeNodeId == null)
        closeProxyGatt()
        proxyConnectPromise?.reject("DISCONNECTED", "Mesh proxy disconnected.")
        proxyConnectPromise = null
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      logDebug("proxy mtu=$mtu status=$status")
      proxyMtuSize = (mtu - 3).coerceAtLeast(20)
      if (!proxyDiscoverStarted) {
        proxyDiscoverStarted = true
        gatt.discoverServices()
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      logDebug("proxy services discovered status=$status")
      if (status != BluetoothGatt.GATT_SUCCESS) {
        proxyConnectPromise?.reject("DISCOVERY_FAILED", "Proxy service discovery failed")
        proxyConnectPromise = null
        return
      }
      val service = gatt.getService(MeshManagerApi.MESH_PROXY_UUID) ?: return
      proxyDataIn = service.getCharacteristic(proxyDataInUuid)
      proxyDataOut = service.getCharacteristic(proxyDataOutUuid)
      val dataOut = proxyDataOut ?: return
      if (!enableNotifications(gatt, dataOut)) {
        proxyConnectPromise?.reject("NO_NOTIFY", "Failed to enable proxy notifications")
        proxyConnectPromise = null
        return
      }
      logDebug("proxy notifications enabled")
    }

    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (characteristic.uuid == proxyDataOutUuid) {
        val data = characteristic.value ?: return
        logDebug("proxy notify len=${data.size}")
        handleProxyNotification(data)
      }
    }

    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray
    ) {
      if (characteristic.uuid == proxyDataOutUuid) {
        logDebug("proxy notify len=${value.size}")
        handleProxyNotification(value)
      }
    }

    override fun onDescriptorWrite(
      gatt: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int
    ) {
      logDebug("proxy cccd write status=$status")
      if (descriptor.uuid != cccdUuid) return
      if (descriptor.characteristic.uuid != proxyDataOutUuid) return
      if (status != BluetoothGatt.GATT_SUCCESS) {
        proxyConnectPromise?.reject("NO_NOTIFY", "Failed to enable proxy notifications")
        proxyConnectPromise = null
        return
      }
      emitConnectionChange(activeNodeId, true, emitAll = activeNodeId == null)
      setProxyFilterAllowAll()
      val connectPromise = proxyConnectPromise
      proxyConnectPromise = null

      if (setupProvisionedNode && !setupConfigInProgress) {
        pendingPostProvisioningConnectPromise = connectPromise
        postProvisioningConnectTimeout = Runnable {
          logDebug("post-provisioning config timeout; continuing")
          setupProvisionedNode = false
          setupConfigInProgress = false
          finishPostProvisioningConnect()
        }
        handler.postDelayed(postProvisioningConnectTimeout!!, 15000)
        schedulePostProvisioningConfig()
      } else {
        connectPromise?.resolve(null)
      }
    }

    override fun onCharacteristicWrite(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      logDebug("proxy write status=$status len=${characteristic.value?.size ?: 0}")
      val data = characteristic.value ?: return
      meshManagerApi.handleWriteCallbacks(proxyMtuSize, data)
      writeNextProxyChunk()
    }
  }

  private data class UnprovisionedDevice(
    val device: BluetoothDevice,
    val uuid: UUID?,
    val name: String?
  )
}
