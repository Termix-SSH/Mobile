type Listener = (sessionId: string | null) => void;

const listeners = new Set<Listener>();

/** Lets a showcase scenario put two tabs side by side. */
export function onShowcaseSplit(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestSplit(sessionId: string | null) {
  listeners.forEach((l) => l(sessionId));
}
