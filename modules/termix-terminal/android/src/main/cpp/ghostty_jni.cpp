// JNI bridge between expo.modules.termixterminal.GhosttyVt and libghostty-vt.
//
// One native handle owns a terminal, its render state, reusable row/cell
// iterators, and a key encoder. Calls come from the view's parse thread and
// the main thread; GhosttyTerminalView holds one lock around every call.
//
// nativeSnapshot flattens the dirty viewport rows into a caller-provided
// direct ByteBuffer (little-endian) so Kotlin can repaint without any
// per-cell JNI calls. See GhosttyTerminalView.kt for the reader side.
//
// Buffer layout:
//   header: 13 x i32
//     [0] version (2)          [1] dirty kind (0 none / 1 partial / 2 full)
//     [2] cols                 [3] rows
//     [4] default bg (ARGB)    [5] default fg (ARGB)
//     [6] cursor x or -1       [7] cursor y or -1
//     [8] cursor style         [9] cursor visible (0/1)
//     [10] row record count    [11] cursor blinking (0/1)
//     [12] cursor color (ARGB) or 0 when unconfigured
//   row record:
//     i32 rowIndex, i32 selStartX or -1, i32 selEndX or -1, i32 textUnits
//     cells[cols] x 16 bytes:
//       i32 fg (ARGB), i32 bg (ARGB),
//       u16 textOffset (UTF-16 units into row blob), u16 textLen (units),
//       u16 flags, u16 pad
//     u16 text[textUnits], zero-padded to a 4-byte boundary

#include <jni.h>
#include <android/input.h>
#include <android/keycodes.h>
#include <android/log.h>

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include <ghostty/vt.h>

namespace {

constexpr const char* kLogTag = "termix-ghostty";

// Cell flag bits shared with GhosttyTerminalView.kt.
constexpr uint16_t kFlagBold = 1 << 0;
constexpr uint16_t kFlagItalic = 1 << 1;
constexpr uint16_t kFlagFaint = 1 << 2;
constexpr uint16_t kFlagUnderline = 1 << 3;
constexpr uint16_t kFlagStrikethrough = 1 << 4;
constexpr uint16_t kFlagInverse = 1 << 5;
constexpr uint16_t kFlagInvisible = 1 << 6;
constexpr uint16_t kFlagWide = 1 << 7;
constexpr uint16_t kFlagSpacer = 1 << 8;
constexpr uint16_t kFlagFgDefault = 1 << 9;
constexpr uint16_t kFlagBgNone = 1 << 10;

constexpr size_t kHeaderBytes = 13 * sizeof(int32_t);
constexpr size_t kRowHeaderBytes = 4 * sizeof(int32_t);
constexpr size_t kCellRecordBytes = 16;
// Cap per-cell grapheme text; anything longer is truncated (degenerate input).
constexpr uint32_t kMaxCellTextUnits = 32;

// Event flags drained by nativeTakeEventFlags after each write; must mirror
// GhosttyVt.EVENT_* on the Kotlin side.
constexpr jint kEventBell = 1;
constexpr jint kEventTitle = 1 << 1;
constexpr jint kEventPwd = 1 << 2;
constexpr jint kEventClipboard = 1 << 3;

struct Session {
  GhosttyTerminal term = nullptr;
  GhosttyRenderState renderState = nullptr;
  GhosttyRenderStateRowIterator rowIter = nullptr;
  GhosttyRenderStateRowCells cells = nullptr;
  GhosttyKeyEncoder encoder = nullptr;
  GhosttyKeyEvent keyEvent = nullptr;
  GhosttyMouseEncoder mouseEncoder = nullptr;
  GhosttyMouseEvent mouseEvent = nullptr;
  // Query responses emitted by the terminal during vt_write; forwarded to the
  // PTY by the caller after each write.
  std::vector<uint8_t> ptyOut;
  // Effects observed during vt_write, drained by nativeTakeEventFlags.
  jint pendingEvents = 0;
  // Last OSC 52 text the program asked to copy, taken by nativeTakeClipboard.
  std::string clipboard;
};

void writePtyCallback(GhosttyTerminal, void* userdata, const uint8_t* data, size_t len) {
  auto* session = static_cast<Session*>(userdata);
  session->ptyOut.insert(session->ptyOut.end(), data, data + len);
}

void bellCallback(GhosttyTerminal, void* userdata) {
  static_cast<Session*>(userdata)->pendingEvents |= kEventBell;
}

void titleChangedCallback(GhosttyTerminal, void* userdata) {
  static_cast<Session*>(userdata)->pendingEvents |= kEventTitle;
}

void pwdChangedCallback(GhosttyTerminal, void* userdata) {
  static_cast<Session*>(userdata)->pendingEvents |= kEventPwd;
}

// OSC 52 copy. Only text goes to the phone clipboard; the view asks nothing
// for writes, reads are never answered.
GhosttyClipboardWriteResult clipboardWriteCallback(GhosttyTerminal, void* userdata,
                                                   const GhosttyClipboardWrite* write) {
  auto* session = static_cast<Session*>(userdata);
  if (write == nullptr || write->location != GHOSTTY_CLIPBOARD_LOCATION_STANDARD) {
    return GHOSTTY_CLIPBOARD_WRITE_RESULT_UNSUPPORTED;
  }
  for (size_t i = 0; i < write->contents_len; i++) {
    const GhosttyClipboardContent& content = write->contents[i];
    const std::string mime(reinterpret_cast<const char*>(content.mime.ptr), content.mime.len);
    if (mime.rfind("text/plain", 0) != 0) continue;
    session->clipboard.assign(reinterpret_cast<const char*>(content.data.ptr), content.data.len);
    session->pendingEvents |= kEventClipboard;
    return GHOSTTY_CLIPBOARD_WRITE_RESULT_SUCCESS;
  }
  return GHOSTTY_CLIPBOARD_WRITE_RESULT_UNSUPPORTED;
}

jbyteArray toByteArray(JNIEnv* env, const void* data, size_t len) {
  jbyteArray out = env->NewByteArray(static_cast<jsize>(len));
  if (out == nullptr) return nullptr;
  env->SetByteArrayRegion(out, 0, static_cast<jsize>(len), reinterpret_cast<const jbyte*>(data));
  return out;
}

// DATA_TITLE / DATA_PWD return borrowed, non-null-terminated UTF-8; copy to a
// byte array and decode Kotlin-side (NewStringUTF chokes on supplementary
// characters).
jbyteArray stringData(JNIEnv* env, Session* session, GhosttyTerminalData key) {
  GhosttyString str{};
  if (ghostty_terminal_get(session->term, key, &str) != GHOSTTY_SUCCESS || str.len == 0) {
    return nullptr;
  }
  jbyteArray out = env->NewByteArray(static_cast<jsize>(str.len));
  if (out == nullptr) return nullptr;
  env->SetByteArrayRegion(out, 0, static_cast<jsize>(str.len),
                          reinterpret_cast<const jbyte*>(str.ptr));
  return out;
}

Session* fromHandle(jlong handle) {
  return reinterpret_cast<Session*>(static_cast<intptr_t>(handle));
}

bool viewportGridRef(Session* session, jint col, jint row, GhosttyGridRef* out) {
  GhosttyPoint point{};
  point.tag = GHOSTTY_POINT_TAG_VIEWPORT;
  point.value.coordinate.x = static_cast<uint16_t>(col);
  point.value.coordinate.y = static_cast<uint32_t>(row);
  return ghostty_terminal_grid_ref(session->term, point, out) == GHOSTTY_SUCCESS;
}

// Selection changes don't reliably mark rows dirty for our snapshot; force a
// full re-emit so the per-row selection ranges refresh everywhere.
void markRenderDirtyFull(Session* session) {
  GhosttyRenderStateDirty full = GHOSTTY_RENDER_STATE_DIRTY_FULL;
  ghostty_render_state_set(session->renderState, GHOSTTY_RENDER_STATE_OPTION_DIRTY, &full);
}

bool installSelection(Session* session, const GhosttySelection* selection) {
  if (ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_SELECTION, selection) !=
      GHOSTTY_SUCCESS) {
    return false;
  }
  markRenderDirtyFull(session);
  return true;
}

