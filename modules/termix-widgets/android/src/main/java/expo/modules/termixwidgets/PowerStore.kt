package expo.modules.termixwidgets

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Mirrors `PowerStatus` in `src/widgets/power.ts`. */
enum class PowerStatus(val slug: String, val label: String) {
  UNKNOWN("unknown", "CHECKING"),
  ONLINE("online", "ONLINE"),
  OFFLINE("offline", "OFFLINE"),
  WAKING("waking", "WAKING"),
  STOPPING("stopping", "SHUTTING DOWN"),
  FAILED("failed", "FAILED");

  val isMoving: Boolean get() = this == WAKING || this == STOPPING

  companion object {
    fun from(raw: String?): PowerStatus = values().firstOrNull { it.slug == raw } ?: UNKNOWN
  }
}

data class PowerDevice(
  val key: String,
  val accountId: String,
  val hostId: Int,
  val name: String,
  val address: String,
  val server: String,
  val status: PowerStatus,
  val canWake: Boolean,
  val canShutdown: Boolean,
  val confirmShutdown: Boolean
)

data class PowerSnapshot(val updatedAt: Long, val devices: List<PowerDevice>) {
  companion object {
    const val SUPPORTED_VERSION = 1

    fun parse(json: String?): PowerSnapshot? {
      if (json.isNullOrBlank()) return null
      return runCatching {
        val root = JSONObject(json)
        if (root.optInt("version", -1) != SUPPORTED_VERSION) return null
        val list = root.optJSONArray("devices") ?: JSONArray()
        val devices = (0 until list.length()).mapNotNull { i ->
          val item = list.optJSONObject(i) ?: return@mapNotNull null
          val key = item.optString("key")
          if (key.isEmpty()) return@mapNotNull null
          PowerDevice(
            key = key,
            accountId = item.optString("accountId"),
            hostId = item.optInt("hostId"),
            name = item.optString("name"),
            address = item.optString("address"),
            server = item.optString("server"),
            status = PowerStatus.from(item.optString("status")),
            canWake = item.optBoolean("canWake"),
            canShutdown = item.optBoolean("canShutdown"),
            confirmShutdown = item.optBoolean("confirmShutdown")
          )
        }
        PowerSnapshot(root.optLong("updatedAt"), devices)
      }.getOrNull()
    }
  }
}

data class PowerAccess(val base: String, val headers: Map<String, String>)

/**
 * Power widget storage. The device list and what the widget did since the app
 * last published live in private preferences. Server access is sealed with a
 * Keystore key, since it carries the session.
 */
object PowerStore {
  private const val PREFERENCES_NAME = "termix_widget_power"
  private const val SNAPSHOT_KEY = "termix.widget.power.v1"
  private const val ACCESS_KEY = "access"
  private const val CHOICE_PREFIX = "device_for_widget_"
  private const val LIVE_PREFIX = "live_"
  private const val PENDING_PREFIX = "pending_"
  private const val ARMED_PREFIX = "armed_"
  private const val NOTICE_PREFIX = "notice_"
  private const val KEY_ALIAS = "termix_widget_power"

  const val PENDING_MS = 180_000L
  const val ARM_MS = 6_000L

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  // Snapshot

  fun writeSnapshot(context: Context, json: String) {
    prefs(context).edit().putString(SNAPSHOT_KEY, json).apply()
    // Drop access of servers that have no device left on the widget.
    val ids = PowerSnapshot.parse(json)?.devices?.map { it.accountId }?.toSet() ?: emptySet()
    val access = readAccessMap(context)
    if (access.keys.any { it !in ids }) writeAccessMap(context, access.filterKeys { it in ids })
  }

  fun snapshot(context: Context): PowerSnapshot? =
    PowerSnapshot.parse(runCatching { prefs(context).getString(SNAPSHOT_KEY, null) }.getOrNull())

