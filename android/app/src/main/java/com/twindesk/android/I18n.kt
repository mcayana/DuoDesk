// TwinDesk / DuoDesk — Android Japanese localization & dynamic language engine (I18n.kt).
// Copyright (C) 2026 inukaasith / DuoDesk Japanese Localization. GPL-3.0, see LICENSE.
package com.twindesk.android

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

object I18n {
    private const val PREF_FILE = "duodesk_i18n"
    private const val KEY_LANG = "lang"

    var pref by mutableStateOf("auto")
        private set

    fun init(ctx: Context) {
        val saved = ctx.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE).getString(KEY_LANG, "auto") ?: "auto"
        pref = if (saved in setOf("auto", "ja", "en")) saved else "auto"
    }

    fun setLang(ctx: Context, lang: String) {
        val normalized = if (lang in setOf("auto", "ja", "en")) lang else "auto"
        pref = normalized
        ctx.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE).edit().putString(KEY_LANG, normalized).apply()
    }

    fun isJapanese(): Boolean = when (pref) {
        "ja" -> true
        "en" -> false
        else -> Locale.getDefault().language.equals("ja", ignoreCase = true)
    }

    private val exactJa: Map<String, String> = mapOf(
        // Tabs & Groups
        "Overview" to "概要",
        "Connection" to "接続",
        "Phone" to "スマートフォン",
        "Calls" to "通話",
        "Messages" to "メッセージ",
        "Photos" to "写真",
        "File access" to "ファイルアクセス",
        "Display" to "ディスプレイ",
        "Screen" to "画面",
        "Input" to "入力",
        "Mouse" to "マウス",
        "Keyboard" to "キーボード",
        "Remote" to "リモコン",
        "Share" to "共有",
        "Clipboard" to "クリップボード",
        "Notifications" to "通知",
        "Files" to "ファイル",
        "ReZume" to "ReZume",
        "More" to "その他",
        "Sound" to "サウンド",
        "Camera" to "カメラ",
        "General" to "一般",
        "About" to "このアプリについて",

        // Common status & actions
        "Connected" to "接続済み",
        "Not connected" to "未接続",
        "Not paired" to "未ペアリング",
        "Connecting…" to "接続中…",
        "Reconnecting…" to "再接続中…",
        "Pairing" to "ペアリング",
        "Code" to "コード",
        "Codes match" to "コードが一致",
        "Cancel" to "キャンセル",
        "Allow" to "許可",
        "Deny" to "拒否",
        "Close" to "閉じる",
        "Done" to "完了",
        "Reset" to "リセット",
        "Open" to "開く",
        "On" to "オン",
        "Off" to "オフ",
        "Connect" to "接続",
        "Disconnect" to "切断",
        "Forget" to "登録を解除",
        "Send" to "送信",
        "Copy" to "コピー",
        "Paste" to "貼り付け",
        "Stop" to "停止",
        "Start" to "開始",
        "Mirror" to "ミラーリング",
        "Extend" to "拡張ディスプレイ",
        "Scan QR code" to "QR コードをスキャン",
        "Connect by address" to "アドレスで接続",
        "Look again" to "再検索",
        "Found nearby" to "近くで見つかったデバイス",
        "Paired" to "ペアリング済み",
        "Settings" to "設定",
        "Permissions" to "権限",
        "Wireless debugging" to "ワイヤレスデバッグ",
        "Bluetooth" to "Bluetooth",
        "Battery" to "バッテリー",
        "Updates" to "アップデート",
        "This device" to "このデバイス",
        "Language" to "言語",
        "Display language" to "表示言語",
        "Follow system language or choose manually" to "OSの言語に合わせるか手動で選択します",
        "Follow system" to "システムに合わせる",
        "Hardware acceleration" to "ハードウェアアクセラレーション",
        "Architecture, GPU, video codec and NPU/NNAPI status" to "アーキテクチャ・GPU・映像ハードウェアコーデック・NPU/NNAPI 状況",
        "Detected hardware" to "検出されたハードウェア",
        "Hardware video codec" to "ハードウェア映像コーデック",
        "NPU / NNAPI acceleration" to "NPU / NNAPI アクセラレーション",
        "Touchpad & keyboard" to "タッチパッド＆キーボード",
        "Gamepad" to "ゲームパッド",
        "Open Remote" to "リモコンを開く",
        "Show screen" to "画面を表示",
        "Send files" to "ファイルを送信",
        "Received files" to "受信ファイル",
        "Shared folder" to "共有フォルダ",
        "Skip passwords" to "パスワードを除外",
        "Hide message text" to "メッセージ本文を隠す",
        "Play computer sound here" to "パソコンの音声をここで再生",
        "Use this camera on the computer" to "このカメラをパソコンで使用",
        "Keep running in the background" to "バックグラウンドで待機",
        "Source code" to "ソースコード",
        "Licence" to "ライセンス",
        "Privacy" to "プライバシー",
    )

    private val patternsJa: List<Pair<Regex, String>> = listOf(
        Regex("^Connected to (.+)$") to "$1 に接続済み",
        Regex("^Paired with (.+)$") to "$1 とペアリング済み",
        Regex("^Waiting for (.+)…$") to "$1 を待機中…",
        Regex("^Connecting to (.+)…$") to "$1 に接続中…",
        Regex("^(.+) → (.+)$") to "$1 → $2",
        Regex("^Version (.+)$") to "バージョン $1",
    )

    fun t(text: String): String {
        if (!isJapanese() || text.isBlank()) return text
        val trimmed = text.trim()
        exactJa[trimmed]?.let { return it }
        val curly = trimmed.replace('\'', '’')
        exactJa[curly]?.let { return it }
        for ((re, rep) in patternsJa) {
            if (re.matches(trimmed)) return trimmed.replace(re, rep)
        }
        return text
    }
}