int32_t argb(GhosttyColorRgb color) {
  return static_cast<int32_t>(0xFF000000u | (static_cast<uint32_t>(color.r) << 16) |
                              (static_cast<uint32_t>(color.g) << 8) | color.b);
}

// Parses a color in ghostty config syntax (hex with or without '#', X11
// names, rgb:/rgbi: forms). Returns false on null or invalid input.
bool parseColor(JNIEnv* env, jstring str, GhosttyColorRgb* out) {
  if (str == nullptr) return false;
  const char* utf = env->GetStringUTFChars(str, nullptr);
  if (utf == nullptr) return false;
  const bool ok = ghostty_color_parse(utf, strlen(utf), out) == GHOSTTY_SUCCESS;
  if (!ok) {
    __android_log_print(ANDROID_LOG_WARN, kLogTag, "ignoring invalid theme color: %s", utf);
  }
  env->ReleaseStringUTFChars(str, utf);
  return ok;
}

void destroySession(Session* session) {
  if (session == nullptr) return;
  ghostty_mouse_event_free(session->mouseEvent);
  ghostty_mouse_encoder_free(session->mouseEncoder);
  ghostty_key_event_free(session->keyEvent);
  ghostty_key_encoder_free(session->encoder);
  ghostty_render_state_row_cells_free(session->cells);
  ghostty_render_state_row_iterator_free(session->rowIter);
  ghostty_render_state_free(session->renderState);
  ghostty_terminal_free(session->term);
  delete session;
}

GhosttyKey mapKey(int32_t keyCode) {
  if (keyCode >= AKEYCODE_A && keyCode <= AKEYCODE_Z) {
    return static_cast<GhosttyKey>(GHOSTTY_KEY_A + (keyCode - AKEYCODE_A));
  }
  if (keyCode >= AKEYCODE_0 && keyCode <= AKEYCODE_9) {
    return static_cast<GhosttyKey>(GHOSTTY_KEY_DIGIT_0 + (keyCode - AKEYCODE_0));
  }
  if (keyCode >= AKEYCODE_NUMPAD_0 && keyCode <= AKEYCODE_NUMPAD_9) {
    return static_cast<GhosttyKey>(GHOSTTY_KEY_NUMPAD_0 + (keyCode - AKEYCODE_NUMPAD_0));
  }
  if (keyCode >= AKEYCODE_F1 && keyCode <= AKEYCODE_F12) {
    return static_cast<GhosttyKey>(GHOSTTY_KEY_F1 + (keyCode - AKEYCODE_F1));
  }
  switch (keyCode) {
    case AKEYCODE_GRAVE: return GHOSTTY_KEY_BACKQUOTE;
    case AKEYCODE_BACKSLASH: return GHOSTTY_KEY_BACKSLASH;
    case AKEYCODE_LEFT_BRACKET: return GHOSTTY_KEY_BRACKET_LEFT;
    case AKEYCODE_RIGHT_BRACKET: return GHOSTTY_KEY_BRACKET_RIGHT;
    case AKEYCODE_COMMA: return GHOSTTY_KEY_COMMA;
    case AKEYCODE_EQUALS: return GHOSTTY_KEY_EQUAL;
    case AKEYCODE_MINUS: return GHOSTTY_KEY_MINUS;
    case AKEYCODE_PERIOD: return GHOSTTY_KEY_PERIOD;
    case AKEYCODE_APOSTROPHE: return GHOSTTY_KEY_QUOTE;
    case AKEYCODE_SEMICOLON: return GHOSTTY_KEY_SEMICOLON;
    case AKEYCODE_SLASH: return GHOSTTY_KEY_SLASH;
    case AKEYCODE_ALT_LEFT: return GHOSTTY_KEY_ALT_LEFT;
    case AKEYCODE_ALT_RIGHT: return GHOSTTY_KEY_ALT_RIGHT;
    case AKEYCODE_DEL: return GHOSTTY_KEY_BACKSPACE;
    case AKEYCODE_CAPS_LOCK: return GHOSTTY_KEY_CAPS_LOCK;
    case AKEYCODE_CTRL_LEFT: return GHOSTTY_KEY_CONTROL_LEFT;
    case AKEYCODE_CTRL_RIGHT: return GHOSTTY_KEY_CONTROL_RIGHT;
    case AKEYCODE_ENTER: return GHOSTTY_KEY_ENTER;
    case AKEYCODE_META_LEFT: return GHOSTTY_KEY_META_LEFT;
    case AKEYCODE_META_RIGHT: return GHOSTTY_KEY_META_RIGHT;
    case AKEYCODE_SHIFT_LEFT: return GHOSTTY_KEY_SHIFT_LEFT;
    case AKEYCODE_SHIFT_RIGHT: return GHOSTTY_KEY_SHIFT_RIGHT;
    case AKEYCODE_SPACE: return GHOSTTY_KEY_SPACE;
    case AKEYCODE_TAB: return GHOSTTY_KEY_TAB;
    case AKEYCODE_FORWARD_DEL: return GHOSTTY_KEY_DELETE;
    case AKEYCODE_MOVE_END: return GHOSTTY_KEY_END;
    case AKEYCODE_MOVE_HOME: return GHOSTTY_KEY_HOME;
    case AKEYCODE_INSERT: return GHOSTTY_KEY_INSERT;
    case AKEYCODE_PAGE_DOWN: return GHOSTTY_KEY_PAGE_DOWN;
    case AKEYCODE_PAGE_UP: return GHOSTTY_KEY_PAGE_UP;
    case AKEYCODE_DPAD_DOWN: return GHOSTTY_KEY_ARROW_DOWN;
    case AKEYCODE_DPAD_LEFT: return GHOSTTY_KEY_ARROW_LEFT;
    case AKEYCODE_DPAD_RIGHT: return GHOSTTY_KEY_ARROW_RIGHT;
    case AKEYCODE_DPAD_UP: return GHOSTTY_KEY_ARROW_UP;
    case AKEYCODE_NUM_LOCK: return GHOSTTY_KEY_NUM_LOCK;
    case AKEYCODE_NUMPAD_ADD: return GHOSTTY_KEY_NUMPAD_ADD;
    case AKEYCODE_NUMPAD_COMMA: return GHOSTTY_KEY_NUMPAD_COMMA;
    case AKEYCODE_NUMPAD_DOT: return GHOSTTY_KEY_NUMPAD_DECIMAL;
    case AKEYCODE_NUMPAD_DIVIDE: return GHOSTTY_KEY_NUMPAD_DIVIDE;
    case AKEYCODE_NUMPAD_ENTER: return GHOSTTY_KEY_NUMPAD_ENTER;
    case AKEYCODE_NUMPAD_EQUALS: return GHOSTTY_KEY_NUMPAD_EQUAL;
    case AKEYCODE_NUMPAD_MULTIPLY: return GHOSTTY_KEY_NUMPAD_MULTIPLY;
    case AKEYCODE_NUMPAD_SUBTRACT: return GHOSTTY_KEY_NUMPAD_SUBTRACT;
    case AKEYCODE_ESCAPE: return GHOSTTY_KEY_ESCAPE;
    default: return GHOSTTY_KEY_UNIDENTIFIED;
  }
}

