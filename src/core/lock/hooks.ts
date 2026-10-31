type Hook = () => void;

const lockHooks = new Set<Hook>();
const unlockHooks = new Set<Hook>();
let locked = false;

function add(set: Set<Hook>, hook: Hook): () => void {
  set.add(hook);
  return () => {
    set.delete(hook);
  };
}

function run(set: Set<Hook>): void {
  set.forEach((h) => {
    try {
      h();
    } catch {
      // a broken hook must not stop the lock
    }
  });
}

/** Things that must let go of the keyboard when the app locks. */
export function onAppLocked(hook: Hook): () => void {
  return add(lockHooks, hook);
}

/** Things that may take the keyboard back once the app unlocks. */
export function onAppUnlocked(hook: Hook): () => void {
  return add(unlockHooks, hook);
}

export function runLockHooks(): void {
  run(lockHooks);
}

export function runUnlockHooks(): void {
  run(unlockHooks);
}

/** True while the lock pad is up, so timers never focus an input under it. */
export function isAppLocked(): boolean {
  return locked;
}

export function setAppLocked(on: boolean): void {
  locked = on;
}
