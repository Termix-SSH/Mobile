/** Tries in a row before the tab shows Reconnect instead. */
export const MAX_AUTO_RECONNECTS = 3;

/** A drop this soon after coming back to the app is from being away. */
export const RESUME_WINDOW_MS = 15000;

/** How long the page waits for anything from the server after a resume. */
export const ALIVE_CHECK_MS = 8000;

/**
 * Whether a lost remote desktop reconnects on its own. A stale tunnel found
 * by the resume check always does; a closed tunnel only right after the app
 * came back or while it's away, so a remote logoff still shows as ended.
 */
export function shouldAutoReconnect(input: {
  reason: "stale" | "lost";
  attempts: number;
  away: boolean;
  sinceResumeMs: number;
}): boolean {
  if (input.attempts >= MAX_AUTO_RECONNECTS) return false;
  if (input.reason === "stale") return true;
  return input.away || input.sinceResumeMs < RESUME_WINDOW_MS;
}

/**
 * Script for the remote desktop page: watches the Guacamole tunnel and adds
 * `window.termixAlive()`. The server sends a nop every few seconds, so
 * nothing at all after a resume means the socket is dead.
 */
export function tunnelWatchScript(checkMs: number = ALIVE_CHECK_MS): string {
  return `
      let received = 0;
      const clientInstruction = tunnel.oninstruction;
      tunnel.oninstruction = function (opcode, args) {
        received++;
        if (clientInstruction) clientInstruction.call(tunnel, opcode, args);
      };
      const clientTunnelState = tunnel.onstatechange;
      tunnel.onstatechange = function (state) {
        if (clientTunnelState) clientTunnelState.call(tunnel, state);
        if (state === Guacamole.Tunnel.State.CLOSED) post({ type: 'lost' });
      };
      window.termixAlive = function () {
        if (tunnel.state !== Guacamole.Tunnel.State.OPEN) { post({ type: 'stale' }); return; }
        const before = received;
        setTimeout(function () {
          if (received === before) post({ type: 'stale' });
        }, ${checkMs});
      };`;
}