GhosttyMods mapMods(int32_t metaState) {
  GhosttyMods mods = 0;
  if (metaState & AMETA_SHIFT_ON) mods |= GHOSTTY_MODS_SHIFT;
  if (metaState & AMETA_SHIFT_RIGHT_ON) mods |= GHOSTTY_MODS_SHIFT_SIDE;
  if (metaState & AMETA_CTRL_ON) mods |= GHOSTTY_MODS_CTRL;
  if (metaState & AMETA_CTRL_RIGHT_ON) mods |= GHOSTTY_MODS_CTRL_SIDE;
  if (metaState & AMETA_ALT_ON) mods |= GHOSTTY_MODS_ALT;
  if (metaState & AMETA_ALT_RIGHT_ON) mods |= GHOSTTY_MODS_ALT_SIDE;
  if (metaState & AMETA_META_ON) mods |= GHOSTTY_MODS_SUPER;
  if (metaState & AMETA_META_RIGHT_ON) mods |= GHOSTTY_MODS_SUPER_SIDE;
  if (metaState & AMETA_CAPS_LOCK_ON) mods |= GHOSTTY_MODS_CAPS_LOCK;
  if (metaState & AMETA_NUM_LOCK_ON) mods |= GHOSTTY_MODS_NUM_LOCK;
  return mods;
}

// Append one codepoint as UTF-16 into out; returns units written (0 if full).
uint32_t appendUtf16(uint32_t cp, uint16_t* out, uint32_t used, uint32_t cap) {
  if (cp < 0x10000) {
    if (used + 1 > cap) return 0;
    out[used] = static_cast<uint16_t>(cp);
    return 1;
  }
  if (used + 2 > cap) return 0;
  cp -= 0x10000;
  out[used] = static_cast<uint16_t>(0xD800 + (cp >> 10));
  out[used + 1] = static_cast<uint16_t>(0xDC00 + (cp & 0x3FF));
  return 2;
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeCreate(
    JNIEnv*, jobject, jint cols, jint rows, jlong maxScrollback) {
  auto* session = new Session();
  GhosttyTerminalOptions opts{};
  opts.cols = static_cast<uint16_t>(cols);
  opts.rows = static_cast<uint16_t>(rows);
  opts.max_scrollback = static_cast<size_t>(maxScrollback);

  if (ghostty_terminal_new(nullptr, &session->term, opts) != GHOSTTY_SUCCESS ||
      ghostty_render_state_new(nullptr, &session->renderState) != GHOSTTY_SUCCESS ||
      ghostty_render_state_row_iterator_new(nullptr, &session->rowIter) != GHOSTTY_SUCCESS ||
      ghostty_render_state_row_cells_new(nullptr, &session->cells) != GHOSTTY_SUCCESS ||
      ghostty_key_encoder_new(nullptr, &session->encoder) != GHOSTTY_SUCCESS ||
      ghostty_key_event_new(nullptr, &session->keyEvent) != GHOSTTY_SUCCESS ||
      ghostty_mouse_encoder_new(nullptr, &session->mouseEncoder) != GHOSTTY_SUCCESS ||
      ghostty_mouse_event_new(nullptr, &session->mouseEvent) != GHOSTTY_SUCCESS) {
    __android_log_print(ANDROID_LOG_ERROR, kLogTag, "failed to create terminal session");
    destroySession(session);
    return 0;
  }

  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_USERDATA, session);
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_WRITE_PTY,
                       reinterpret_cast<const void*>(&writePtyCallback));
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_BELL,
                       reinterpret_cast<const void*>(&bellCallback));
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_TITLE_CHANGED,
                       reinterpret_cast<const void*>(&titleChangedCallback));
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_PWD_CHANGED,
                       reinterpret_cast<const void*>(&pwdChangedCallback));
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_CLIPBOARD_WRITE,
                       reinterpret_cast<const void*>(&clipboardWriteCallback));

  GhosttyColorRgb bg{0x00, 0x00, 0x00};
  GhosttyColorRgb fg{0xFF, 0xFF, 0xFF};
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_BACKGROUND, &bg);
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_FOREGROUND, &fg);

  // libghostty's built-in default is a non-blinking cursor; blink by default
  // like the terminal apps users come from. DECSCUSR still overrides.
  const bool blinkDefault = true;
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_DEFAULT_CURSOR_BLINK, &blinkDefault);

  return static_cast<jlong>(reinterpret_cast<intptr_t>(session));
}

JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeFree(JNIEnv*, jobject, jlong handle) {
  destroySession(fromHandle(handle));
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeWrite(
    JNIEnv* env, jobject, jlong handle, jbyteArray data) {
  auto* session = fromHandle(handle);
  if (session == nullptr || data == nullptr) return nullptr;

  session->ptyOut.clear();
  const jsize len = env->GetArrayLength(data);
  if (len > 0) {
    jbyte* bytes = env->GetByteArrayElements(data, nullptr);
    ghostty_terminal_vt_write(session->term, reinterpret_cast<const uint8_t*>(bytes),
                              static_cast<size_t>(len));
    env->ReleaseByteArrayElements(data, bytes, JNI_ABORT);
  }

  if (session->ptyOut.empty()) return nullptr;
  const auto outLen = static_cast<jsize>(session->ptyOut.size());
  jbyteArray out = env->NewByteArray(outLen);
  if (out == nullptr) return nullptr;
  env->SetByteArrayRegion(out, 0, outLen,
                          reinterpret_cast<const jbyte*>(session->ptyOut.data()));
  return out;
}

JNIEXPORT jint JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeTakeEventFlags(
    JNIEnv*, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return 0;
  const jint flags = session->pendingEvents;
  session->pendingEvents = 0;
  return flags;
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeGetTitle(
    JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  return stringData(env, session, GHOSTTY_TERMINAL_DATA_TITLE);
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeGetPwd(
    JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  return stringData(env, session, GHOSTTY_TERMINAL_DATA_PWD);
}

JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeResize(
    JNIEnv*, jobject, jlong handle, jint cols, jint rows, jint cellWidthPx, jint cellHeightPx) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return;
  ghostty_terminal_resize(session->term, static_cast<uint16_t>(cols),
                          static_cast<uint16_t>(rows), static_cast<uint32_t>(cellWidthPx),
                          static_cast<uint32_t>(cellHeightPx));
  // The renderer discards its bitmap on every resize; a same-grid resize
  // (font-size change landing on identical cols/rows) would otherwise leave
  // no dirty rows to repaint it with.
  markRenderDirtyFull(session);
}

// Sets the terminal's default colors (theme). Null arguments clear back to
// the built-in defaults; invalid color strings are logged and skipped, like
// ghostty does for bad config values. The palette array overrides entries
// by index on top of ghostty's default 256-color palette; per-index OSC 4
// overrides set by the running program are preserved by the terminal.
JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSetTheme(
    JNIEnv* env, jobject, jlong handle, jstring foreground, jstring background,
    jstring cursor, jobjectArray palette) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return;

  GhosttyColorRgb rgb{};
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_FOREGROUND,
                       parseColor(env, foreground, &rgb) ? &rgb : nullptr);
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_BACKGROUND,
                       parseColor(env, background, &rgb) ? &rgb : nullptr);
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_CURSOR,
                       parseColor(env, cursor, &rgb) ? &rgb : nullptr);

  if (palette == nullptr) {
    ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_PALETTE, nullptr);
  } else {
    GhosttyColorRgb table[256];
    ghostty_color_palette_default(table);
    jsize count = env->GetArrayLength(palette);
    if (count > 256) count = 256;
    for (jsize i = 0; i < count; i++) {
      auto entry = static_cast<jstring>(env->GetObjectArrayElement(palette, i));
      GhosttyColorRgb parsed{};
      if (parseColor(env, entry, &parsed)) table[i] = parsed;
      if (entry != nullptr) env->DeleteLocalRef(entry);
    }
    ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_COLOR_PALETTE, table);
  }

  markRenderDirtyFull(session);
}

// Parses a color in ghostty config syntax to ARGB, or 0 when invalid (real
// colors always carry 0xFF alpha, so 0 is never a valid result).
JNIEXPORT jint JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeParseColor(
    JNIEnv* env, jobject, jstring color) {
  GhosttyColorRgb rgb{};
  return parseColor(env, color, &rgb) ? argb(rgb) : 0;
}

JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeScroll(
    JNIEnv*, jobject, jlong handle, jint deltaRows) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return;
  GhosttyTerminalScrollViewport behavior{};
  behavior.tag = GHOSTTY_SCROLL_VIEWPORT_DELTA;
  behavior.value.delta = deltaRows;
  ghostty_terminal_scroll_viewport(session->term, behavior);
}

JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeScrollToBottom(
    JNIEnv*, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return;
  GhosttyTerminalScrollViewport behavior{};
  behavior.tag = GHOSTTY_SCROLL_VIEWPORT_BOTTOM;
  ghostty_terminal_scroll_viewport(session->term, behavior);
}

// Packs the viewport scrollbar as [total, offset, len] rows, or null when
// there is no scrollback to indicate.
JNIEXPORT jlongArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeScrollbar(
    JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  GhosttyTerminalScrollbar scrollbar{};
  if (ghostty_terminal_get(session->term, GHOSTTY_TERMINAL_DATA_SCROLLBAR, &scrollbar) !=
      GHOSTTY_SUCCESS) {
    return nullptr;
  }
  jlongArray out = env->NewLongArray(3);
  if (out == nullptr) return nullptr;
  const jlong values[3] = {static_cast<jlong>(scrollbar.total),
                           static_cast<jlong>(scrollbar.offset),
                           static_cast<jlong>(scrollbar.len)};
  env->SetLongArrayRegion(out, 0, 3, values);
  return out;
}

