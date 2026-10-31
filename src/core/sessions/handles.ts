import type { TerminalInputHandle } from "@/core/features/types";

type Getter = () => TerminalInputHandle | null;

const getters = new Map<string, Getter>();

/**
 * The open tabs' handles by session id, so a panel or a linked tab can reach
 * the tab it belongs to. The session screen fills it.
 */
export const sessionHandles = {
  register(sessionId: string, getter: Getter): () => void {
    getters.set(sessionId, getter);
    return () => {
      if (getters.get(sessionId) === getter) getters.delete(sessionId);
    };
  },
  get(sessionId: string | null | undefined): TerminalInputHandle | null {
    if (!sessionId) return null;
    return getters.get(sessionId)?.() ?? null;
  },
};
