import * as SecureStore from "expo-secure-store";
import {
  closeTermixTailscale,
  configureTermixTailscale,
  getTermixTailscaleNativeLoadError,
  isTermixTailscaleAvailable,
  isTermixTailscaleForwardActive,
  isTermixTailscaleUp,
  startTermixTailscaleForward,
  stopAllTermixTailscaleForwards,
  upTermixTailscale,
  type ForwardHandle,
} from "@/modules/termix-tailscale";

const AUTH_KEY_STORE = "termix.tailscale.authKey";
const ENABLED_STORE = "termix.tailscale.enabled";
const HOSTNAME_STORE = "termix.tailscale.hostname";

export type ParsedServerUrl = {
  protocol: "http:" | "https:";
  host: string;
  port: number;
  /** Path + query if present (usually empty for Termix base URL). */
  rest: string;
  original: string;
};

let activeForward: ForwardHandle | null = null;
let activeNodeConfig: {
  authKey: string;
  hostname: string;
  ephemeral: boolean;
} | null = null;

// Native lifecycle calls are asynchronous across the JS/native boundary. Keep
// connect, forward teardown, and node shutdown in one queue so a late result
// cannot publish a handle after a newer operation has already stopped it.
let tailscaleLifecycleQueue: Promise<void> = Promise.resolve();

function withTailscaleLifecycleLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = tailscaleLifecycleQueue;
  let release!: () => void;
  tailscaleLifecycleQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  return previous
    .catch(() => undefined)
    .then(operation)
    .finally(() => release());
}

export function isTailscaleNativeAvailable(): boolean {
  return isTermixTailscaleAvailable();
}

export function getTailscaleNativeLoadError(): string | null {
  return getTermixTailscaleNativeLoadError();
}

export async function loadTailscaleSettings(): Promise<{
  enabled: boolean;
  authKey: string;
  hostname: string;
}> {
  const [enabled, authKey, hostname] = await Promise.all([
    SecureStore.getItemAsync(ENABLED_STORE),
    SecureStore.getItemAsync(AUTH_KEY_STORE),
    SecureStore.getItemAsync(HOSTNAME_STORE),
  ]);
  return {
    enabled: enabled === "1",
    authKey: authKey ?? "",
    hostname: hostname ?? "termix-mobile",
  };
}

export async function saveTailscaleSettings(opts: {
  enabled: boolean;
  authKey: string;
  hostname?: string;
}): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_STORE, opts.enabled ? "1" : "0");
  if (opts.authKey) {
    await SecureStore.setItemAsync(AUTH_KEY_STORE, opts.authKey.trim());
  } else {
    await SecureStore.deleteItemAsync(AUTH_KEY_STORE);
  }
  if (opts.hostname !== undefined) {
    const h = opts.hostname.trim() || "termix-mobile";
    await SecureStore.setItemAsync(HOSTNAME_STORE, h);
  }
}

export async function clearTailscaleSettings(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ENABLED_STORE),
    SecureStore.deleteItemAsync(AUTH_KEY_STORE),
    SecureStore.deleteItemAsync(HOSTNAME_STORE),
  ]);
}

/**
 * Parse a Termix server URL into host/port for TCP forwarding.
 * Default ports: http→80, https→443.
 */
function normalizeHost(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function parseServerUrl(url: string): ParsedServerUrl {
  const input = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Invalid server URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server address must start with http:// or https://");
  }
  if (!parsed.hostname) {
    throw new Error("Invalid server host");
  }

  const port =
    parsed.port && parsed.port.length > 0
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid server port");
  }

  // Normalize only the pathname. Trimming the raw URL corrupts values such as
  // `?next=/` and `#section/`; fragments are client-only and must not enter the
  // native forward or the persisted display URL.
  const pathname =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  const rest = `${pathname}${parsed.search}`;
  const original = `${parsed.origin}${pathname}${parsed.search}`;
  return {
    protocol: parsed.protocol,
    host: normalizeHost(parsed.hostname),
    port,
    rest,
    original,
  };
}

function transportUrlFor(forward: ForwardHandle, rest: string): string {
  return `http://127.0.0.1:${forward.localPort}${rest}`;
}

/** Live localhost transport if the native node and forward are still active. */
async function getLiveTransportUrlUnsafe(
  displayUrl: string,
): Promise<string | null> {
  if (!activeForward || !activeNodeConfig) return null;

  try {
    if (!(await isTermixTailscaleUp())) {
      activeForward = null;
      return null;
    }

    const parsed = parseServerUrl(displayUrl);
    if (
      activeForward.protocol === parsed.protocol &&
      normalizeHost(activeForward.remoteHost) === parsed.host &&
      activeForward.remotePort === parsed.port
    ) {
      if (!(await isTermixTailscaleForwardActive(activeForward))) {
        activeForward = null;
        return null;
      }
      return transportUrlFor(activeForward, parsed.rest);
    }
  } catch {
    return null;
  }
  return null;
}

export function getLiveTransportUrl(
  displayUrl: string,
): Promise<string | null> {
  return withTailscaleLifecycleLock(() =>
    getLiveTransportUrlUnsafe(displayUrl),
  );
}

export function getActiveTailscaleForward(): ForwardHandle | null {
  return activeForward;
}

/**
 * Bring up userspace Tailscale (if needed) and open a localhost TCP forward
 * to the remote Termix origin. Returns the URL the app should use for axios/WS.
 *
 * Reuses an existing live forward to the same host:port (critical: Hosts page
 * re-calls initializeServerConfig after login and must not tear down the tunnel).
 *
 * The app always talks to http://127.0.0.1:<localPort>. Native forwarding
 * preserves the remote protocol: HTTP is relayed directly, while HTTPS is
 * terminated natively with the original hostname as the TLS server name.
 */