JNIEXPORT jint JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSnapshot(
    JNIEnv* env, jobject, jlong handle, jobject buffer) {
  auto* session = fromHandle(handle);
  if (session == nullptr || buffer == nullptr) return -1;
  auto* base = static_cast<uint8_t*>(env->GetDirectBufferAddress(buffer));
  const auto cap = static_cast<size_t>(env->GetDirectBufferCapacity(buffer));
  if (base == nullptr || cap < kHeaderBytes) return -1;

  if (ghostty_render_state_update(session->renderState, session->term) != GHOSTTY_SUCCESS) {
    return -1;
  }

  GhosttyRenderStateDirty dirty = GHOSTTY_RENDER_STATE_DIRTY_FALSE;
  ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_DIRTY, &dirty);

  uint16_t cols = 0;
  uint16_t rows = 0;
  ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_COLS, &cols);
  ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_ROWS, &rows);

  GhosttyRenderStateColors colors{};
  colors.size = sizeof(colors);
  ghostty_render_state_colors_get(session->renderState, &colors);

  bool cursorVisible = false;
  bool cursorBlinking = false;
  bool cursorInViewport = false;
  ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_CURSOR_VISIBLE,
                           &cursorVisible);
  ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_CURSOR_BLINKING,
                           &cursorBlinking);
  ghostty_render_state_get(session->renderState,
                           GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_HAS_VALUE,
                           &cursorInViewport);
  uint16_t cursorX = 0;
  uint16_t cursorY = 0;
  GhosttyRenderStateCursorVisualStyle cursorStyle =
      GHOSTTY_RENDER_STATE_CURSOR_VISUAL_STYLE_BLOCK;
  if (cursorInViewport) {
    ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_X,
                             &cursorX);
    ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_Y,
                             &cursorY);
    ghostty_render_state_get(session->renderState,
                             GHOSTTY_RENDER_STATE_DATA_CURSOR_VISUAL_STYLE, &cursorStyle);
  }

  GhosttyColorRgb cursorRgb{};
  int32_t cursorColor = 0;
  if (ghostty_terminal_get(session->term, GHOSTTY_TERMINAL_DATA_COLOR_CURSOR, &cursorRgb) ==
      GHOSTTY_SUCCESS) {
    cursorColor = argb(cursorRgb);
  }

  auto* header = reinterpret_cast<int32_t*>(base);
  header[0] = 2;
  header[1] = static_cast<int32_t>(dirty);
  header[2] = cols;
  header[3] = rows;
  header[4] = argb(colors.background);
  header[5] = argb(colors.foreground);
  header[6] = cursorInViewport ? cursorX : -1;
  header[7] = cursorInViewport ? cursorY : -1;
  header[8] = static_cast<int32_t>(cursorStyle);
  header[9] = cursorVisible ? 1 : 0;
  header[10] = 0;
  header[11] = cursorBlinking ? 1 : 0;
  header[12] = cursorColor;

  if (dirty == GHOSTTY_RENDER_STATE_DIRTY_FALSE) return 0;

  if (ghostty_render_state_get(session->renderState, GHOSTTY_RENDER_STATE_DATA_ROW_ITERATOR,
                               &session->rowIter) != GHOSTTY_SUCCESS) {
    return -1;
  }

  size_t offset = kHeaderBytes;
  int32_t rowCount = 0;
  int32_t rowIndex = -1;
  const bool kFalse = false;

  while (ghostty_render_state_row_iterator_next(session->rowIter)) {
    rowIndex++;

    bool rowDirty = false;
    ghostty_render_state_row_get(session->rowIter, GHOSTTY_RENDER_STATE_ROW_DATA_DIRTY,
                                 &rowDirty);
    if (rowDirty) {
      ghostty_render_state_row_set(session->rowIter, GHOSTTY_RENDER_STATE_ROW_OPTION_DIRTY,
                                   &kFalse);
    }
    if (dirty != GHOSTTY_RENDER_STATE_DIRTY_FULL && !rowDirty) continue;

    const size_t cellsOffset = offset + kRowHeaderBytes;
    const size_t textOffset = cellsOffset + static_cast<size_t>(cols) * kCellRecordBytes;
    if (textOffset > cap) return -1;

    auto* rowHeader = reinterpret_cast<int32_t*>(base + offset);
    rowHeader[0] = rowIndex;

    GhosttyRenderStateRowSelection selection{};
    selection.size = sizeof(selection);
    const GhosttyResult selResult = ghostty_render_state_row_get(
        session->rowIter, GHOSTTY_RENDER_STATE_ROW_DATA_SELECTION, &selection);
    rowHeader[1] = selResult == GHOSTTY_SUCCESS ? selection.start_x : -1;
    rowHeader[2] = selResult == GHOSTTY_SUCCESS ? selection.end_x : -1;

    if (ghostty_render_state_row_get(session->rowIter, GHOSTTY_RENDER_STATE_ROW_DATA_CELLS,
                                     &session->cells) != GHOSTTY_SUCCESS) {
      return -1;
    }

    auto* textBlob = reinterpret_cast<uint16_t*>(base + textOffset);
    const uint32_t textCapUnits = static_cast<uint32_t>((cap - textOffset) / 2);
    uint32_t textUnits = 0;
    std::vector<uint32_t> bigGrapheme;

    int32_t col = 0;
    while (col < cols && ghostty_render_state_row_cells_next(session->cells)) {
      uint8_t* record = base + cellsOffset + static_cast<size_t>(col) * kCellRecordBytes;
      uint16_t flags = 0;
      int32_t fg = 0;
      int32_t bg = 0;

      GhosttyCell raw = 0;
      ghostty_render_state_row_cells_get(session->cells,
                                         GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_RAW, &raw);
      GhosttyCellWide wide = GHOSTTY_CELL_WIDE_NARROW;
      ghostty_cell_get(raw, GHOSTTY_CELL_DATA_WIDE, &wide);
      if (wide == GHOSTTY_CELL_WIDE_WIDE) flags |= kFlagWide;
      if (wide == GHOSTTY_CELL_WIDE_SPACER_TAIL || wide == GHOSTTY_CELL_WIDE_SPACER_HEAD) {
        flags |= kFlagSpacer;
      }

      bool hasStyling = false;
      ghostty_render_state_row_cells_get(session->cells,
                                         GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_HAS_STYLING,
                                         &hasStyling);
      if (hasStyling) {
        GhosttyStyle style{};
        style.size = sizeof(style);
        ghostty_render_state_row_cells_get(session->cells,
                                           GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_STYLE, &style);
        if (style.bold) flags |= kFlagBold;
        if (style.italic) flags |= kFlagItalic;
        if (style.faint) flags |= kFlagFaint;
        if (style.underline != 0) flags |= kFlagUnderline;
        if (style.strikethrough) flags |= kFlagStrikethrough;
        if (style.inverse) flags |= kFlagInverse;
        if (style.invisible) flags |= kFlagInvisible;
      }

      GhosttyColorRgb cellColor{};
      if (ghostty_render_state_row_cells_get(session->cells,
                                             GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_FG_COLOR,
                                             &cellColor) == GHOSTTY_SUCCESS) {
        fg = argb(cellColor);
      } else {
        flags |= kFlagFgDefault;
      }
      if (ghostty_render_state_row_cells_get(session->cells,
                                             GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_BG_COLOR,
                                             &cellColor) == GHOSTTY_SUCCESS) {
        bg = argb(cellColor);
      } else {
        flags |= kFlagBgNone;
      }

      const uint32_t cellTextStart = textUnits;
      uint32_t cellUnits = 0;
      uint32_t graphemeLen = 0;
      if ((flags & kFlagSpacer) == 0) {
        ghostty_render_state_row_cells_get(session->cells,
                                           GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_LEN,
                                           &graphemeLen);
      }
      if (graphemeLen > 0) {
        uint32_t stackBuf[16];
        uint32_t* codepoints = stackBuf;
        if (graphemeLen > 16) {
          bigGrapheme.resize(graphemeLen);
          codepoints = bigGrapheme.data();
        }
        ghostty_render_state_row_cells_get(session->cells,
                                           GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_BUF,
                                           codepoints);
        for (uint32_t i = 0; i < graphemeLen && cellUnits < kMaxCellTextUnits; i++) {
          const uint32_t written =
              appendUtf16(codepoints[i], textBlob, textUnits + cellUnits, textCapUnits);
          if (written == 0) break;
          cellUnits += written;
        }
      }
      textUnits += cellUnits;

      *reinterpret_cast<int32_t*>(record) = fg;
      *reinterpret_cast<int32_t*>(record + 4) = bg;
      *reinterpret_cast<uint16_t*>(record + 8) = static_cast<uint16_t>(cellTextStart);
      *reinterpret_cast<uint16_t*>(record + 10) = static_cast<uint16_t>(cellUnits);
      *reinterpret_cast<uint16_t*>(record + 12) = flags;
      *reinterpret_cast<uint16_t*>(record + 14) = 0;
      col++;
    }

    // Zero-fill any remaining cell records (defensive; cols should match).
    for (; col < cols; col++) {
      uint8_t* record = base + cellsOffset + static_cast<size_t>(col) * kCellRecordBytes;
      memset(record, 0, kCellRecordBytes);
      *reinterpret_cast<uint16_t*>(record + 12) = kFlagFgDefault | kFlagBgNone;
    }

    rowHeader[3] = static_cast<int32_t>(textUnits);
    offset = textOffset + static_cast<size_t>(textUnits) * 2;
    if (offset % 4 != 0) {
      if (offset + 2 > cap) return -1;
      *reinterpret_cast<uint16_t*>(base + offset) = 0;
      offset += 2;
    }
    rowCount++;
  }

  GhosttyRenderStateDirty clean = GHOSTTY_RENDER_STATE_DIRTY_FALSE;
  ghostty_render_state_set(session->renderState, GHOSTTY_RENDER_STATE_OPTION_DIRTY, &clean);

  header[10] = rowCount;
  return rowCount;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSelectWord(
    JNIEnv*, jobject, jlong handle, jint col, jint row) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return JNI_FALSE;
  GhosttyGridRef ref{};
  ref.size = sizeof(ref);
  if (!viewportGridRef(session, col, row, &ref)) return JNI_FALSE;
  GhosttyTerminalSelectWordOptions options{};
  options.size = sizeof(options);
  options.ref = ref;
  GhosttySelection selection{};
  selection.size = sizeof(selection);
  if (ghostty_terminal_select_word(session->term, &options, &selection) != GHOSTTY_SUCCESS) {
    return JNI_FALSE;
  }
  return installSelection(session, &selection) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSelectAll(JNIEnv*, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return JNI_FALSE;
  GhosttySelection selection{};
  selection.size = sizeof(selection);
  if (ghostty_terminal_select_all(session->term, &selection) != GHOSTTY_SUCCESS) {
    return JNI_FALSE;
  }
  return installSelection(session, &selection) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSetSelection(
    JNIEnv*, jobject, jlong handle, jint anchorCol, jint anchorRow, jint col, jint row) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return JNI_FALSE;
  GhosttyGridRef start{};
  start.size = sizeof(start);
  GhosttyGridRef end{};
  end.size = sizeof(end);
  if (!viewportGridRef(session, anchorCol, anchorRow, &start) ||
      !viewportGridRef(session, col, row, &end)) {
    return JNI_FALSE;
  }
  GhosttySelection selection{};
  selection.size = sizeof(selection);
  selection.start = start;
  selection.end = end;
  selection.rectangle = false;
  return installSelection(session, &selection) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeClearSelection(JNIEnv*, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return;
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_SELECTION, nullptr);
  markRenderDirtyFull(session);
}

