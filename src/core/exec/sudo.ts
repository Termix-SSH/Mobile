/**
 * Sudo passwords for scripts the app runs. A password typed in is kept in
 * memory for this run of the app only, per host, and never written down.
 */

export interface SudoRequest {
  hostName: string;
  reason?: string;
  /** The last password was wrong. */
  retry: boolean;
}

/** Asks the user. Resolves null when they cancel. */
export type SudoPrompter = (request: SudoRequest) => Promise<string | null>;

let prompter: SudoPrompter | null = null;
const typed = new Map<string, string>();

/** The UI sets this once; without it a password can't be asked for. */
export function setSudoPrompter(next: SudoPrompter | null): () => void {
  prompter = next;
  return () => {
    if (prompter === next) prompter = null;
  };
}

export function askSudo(request: SudoRequest): Promise<string | null> {
  return prompter ? prompter(request) : Promise.resolve(null);
}

export const sudoMemory = {
  get: (key: string) => typed.get(key),
  set: (key: string, password: string) => void typed.set(key, password),
  forget: (key: string) => void typed.delete(key),
  clear: () => typed.clear(),
};
