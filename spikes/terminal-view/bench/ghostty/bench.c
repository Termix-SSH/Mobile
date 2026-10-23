// Parser throughput for libghostty-vt, built for the host from the commit the
// Android module pins (zig build -Demit-lib-vt -Dsimd=false, like Android).
//
//   cc -O2 bench.c -I<prefix>/include <prefix>/lib/libghostty-vt.a -o bench
//   ./bench <fixtures dir>/*.bin
#define GHOSTTY_STATIC
#include <ghostty/vt.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

static double now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

static unsigned char *read_file(const char *path, size_t *len) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  *len = (size_t)ftell(f);
  fseek(f, 0, SEEK_SET);
  unsigned char *buf = malloc(*len);
  if (fread(buf, 1, *len, f) != *len) {
    free(buf);
    buf = NULL;
  }
  fclose(f);
  return buf;
}

static double run(const unsigned char *data, size_t len) {
  GhosttyTerminal term = NULL;
  GhosttyTerminalOptions opts;
  memset(&opts, 0, sizeof(opts));
  opts.cols = 120;
  opts.rows = 40;
  opts.max_scrollback = 10000;
  if (ghostty_terminal_new(NULL, &term, opts) != GHOSTTY_SUCCESS) {
    fprintf(stderr, "terminal_new failed\n");
    exit(1);
  }
  const size_t chunk = 64 * 1024;
  double start = now_ms();
  for (size_t i = 0; i < len; i += chunk) {
    size_t n = len - i < chunk ? len - i : chunk;
    ghostty_terminal_vt_write(term, data + i, n);
  }
  double ms = now_ms() - start;
  ghostty_terminal_free(term);
  return ms;
}

int main(int argc, char **argv) {
  for (int a = 1; a < argc; a++) {
    size_t len = 0;
    unsigned char *data = read_file(argv[a], &len);
    if (!data) {
      fprintf(stderr, "cannot read %s\n", argv[a]);
      return 1;
    }
    run(data, len < 1048576 ? len : 1048576);
    double ms = run(data, len);
    struct rusage ru;
    getrusage(RUSAGE_SELF, &ru);
    const char *name = strrchr(argv[a], '/');
    printf("TXBENCH {\"engine\":\"ghostty\",\"fixture\":\"%s\",\"mb\":%.1f,\"ms\":%.0f,"
           "\"mbps\":%.1f,\"rssMb\":%ld}\n",
           name ? name + 1 : argv[a], len / 1048576.0, ms, (len / 1048576.0) / (ms / 1000.0),
           ru.ru_maxrss / 1024);
    free(data);
  }
  return 0;
}
