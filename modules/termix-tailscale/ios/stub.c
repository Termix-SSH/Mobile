/* Fallback when the Go archive has not been built yet.
 * Same symbols as termix_ts.h so the app still links; all ops fail with a clear error.
 */
#include "termix_ts.h"
#include <stdlib.h>
#include <string.h>

int TermixTS_IsAvailable(void) { return 0; }

static char *dup_err(const char *msg) {
  size_t n = strlen(msg) + 1;
  char *p = (char *)malloc(n);
  if (p) memcpy(p, msg, n);
  return p;
}

int TermixTS_Configure(const char *authKey, const char *hostname,
                       const char *stateDir, int ephemeral) {
  (void)authKey;
  (void)hostname;
  (void)stateDir;
  (void)ephemeral;
  return -1;
}

int TermixTS_Up(void) { return -1; }

int TermixTS_StartForward(const char *protocol, const char *remoteHost,
                          int remotePort, int *localPortOut) {
  (void)protocol;
  (void)remoteHost;
  (void)remotePort;
  if (localPortOut) *localPortOut = 0;
  return -1;
}

int TermixTS_StopForward(const char *protocol, const char *remoteHost,
                         int remotePort, int localPort) {
  (void)protocol;
  (void)remoteHost;
  (void)remotePort;
  (void)localPort;
  return -1;
}

int TermixTS_StopAllForwards(void) { return 0; }

int TermixTS_IsForwardActive(const char *protocol, const char *remoteHost,
                             int remotePort, int localPort) {
  (void)protocol;
  (void)remoteHost;
  (void)remotePort;
  (void)localPort;
  return 0;
}

int TermixTS_IsUp(void) { return 0; }

char *TermixTS_GetIPs(void) { return dup_err(""); }

char *TermixTS_LastError(void) {
  return dup_err(
      "Termix Tailscale native library not built. "
      "Run: make -C modules/termix-tailscale/native ios  (or android / host)");
}

int TermixTS_Close(void) { return 0; }

void TermixTS_FreeString(char *p) { free(p); }
