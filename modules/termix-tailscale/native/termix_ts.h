// C ABI for the Termix Tailscale userspace bridge (Go tsnet).
// Keep in sync with exports in main.go.

#ifndef TERMIX_TS_H
#define TERMIX_TS_H

#ifdef __cplusplus
extern "C" {
#endif

// 1 when the real Go/tsnet implementation is linked; 0 for the fallback stub.
int TermixTS_IsAvailable(void);

// Configure before Up. stateDir must be a writable path. Returns 0 on success.
int TermixTS_Configure(const char *authKey, const char *hostname,
                       const char *stateDir, int ephemeral);

// Join the tailnet (blocking, ~timeout inside). Returns 0 on success.
int TermixTS_Up(void);

// Listen on 127.0.0.1:<ephemeral> and forward HTTP(S) to remoteHost:remotePort over TS.
// HTTPS targets are dialed with remoteHost as TLS ServerName while the local
// app-facing transport remains plain HTTP. Writes the chosen local port to
// *localPortOut. Returns 0 on success.
int TermixTS_StartForward(const char *protocol, const char *remoteHost,
                          int remotePort, int *localPortOut);

int TermixTS_StopForward(const char *protocol, const char *remoteHost,
                         int remotePort, int localPort);
int TermixTS_StopAllForwards(void);
// 1 when the specified native localhost forward is currently registered.
int TermixTS_IsForwardActive(const char *protocol, const char *remoteHost,
                             int remotePort, int localPort);

// 1 if Up has succeeded and the node is still open.
int TermixTS_IsUp(void);

// Comma-separated Tailscale IPs. Caller must TermixTS_FreeString.
char *TermixTS_GetIPs(void);

// Last error message. Caller must TermixTS_FreeString.
char *TermixTS_LastError(void);

int TermixTS_Close(void);

void TermixTS_FreeString(char *p);

#ifdef __cplusplus
}
#endif

#endif /* TERMIX_TS_H */