// Returns the active selection as UTF-8 bytes (plain, unwrapped, trimmed -
// Ghostty's copy semantics), or null when there is no selection.
JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSelectionText(
    JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  GhosttyTerminalSelectionFormatOptions options{};
  options.size = sizeof(options);
  options.emit = GHOSTTY_FORMATTER_FORMAT_PLAIN;
  options.unwrap = true;
  options.trim = true;
  options.selection = nullptr;

  size_t needed = 0;
  GhosttyResult result =
      ghostty_terminal_selection_format_buf(session->term, options, nullptr, 0, &needed);
  if (result != GHOSTTY_OUT_OF_SPACE && result != GHOSTTY_SUCCESS) return nullptr;

  std::vector<uint8_t> buf(needed);
  size_t written = 0;
  if (needed > 0) {
    result = ghostty_terminal_selection_format_buf(session->term, options, buf.data(),
                                                   buf.size(), &written);
    if (result != GHOSTTY_SUCCESS) return nullptr;
  }
  jbyteArray out = env->NewByteArray(static_cast<jsize>(written));
  if (out == nullptr) return nullptr;
  env->SetByteArrayRegion(out, 0, static_cast<jsize>(written),
                          reinterpret_cast<const jbyte*>(buf.data()));
  return out;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeIsPasteSafe(
    JNIEnv* env, jobject, jbyteArray data) {
  if (data == nullptr) return JNI_TRUE;
  const jsize len = env->GetArrayLength(data);
  if (len == 0) return JNI_TRUE;
  jbyte* bytes = env->GetByteArrayElements(data, nullptr);
  const bool safe = ghostty_paste_is_safe(reinterpret_cast<const char*>(bytes),
                                          static_cast<size_t>(len));
  env->ReleaseByteArrayElements(data, bytes, JNI_ABORT);
  return safe ? JNI_TRUE : JNI_FALSE;
}

// Encode clipboard text for the PTY: strips unsafe control bytes and wraps in
// bracketed-paste sequences when the terminal has mode 2004 set.
JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeEncodePaste(
    JNIEnv* env, jobject, jlong handle, jbyteArray data) {
  auto* session = fromHandle(handle);
  if (session == nullptr || data == nullptr) return nullptr;
  const jsize len = env->GetArrayLength(data);
  std::vector<char> input(static_cast<size_t>(len));
  if (len > 0) {
    env->GetByteArrayRegion(data, 0, len, reinterpret_cast<jbyte*>(input.data()));
  }

  bool bracketed = false;
  ghostty_terminal_mode_get(session->term, GHOSTTY_MODE_BRACKETED_PASTE, &bracketed);

  // Bracketed wrapping adds 12 bytes; stripping/CR replacement is 1:1.
  std::vector<char> out(input.size() + 16);
  size_t written = 0;
  GhosttyResult result = ghostty_paste_encode(input.data(), input.size(), bracketed,
                                              out.data(), out.size(), &written);
  if (result == GHOSTTY_OUT_OF_SPACE) {
    out.resize(written);
    result = ghostty_paste_encode(input.data(), input.size(), bracketed, out.data(),
                                  out.size(), &written);
  }
  if (result != GHOSTTY_SUCCESS) return nullptr;
  jbyteArray outArray = env->NewByteArray(static_cast<jsize>(written));
  if (outArray == nullptr) return nullptr;
  env->SetByteArrayRegion(outArray, 0, static_cast<jsize>(written),
                          reinterpret_cast<const jbyte*>(out.data()));
  return outArray;
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeEncodeKey(
    JNIEnv* env, jobject, jlong handle, jint keyCode, jint action, jint metaState,
    jint unshiftedCodepoint, jbyteArray utf8) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;

  // Terminal modes (DECCKM, Kitty flags, ...) change as programs run; sync
  // the encoder before every encode so arrows/keypad follow the active mode.
  ghostty_key_encoder_setopt_from_terminal(session->encoder, session->term);

  GhosttyKeyAction keyAction = GHOSTTY_KEY_ACTION_PRESS;
  if (action == 0) keyAction = GHOSTTY_KEY_ACTION_RELEASE;
  if (action == 2) keyAction = GHOSTTY_KEY_ACTION_REPEAT;

  ghostty_key_event_set_action(session->keyEvent, keyAction);
  ghostty_key_event_set_key(session->keyEvent, mapKey(keyCode));
  ghostty_key_event_set_mods(session->keyEvent, mapMods(metaState));
  ghostty_key_event_set_consumed_mods(session->keyEvent, 0);
  ghostty_key_event_set_composing(session->keyEvent, false);
  ghostty_key_event_set_unshifted_codepoint(session->keyEvent,
                                            static_cast<uint32_t>(unshiftedCodepoint));

  jbyte* utf8Bytes = nullptr;
  jsize utf8Len = 0;
  if (utf8 != nullptr) {
    utf8Len = env->GetArrayLength(utf8);
    if (utf8Len > 0) utf8Bytes = env->GetByteArrayElements(utf8, nullptr);
  }
  ghostty_key_event_set_utf8(session->keyEvent,
                             reinterpret_cast<const char*>(utf8Bytes),
                             static_cast<size_t>(utf8Bytes != nullptr ? utf8Len : 0));

  char stackBuf[128];
  size_t written = 0;
  GhosttyResult result = ghostty_key_encoder_encode(session->encoder, session->keyEvent,
                                                    stackBuf, sizeof(stackBuf), &written);
  std::vector<char> heapBuf;
  const char* out = stackBuf;
  if (result == GHOSTTY_OUT_OF_SPACE) {
    heapBuf.resize(written);
    result = ghostty_key_encoder_encode(session->encoder, session->keyEvent, heapBuf.data(),
                                        heapBuf.size(), &written);
    out = heapBuf.data();
  }

  // The event borrows the utf8 pointer; clear it before releasing the array.
  ghostty_key_event_set_utf8(session->keyEvent, nullptr, 0);
  if (utf8Bytes != nullptr) env->ReleaseByteArrayElements(utf8, utf8Bytes, JNI_ABORT);

  if (result != GHOSTTY_SUCCESS || written == 0) return nullptr;
  jbyteArray outArray = env->NewByteArray(static_cast<jsize>(written));
  if (outArray == nullptr) return nullptr;
  env->SetByteArrayRegion(outArray, 0, static_cast<jsize>(written),
                          reinterpret_cast<const jbyte*>(out));
  return outArray;
}

// Encodes a touch as a mouse event for the program's tracking mode. Returns
// null when tracking is off or the event maps to nothing.
JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeEncodeMouse(
    JNIEnv* env, jobject, jlong handle, jint action, jint button, jfloat x, jfloat y,
    jint widthPx, jint heightPx, jint cellWidthPx, jint cellHeightPx) {
  auto* session = fromHandle(handle);
  if (session == nullptr || cellWidthPx <= 0 || cellHeightPx <= 0) return nullptr;

  ghostty_mouse_encoder_setopt_from_terminal(session->mouseEncoder, session->term);
  GhosttyMouseEncoderSize size{};
  size.size = sizeof(GhosttyMouseEncoderSize);
  size.screen_width = static_cast<uint32_t>(widthPx);
  size.screen_height = static_cast<uint32_t>(heightPx);
  size.cell_width = static_cast<uint32_t>(cellWidthPx);
  size.cell_height = static_cast<uint32_t>(cellHeightPx);
  ghostty_mouse_encoder_setopt(session->mouseEncoder, GHOSTTY_MOUSE_ENCODER_OPT_SIZE, &size);
  bool pressed = action == GHOSTTY_MOUSE_ACTION_PRESS;
  ghostty_mouse_encoder_setopt(session->mouseEncoder,
                               GHOSTTY_MOUSE_ENCODER_OPT_ANY_BUTTON_PRESSED, &pressed);

  ghostty_mouse_event_set_action(session->mouseEvent, static_cast<GhosttyMouseAction>(action));
  ghostty_mouse_event_set_button(session->mouseEvent, static_cast<GhosttyMouseButton>(button));
  ghostty_mouse_event_set_mods(session->mouseEvent, 0);
  GhosttyMousePosition pos{};
  pos.x = x;
  pos.y = y;
  ghostty_mouse_event_set_position(session->mouseEvent, pos);

  char buf[64];
  size_t written = 0;
  if (ghostty_mouse_encoder_encode(session->mouseEncoder, session->mouseEvent, buf, sizeof(buf),
                                   &written) != GHOSTTY_SUCCESS ||
      written == 0) {
    return nullptr;
  }
  jbyteArray out = env->NewByteArray(static_cast<jsize>(written));
  if (out == nullptr) return nullptr;
  env->SetByteArrayRegion(out, 0, static_cast<jsize>(written),
                          reinterpret_cast<const jbyte*>(buf));
  return out;
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeTakeClipboard(
    JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr || session->clipboard.empty()) return nullptr;
  jbyteArray out = toByteArray(env, session->clipboard.data(), session->clipboard.size());
  session->clipboard.clear();
  return out;
}

// The OSC 8 link URI of a viewport cell, or null when it has none.
JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeHyperlinkAt(
    JNIEnv* env, jobject, jlong handle, jint col, jint row) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  GhosttyGridRef ref{};
  ref.size = sizeof(ref);
  if (!viewportGridRef(session, col, row, &ref)) return nullptr;
  size_t needed = 0;
  GhosttyResult result = ghostty_grid_ref_hyperlink_uri(&ref, nullptr, 0, &needed);
  if (result == GHOSTTY_SUCCESS || needed == 0) return nullptr;
  if (result != GHOSTTY_OUT_OF_SPACE) return nullptr;
  std::vector<uint8_t> buf(needed);
  size_t written = 0;
  if (ghostty_grid_ref_hyperlink_uri(&ref, buf.data(), buf.size(), &written) != GHOSTTY_SUCCESS ||
      written == 0) {
    return nullptr;
  }
  return toByteArray(env, buf.data(), written);
}

