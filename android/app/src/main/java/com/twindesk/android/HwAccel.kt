// TwinDesk / DuoDesk — Android ARM64 / GPU / NPU (NNAPI) hardware capability inspector.
// Copyright (C) 2026 inukaasith / DuoDesk. GPL-3.0, see LICENSE.
package com.twindesk.android

import android.media.MediaCodecList
import android.os.Build

data class AndroidHwSummary(
    val primaryAbi: String,
    val isArm64: Boolean,
    val soc: String,
    val hwDecoders: List<String>,
    val hwEncoders: List<String>,
    val nnapiAvailable: Boolean,
) {
    fun badge(): String {
        val parts = mutableListOf<String>()
        parts.add(if (isArm64) "ARM64" else primaryAbi.uppercase())
        if (hwDecoders.isNotEmpty()) parts.add("HW Codec")
        if (nnapiAvailable) parts.add("NNAPI/NPU")
        return parts.joinToString(" · ")
    }

    fun detail(): String {
        val items = mutableListOf<String>()
        if (soc.isNotEmpty()) items.add(soc)
        if (hwDecoders.isNotEmpty()) items.add("Decode: ${hwDecoders.joinToString("/")}")
        if (hwEncoders.isNotEmpty()) items.add("Encode: ${hwEncoders.joinToString("/")}")
        items.add(if (nnapiAvailable) "NNAPI / GPU Ready" else "GPU Ready")
        return items.joinToString(" · ")
    }
}

object HwAccel {
    @Volatile
    private var cached: AndroidHwSummary? = null

    fun inspect(): AndroidHwSummary {
        cached?.let { return it }
        val abis = Build.SUPPORTED_ABIS ?: emptyArray()
        val primary = abis.firstOrNull() ?: "unknown"
        val isArm64 = abis.any { it.equals("arm64-v8a", ignoreCase = true) }
        val soc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOfNotNull(Build.SOC_MANUFACTURER.takeIf { it.isNotBlank() }, Build.SOC_MODEL.takeIf { it.isNotBlank() })
                .joinToString(" ")
        } else {
            Build.HARDWARE ?: ""
        }

        val decoders = linkedSetOf<String>()
        val encoders = linkedSetOf<String>()
        try {
            val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
            for (info in list.codecInfos) {
                if (!info.isHardwareAccelerated) continue
                for (type in info.supportedTypes) {
                    val short = when (type.lowercase()) {
                        "video/avc" -> "H.264"
                        "video/hevc" -> "HEVC"
                        "video/x-vnd.on2.vp9" -> "VP9"
                        "video/av01" -> "AV1"
                        else -> null
                    } ?: continue
                    if (info.isEncoder) encoders.add(short) else decoders.add(short)
                }
            }
        } catch (_: Throwable) {}

        // Android 10+ (minSdk 29) includes NNAPI runtime for NPU / DSP / GPU acceleration.
        val nnapi = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

        return AndroidHwSummary(
            primaryAbi = primary,
            isArm64 = isArm64,
            soc = soc,
            hwDecoders = decoders.toList(),
            hwEncoders = encoders.toList(),
            nnapiAvailable = nnapi,
        ).also { cached = it }
    }
}