  fun devices(context: Context): List<PowerDevice> = snapshot(context)?.devices ?: emptyList()

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
  }

  // Per widget choice

  fun choice(context: Context, appWidgetId: Int): String? =
    prefs(context).getString(CHOICE_PREFIX + appWidgetId, null)

  fun setChoice(context: Context, appWidgetId: Int, key: String?) {
    val editor = prefs(context).edit()
    if (key == null) editor.remove(CHOICE_PREFIX + appWidgetId)
    else editor.putString(CHOICE_PREFIX + appWidgetId, key)
    editor.apply()
  }

  fun forget(context: Context, appWidgetIds: IntArray) {
    val editor = prefs(context).edit()
    appWidgetIds.forEach { editor.remove(CHOICE_PREFIX + it) }
    editor.apply()
  }

  /** The widget's device, or the first one when none was picked. */
  fun deviceFor(context: Context, appWidgetId: Int): PowerDevice? {
    val all = devices(context)
    val key = choice(context, appWidgetId) ?: return all.firstOrNull()
    return all.firstOrNull { it.key == key }
  }

  // Local state

  fun setLive(context: Context, key: String, status: PowerStatus) {
    prefs(context).edit()
      .putString(LIVE_PREFIX + key, "${status.slug}|${System.currentTimeMillis()}")
      .apply()
  }

  fun setPending(context: Context, key: String, status: PowerStatus, from: PowerStatus) {
    val until = System.currentTimeMillis() + PENDING_MS
    prefs(context).edit().putString(PENDING_PREFIX + key, "${status.slug}|${from.slug}|$until").apply()
  }

  fun clearPending(context: Context, key: String) {
    prefs(context).edit().remove(PENDING_PREFIX + key).apply()
  }

  fun armedUntil(context: Context, key: String): Long = prefs(context).getLong(ARMED_PREFIX + key, 0)

  fun setArmed(context: Context, key: String, until: Long) {
    val editor = prefs(context).edit()
    if (until <= 0) editor.remove(ARMED_PREFIX + key) else editor.putLong(ARMED_PREFIX + key, until)
    editor.apply()
  }

  /** A short message under the status, like an error. Returns text and end time. */
  fun notice(context: Context, key: String): Pair<String, Long>? {
    val raw = prefs(context).getString(NOTICE_PREFIX + key, null) ?: return null
    val split = raw.indexOf('|')
    if (split < 0) return null
    val until = raw.substring(0, split).toLongOrNull() ?: return null
    if (until <= System.currentTimeMillis()) return null
    return raw.substring(split + 1) to until
  }

  fun setNotice(context: Context, key: String, text: String?, durationMs: Long = 10_000) {
    val editor = prefs(context).edit()
    if (text == null) editor.remove(NOTICE_PREFIX + key)
    else editor.putString(NOTICE_PREFIX + key, "${System.currentTimeMillis() + durationMs}|$text")
    editor.apply()
  }

  /** Status to show, from what the server said last and what the widget did. */
  fun status(context: Context, device: PowerDevice, now: Long = System.currentTimeMillis()): PowerStatus {
    val publishedAt = snapshot(context)?.updatedAt ?: 0
    var known = device.status
    prefs(context).getString(LIVE_PREFIX + device.key, null)?.split('|')?.let { parts ->
      val at = parts.getOrNull(1)?.toLongOrNull() ?: 0
      if (at > publishedAt) known = PowerStatus.from(parts.getOrNull(0))
    }
    prefs(context).getString(PENDING_PREFIX + device.key, null)?.split('|')?.let { parts ->
      val pending = PowerStatus.from(parts.getOrNull(0))
      val from = PowerStatus.from(parts.getOrNull(1))
      val until = parts.getOrNull(2)?.toLongOrNull() ?: 0
      if (now < until && (known == from || known.isMoving || known == PowerStatus.UNKNOWN)) {
        return pending
      }
    }
    return known
  }

  // Access

  fun access(context: Context, accountId: String): PowerAccess? {
    val json = readAccessMap(context)[accountId] ?: return null
    return runCatching {
      val root = JSONObject(json)
      val headers = mutableMapOf<String, String>()
      root.optJSONObject("headers")?.let { h ->
        h.keys().forEach { name -> headers[name] = h.optString(name) }
      }
      PowerAccess(root.getString("base"), headers)
    }.getOrNull()
  }

  fun setAccess(context: Context, accountId: String, json: String?) {
    val map = readAccessMap(context).toMutableMap()
    if (json.isNullOrEmpty()) map.remove(accountId) else map[accountId] = json
    writeAccessMap(context, map)
  }

  private fun readAccessMap(context: Context): Map<String, String> {
    val sealed = prefs(context).getString(ACCESS_KEY, null) ?: return emptyMap()
    return runCatching {
      val root = JSONObject(unseal(sealed))
      root.keys().asSequence().associateWith { root.getString(it) }
    }.getOrDefault(emptyMap())
  }

  private fun writeAccessMap(context: Context, map: Map<String, String>) {
    val editor = prefs(context).edit()
    if (map.isEmpty()) {
      editor.remove(ACCESS_KEY)
    } else {
      editor.putString(ACCESS_KEY, seal(JSONObject(map).toString()))
    }
    editor.apply()
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  private fun seal(plain: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val body = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(cipher.iv + body, Base64.NO_WRAP)
  }

  private fun unseal(sealed: String): String {
    val bytes = Base64.decode(sealed, Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
    return String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
  }
}