// Sets the cursor a program gets back with DECSCUSR 0, then applies it now.
JNIEXPORT void JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSetDefaultCursor(
    JNIEnv*, jobject, jlong handle, jint style, jboolean blink) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return;
  auto cursorStyle = static_cast<GhosttyTerminalCursorStyle>(style);
  const bool blinks = blink == JNI_TRUE;
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_DEFAULT_CURSOR_STYLE, &cursorStyle);
  ghostty_terminal_set(session->term, GHOSTTY_TERMINAL_OPT_DEFAULT_CURSOR_BLINK, &blinks);
  static const char kReset[] = "\x1b[0 q";
  session->ptyOut.clear();
  ghostty_terminal_vt_write(session->term, reinterpret_cast<const uint8_t*>(kReset),
                            sizeof(kReset) - 1);
  markRenderDirtyFull(session);
}

// Modes the view acts on: [mouse tracking, alt screen, alt scroll, focus events].
JNIEXPORT jintArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeModes(JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  bool mouse = false;
  ghostty_terminal_get(session->term, GHOSTTY_TERMINAL_DATA_MOUSE_TRACKING, &mouse);
  GhosttyTerminalScreen screen = GHOSTTY_TERMINAL_SCREEN_PRIMARY;
  ghostty_terminal_get(session->term, GHOSTTY_TERMINAL_DATA_ACTIVE_SCREEN, &screen);
  bool altScroll = false;
  ghostty_terminal_mode_get(session->term, GHOSTTY_MODE_ALT_SCROLL, &altScroll);
  bool focus = false;
  ghostty_terminal_mode_get(session->term, GHOSTTY_MODE_FOCUS_EVENT, &focus);
  const jint values[4] = {mouse ? 1 : 0, screen == GHOSTTY_TERMINAL_SCREEN_ALTERNATE ? 1 : 0,
                          altScroll ? 1 : 0, focus ? 1 : 0};
  jintArray out = env->NewIntArray(4);
  if (out == nullptr) return nullptr;
  env->SetIntArrayRegion(out, 0, 4, values);
  return out;
}

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeEncodeFocus(
    JNIEnv* env, jobject, jboolean focused) {
  char buf[16];
  size_t written = 0;
  if (ghostty_focus_encode(focused == JNI_TRUE ? GHOSTTY_FOCUS_GAINED : GHOSTTY_FOCUS_LOST, buf,
                           sizeof(buf), &written) != GHOSTTY_SUCCESS ||
      written == 0) {
    return nullptr;
  }
  return toByteArray(env, buf, written);
}

