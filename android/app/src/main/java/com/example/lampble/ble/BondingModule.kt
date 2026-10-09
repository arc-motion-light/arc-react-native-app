package com.example.lampble.ble

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BondingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "BleBonding"

  @ReactMethod
  fun createBond(deviceId: String, promise: Promise) {
    val adapter = BluetoothAdapter.getDefaultAdapter()
    if (adapter == null) {
      promise.reject("NO_ADAPTER", "Bluetooth adapter not available")
      return
    }

    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      val granted = ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.BLUETOOTH_CONNECT
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) {
        promise.reject("MISSING_PERMISSION", "BLUETOOTH_CONNECT permission not granted")
        return
      }
    }

    try {
      val device = adapter.getRemoteDevice(deviceId)
      val result = device.createBond()
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("CREATE_BOND_FAILED", e)
    }
  }
}
