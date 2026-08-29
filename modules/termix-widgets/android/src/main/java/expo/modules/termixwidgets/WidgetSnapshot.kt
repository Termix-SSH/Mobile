package expo.modules.termixwidgets

import android.net.Uri
import org.json.JSONObject

/**
 * Decoders for the snapshot the app publishes.
 *
 * The payload shape is defined once in `app/widgets/types.ts`. Parsing is
 * deliberately lenient — unknown fields are ignored and missing ones fall back —
 * so an app update can add fields without breaking a widget that hasn't been
 * rebuilt yet.
 */

enum class HostStatus {
  ONLINE,
  OFFLINE,
  UNKNOWN;

  companion object {
    fun from(raw: String?): HostStatus = when (raw) {
      "online" -> ONLINE
      "offline" -> OFFLINE
      else -> UNKNOWN
    }
  }
}

enum class SnapshotState {
  READY,
  EMPTY,
  SIGNED_OUT;

  companion object {
    fun from(raw: String?): SnapshotState = when (raw) {
      "ready" -> READY
      "empty" -> EMPTY
      else -> SIGNED_OUT
    }
  }
}

data class HostEntry(
  val id: Int,
  val name: String,
  val subtitle: String,
  val folder: String,
  val status: HostStatus,
  val cpu: Int?,
  val mem: Int?,
  val pinned: Boolean,
  val url: String
) {
  val uri: Uri
    get() = runCatching { Uri.parse(url) }.getOrDefault(WidgetSnapshot.FALLBACK_URI)
}

data class SnippetEntry(
  val id: Int,
  val name: String,
  val folder: String,
  val preview: String,
  val url: String
) {
  val uri: Uri
    get() = runCatching { Uri.parse(url) }.getOrDefault(WidgetSnapshot.FALLBACK_URI)
}

data class HostSummary(
  val total: Int = 0,
  val online: Int = 0,
  val offline: Int = 0,
  val unknown: Int = 0
)

data class WidgetSnapshot(
  val version: Int,
  val updatedAt: Long,
  val state: SnapshotState,
  val accent: String,
  val server: String,
  val summary: HostSummary,
  val hosts: List<HostEntry>,
  val snippets: List<SnippetEntry>
) {
  companion object {
    /** Payload version this build understands. Mirrors SNAPSHOT_VERSION in TS. */
    const val SUPPORTED_VERSION = 1

    const val FALLBACK_URL = "termix-mobile://widget/open"
    val FALLBACK_URI: Uri = Uri.parse(FALLBACK_URL)

    const val DEFAULT_ACCENT = "#f59145"

    fun signedOut(accent: String = DEFAULT_ACCENT) = WidgetSnapshot(
      version = SUPPORTED_VERSION,
      updatedAt = System.currentTimeMillis(),
      state = SnapshotState.SIGNED_OUT,
      accent = accent,
      server = "",
      summary = HostSummary(),
      hosts = emptyList(),
      snippets = emptyList()
    )

    /**
     * Parses a stored payload. Returns the signed-out snapshot for anything
     * unreadable so a corrupt write can never crash the widget host process.
     */
    fun parse(json: String?): WidgetSnapshot {
      if (json.isNullOrBlank()) return signedOut()

      return runCatching {
        val root = JSONObject(json)
        val version = root.optInt("version", -1)
        val accent = root.optString("accent", DEFAULT_ACCENT)
        if (version != SUPPORTED_VERSION) return signedOut(accent)

        val summaryJson = root.optJSONObject("summary")
        val summary = HostSummary(
          total = summaryJson?.optInt("total", 0) ?: 0,
          online = summaryJson?.optInt("online", 0) ?: 0,
          offline = summaryJson?.optInt("offline", 0) ?: 0,
          unknown = summaryJson?.optInt("unknown", 0) ?: 0
        )

        val hostsJson = root.optJSONArray("hosts")
        val hosts = buildList {
          for (index in 0 until (hostsJson?.length() ?: 0)) {
            val item = hostsJson?.optJSONObject(index) ?: continue
            val id = item.optInt("id", -1)
            if (id < 0) continue
            add(
              HostEntry(
                id = id,
                name = item.optString("name", "Host $id"),
                subtitle = item.optString("subtitle", ""),
                folder = item.optString("folder", ""),
                status = HostStatus.from(item.optString("status", "unknown")),
                cpu = item.optPercent("cpu"),
                mem = item.optPercent("mem"),
                pinned = item.optBoolean("pinned", false),
                url = item.optString("url", FALLBACK_URL)
              )
            )
          }
        }

        val snippetsJson = root.optJSONArray("snippets")
        val snippets = buildList {
          for (index in 0 until (snippetsJson?.length() ?: 0)) {
            val item = snippetsJson?.optJSONObject(index) ?: continue
            val id = item.optInt("id", -1)
            if (id < 0) continue
            add(
              SnippetEntry(
                id = id,
                name = item.optString("name", "Snippet $id"),
                folder = item.optString("folder", ""),
                preview = item.optString("preview", ""),
                url = item.optString("url", FALLBACK_URL)
              )
            )
          }
        }

        WidgetSnapshot(
          version = version,
          updatedAt = root.optLong("updatedAt", System.currentTimeMillis()),
          state = SnapshotState.from(root.optString("state", "signed-out")),
          accent = accent,
          server = root.optString("server", ""),
          summary = summary,
          hosts = hosts,
          snippets = snippets
        )
      }.getOrElse { signedOut() }
    }

    /** Reads a 0–100 metric, treating null/NaN/out-of-range as "unknown". */
    private fun JSONObject.optPercent(key: String): Int? {
      if (isNull(key)) return null
      val value = optDouble(key, Double.NaN)
      if (value.isNaN()) return null
      return value.toInt().coerceIn(0, 100)
    }
  }
}