type ConnectServerViaTailscaleOptions = {
  serverUrl: string;
  authKey: string;
  hostname?: string;
  ephemeral?: boolean;
};

type ConnectServerViaTailscaleResult = {
  transportUrl: string;
  displayUrl: string;
  forward: ForwardHandle;
};

async function connectServerViaTailscaleUnsafe(
  opts: ConnectServerViaTailscaleOptions,
): Promise<ConnectServerViaTailscaleResult> {
  if (!isTermixTailscaleAvailable()) {
    const loadError = getTermixTailscaleNativeLoadError();
    throw new Error(
      loadError
        ? `Tailscale native library failed to load: ${loadError}`
        : "Tailscale is not available in this build. Use a custom dev client with termix-tailscale native module.",
    );
  }
  const parsed = parseServerUrl(opts.serverUrl);
  const authKey = opts.authKey.trim();
  if (!authKey) {
    throw new Error("Tailscale auth key is required");
  }

  const desiredConfig = {
    authKey,
    hostname: opts.hostname?.trim() || "termix-mobile",
    ephemeral: opts.ephemeral ?? true,
  };
  const configChanged =
    activeNodeConfig !== null &&
    (activeNodeConfig.authKey !== desiredConfig.authKey ||
      activeNodeConfig.hostname !== desiredConfig.hostname ||
      activeNodeConfig.ephemeral !== desiredConfig.ephemeral);

  // Configure fails once the node is up. Tear down only when the caller really
  // changed node credentials/options; repeated calls keep the live forward.
  if (configChanged) {
    await shutdownTailscaleUnsafe();
  }

  let alreadyUp = await isTermixTailscaleUp();
  if (!alreadyUp && activeNodeConfig !== null) {
    // The native node may still exist while its backend is unhealthy. Close it
    // before configuring again; native Configure rejects a node that is still
    // in the running state even when IsUp reports false.
    await shutdownTailscaleUnsafe();
    alreadyUp = false;
  } else if (alreadyUp && activeNodeConfig === null) {
    // A native node can survive a JS reload while the in-memory config does not.
    // Do not attach a new forward to a node whose auth key/hostname we cannot
    // prove matches this request.
    await shutdownTailscaleUnsafe();
    alreadyUp = false;
  }

  const live = activeNodeConfig
    ? await getLiveTransportUrlUnsafe(parsed.original)
    : null;
  if (live && activeForward) {
    return {
      transportUrl: live,
      displayUrl: parsed.original,
      forward: activeForward,
    };
  }

  if (!alreadyUp) {
    await configureTermixTailscale({
      authKey: desiredConfig.authKey,
      hostname: desiredConfig.hostname,
      ephemeral: desiredConfig.ephemeral,
    });
    await upTermixTailscale();
    alreadyUp = true;
  }
  if (alreadyUp) {
    activeNodeConfig = desiredConfig;
  }

  // Drop only stale forwards, then open the one we need.
  try {
    await stopAllTermixTailscaleForwards();
  } catch {
    // best-effort
  }
  activeForward = null;

  const forward = await startTermixTailscaleForward(
    parsed.protocol,
    parsed.host,
    parsed.port,
  );
  activeForward = forward;

  return {
    transportUrl: transportUrlFor(forward, parsed.rest),
    displayUrl: parsed.original,
    forward,
  };
}

export function connectServerViaTailscale(
  opts: ConnectServerViaTailscaleOptions,
): Promise<ConnectServerViaTailscaleResult> {
  return withTailscaleLifecycleLock(() =>
    connectServerViaTailscaleUnsafe(opts),
  );
}

async function disconnectTailscaleForwardsUnsafe(): Promise<void> {
  try {
    await stopAllTermixTailscaleForwards();
  } finally {
    activeForward = null;
  }
}

export function disconnectTailscaleForwards(): Promise<void> {
  return withTailscaleLifecycleLock(() => disconnectTailscaleForwardsUnsafe());
}

async function shutdownTailscaleUnsafe(): Promise<void> {
  let stopError: unknown;
  try {
    await stopAllTermixTailscaleForwards();
  } catch (error) {
    stopError = error;
  }

  try {
    await closeTermixTailscale();
  } finally {
    activeForward = null;
    activeNodeConfig = null;
  }

  if (stopError) throw stopError;
}

export function shutdownTailscale(): Promise<void> {
  return withTailscaleLifecycleLock(() => shutdownTailscaleUnsafe());
}

/**
 * Ensure a localhost forward exists for displayUrl.
 * Reuses live forwards; otherwise joins with SecureStore auth key.
 */
export async function rehydrateTailscaleTransport(
  displayUrl: string,
): Promise<string | null> {
  if (!isTermixTailscaleAvailable()) return null;

  const live = await getLiveTransportUrl(displayUrl);
  if (live && (await isTermixTailscaleUp())) {
    return live;
  }

  const settings = await loadTailscaleSettings();
  if (!settings.authKey) return null;

  try {
    const { transportUrl } = await connectServerViaTailscale({
      serverUrl: displayUrl,
      authKey: settings.authKey,
      hostname: settings.hostname,
      ephemeral: true,
    });
    return transportUrl;
  } catch {
    return null;
  }
}

/** True when user previously saved a Tailscale auth key for this app. */
export async function isTailscaleConfigured(): Promise<boolean> {
  if (!isTermixTailscaleAvailable()) return false;
  const s = await loadTailscaleSettings();
  return !!s.authKey.trim();
}
