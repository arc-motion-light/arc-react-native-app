package com.example.lampble.mesh

/** Decoder for the existing 48-byte WBA5 Probe Thread debug characteristic.
 * Keep byte offsets and presentation in sync with iOS emitProbeThreadDebug.
 * Malformed or unknown-version payloads are ignored, as on iOS.
 */
internal object ArcProbeThreadDebug {
  fun decode(payload: ByteArray): String? {
    if (payload.size < 48 || (payload[0].toInt() and 0xff) != 0x54 ||
      (payload[1].toInt() and 0xff) != 0x01) return null

    fun uint32LE(offset: Int): Long = (0..3).fold(0L) { value, i ->
      value or ((payload[offset + i].toLong() and 0xffL) shl (8 * i))
    }
    val status = payload[2].toInt() and 0xff
    val policy = (payload[3].toInt() and 0xff) ushr 4
    return "[ProbeThread] status=$status policy=$policy role=${uint32LE(16)} " +
      "init=${uint32LE(8)} ot_err=${uint32LE(12)} changes=${uint32LE(20)} " +
      "tasklets=${uint32LE(24)} drivers=${uint32LE(28)} " +
      "tx=${uint32LE(36)}/${uint32LE(32)} tx_err=${uint32LE(40)} " +
      "seq=${uint32LE(44)} process=${uint32LE(4)}"
  }
}