// Scrollback and screen as plain UTF-8, one line per row (no unwrap), for
// search. Rows line up with GHOSTTY_POINT_TAG_SCREEN y values.
JNIEXPORT jbyteArray JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeScreenText(
    JNIEnv* env, jobject, jlong handle) {
  auto* session = fromHandle(handle);
  if (session == nullptr) return nullptr;
  uint16_t cols = 0;
  size_t total = 0;
  if (ghostty_terminal_get(session->term, GHOSTTY_TERMINAL_DATA_COLS, &cols) != GHOSTTY_SUCCESS ||
      ghostty_terminal_get(session->term, GHOSTTY_TERMINAL_DATA_TOTAL_ROWS, &total) !=
          GHOSTTY_SUCCESS ||
      cols == 0 || total == 0) {
    return nullptr;
  }
  GhosttyPoint first{};
  first.tag = GHOSTTY_POINT_TAG_SCREEN;
  first.value.coordinate.x = 0;
  first.value.coordinate.y = 0;
  GhosttyPoint last = first;
  last.value.coordinate.x = static_cast<uint16_t>(cols - 1);
  last.value.coordinate.y = static_cast<uint32_t>(total - 1);
  GhosttySelection selection{};
  selection.size = sizeof(selection);
  selection.start.size = sizeof(selection.start);
  selection.end.size = sizeof(selection.end);
  if (ghostty_terminal_grid_ref(session->term, first, &selection.start) != GHOSTTY_SUCCESS ||
      ghostty_terminal_grid_ref(session->term, last, &selection.end) != GHOSTTY_SUCCESS) {
    return nullptr;
  }
  selection.rectangle = false;

  GhosttyFormatterTerminalOptions options{};
  options.size = sizeof(options);
  options.emit = GHOSTTY_FORMATTER_FORMAT_PLAIN;
  options.unwrap = false;
  options.trim = true;
  options.extra.size = sizeof(options.extra);
  options.extra.screen.size = sizeof(options.extra.screen);
  options.selection = &selection;
  GhosttyFormatter formatter = nullptr;
  if (ghostty_formatter_terminal_new(nullptr, &formatter, session->term, options) !=
      GHOSTTY_SUCCESS) {
    return nullptr;
  }
  size_t needed = 0;
  GhosttyResult result = ghostty_formatter_format_buf(formatter, nullptr, 0, &needed);
  std::vector<uint8_t> buf(needed);
  size_t written = 0;
  if ((result == GHOSTTY_OUT_OF_SPACE || result == GHOSTTY_SUCCESS) && needed > 0) {
    result = ghostty_formatter_format_buf(formatter, buf.data(), buf.size(), &written);
  }
  ghostty_formatter_free(formatter);
  if (result != GHOSTTY_SUCCESS && needed > 0) return nullptr;
  return toByteArray(env, buf.data(), written);
}

// Selects cells startCol..endCol (inclusive) of one screen row, for a search hit.
JNIEXPORT jboolean JNICALL
Java_expo_modules_termixterminal_GhosttyVt_nativeSelectScreenRange(
    JNIEnv*, jobject, jlong handle, jint row, jint startCol, jint endCol) {
  auto* session = fromHandle(handle);
  if (session == nullptr || row < 0 || startCol < 0 || endCol < startCol) return JNI_FALSE;
  GhosttyPoint a{};
  a.tag = GHOSTTY_POINT_TAG_SCREEN;
  a.value.coordinate.x = static_cast<uint16_t>(startCol);
  a.value.coordinate.y = static_cast<uint32_t>(row);
  GhosttyPoint b = a;
  b.value.coordinate.x = static_cast<uint16_t>(endCol);
  GhosttySelection selection{};
  selection.size = sizeof(selection);
  selection.start.size = sizeof(selection.start);
  selection.end.size = sizeof(selection.end);
  if (ghostty_terminal_grid_ref(session->term, a, &selection.start) != GHOSTTY_SUCCESS ||
      ghostty_terminal_grid_ref(session->term, b, &selection.end) != GHOSTTY_SUCCESS) {
    return JNI_FALSE;
  }
  selection.rectangle = false;
  return installSelection(session, &selection) ? JNI_TRUE : JNI_FALSE;
}

}  // extern "C"
