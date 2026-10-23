// Checks the mouse encoder setup the Android JNI uses (nativeEncodeMouse):
// nothing while tracking is off, SGR reports once the program turns it on.
#define GHOSTTY_STATIC
#include <ghostty/vt.h>

#include <stdio.h>
#include <string.h>

static int fails = 0;

static void expect(const char *label, const char *got, size_t len, const char *want) {
  if (len != strlen(want) || memcmp(got, want, len) != 0) {
    printf("FAIL %s: got %zu bytes \"%.*s\"\n", label, len, (int)len, got);
    fails++;
  } else {
    printf("ok %s\n", label);
  }
}

static size_t encode(GhosttyTerminal term, GhosttyMouseEncoder enc, GhosttyMouseEvent ev,
                     GhosttyMouseAction action, GhosttyMouseButton button, float x, float y,
                     char *buf, size_t cap) {
  ghostty_mouse_encoder_setopt_from_terminal(enc, term);
  GhosttyMouseEncoderSize size;
  memset(&size, 0, sizeof(size));
  size.size = sizeof(size);
  size.screen_width = 800;
  size.screen_height = 480;
  size.cell_width = 10;
  size.cell_height = 20;
  ghostty_mouse_encoder_setopt(enc, GHOSTTY_MOUSE_ENCODER_OPT_SIZE, &size);
  bool pressed = action == GHOSTTY_MOUSE_ACTION_PRESS;
  ghostty_mouse_encoder_setopt(enc, GHOSTTY_MOUSE_ENCODER_OPT_ANY_BUTTON_PRESSED, &pressed);
  ghostty_mouse_event_set_action(ev, action);
  ghostty_mouse_event_set_button(ev, button);
  ghostty_mouse_event_set_mods(ev, 0);
  GhosttyMousePosition pos = {x, y};
  ghostty_mouse_event_set_position(ev, pos);
  size_t written = 0;
  if (ghostty_mouse_encoder_encode(enc, ev, buf, cap, &written) != GHOSTTY_SUCCESS) return 0;
  return written;
}

int main(void) {
  GhosttyTerminal term = NULL;
  GhosttyTerminalOptions opts;
  memset(&opts, 0, sizeof(opts));
  opts.cols = 80;
  opts.rows = 24;
  opts.max_scrollback = 100;
  GhosttyMouseEncoder enc = NULL;
  GhosttyMouseEvent ev = NULL;
  if (ghostty_terminal_new(NULL, &term, opts) != GHOSTTY_SUCCESS ||
      ghostty_mouse_encoder_new(NULL, &enc) != GHOSTTY_SUCCESS ||
      ghostty_mouse_event_new(NULL, &ev) != GHOSTTY_SUCCESS) {
    printf("FAIL setup\n");
    return 1;
  }
  ghostty_terminal_resize(term, 80, 24, 10, 20);

  char buf[64];
  size_t n = encode(term, enc, ev, GHOSTTY_MOUSE_ACTION_PRESS, GHOSTTY_MOUSE_BUTTON_LEFT, 5, 5,
                    buf, sizeof(buf));
  expect("tracking off sends nothing", buf, n, "");

  const char *on = "\x1b[?1002h\x1b[?1006h";
  ghostty_terminal_vt_write(term, (const uint8_t *)on, strlen(on));
  // Cell (3, 2) zero based is col 4, row 3 in the report.
  n = encode(term, enc, ev, GHOSTTY_MOUSE_ACTION_PRESS, GHOSTTY_MOUSE_BUTTON_LEFT, 35, 45, buf,
             sizeof(buf));
  expect("press", buf, n, "\x1b[<0;4;3M");
  n = encode(term, enc, ev, GHOSTTY_MOUSE_ACTION_RELEASE, GHOSTTY_MOUSE_BUTTON_LEFT, 35, 45, buf,
             sizeof(buf));
  expect("release", buf, n, "\x1b[<0;4;3m");
  n = encode(term, enc, ev, GHOSTTY_MOUSE_ACTION_PRESS, GHOSTTY_MOUSE_BUTTON_FOUR, 5, 5, buf,
             sizeof(buf));
  expect("wheel up", buf, n, "\x1b[<64;1;1M");

  ghostty_mouse_event_free(ev);
  ghostty_mouse_encoder_free(enc);
  ghostty_terminal_free(term);
  return fails ? 1 : 0;
}
