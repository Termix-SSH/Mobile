import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { plainStore } from "@/core/storage/kv";
import {
  DEFAULT_KEY_REPEAT_INITIAL_DELAY,
  DEFAULT_KEY_REPEAT_INTERVAL,
} from "@/constants/keyboard-repeat-config";
import {
  defaultLayout,
  migrateLegacy,
  readLayout,
  type KeyLayout,
} from "./model";

export type KeySize = "small" | "medium" | "large";

export interface KeySettings {
  keySize: KeySize;
  hapticFeedback: boolean;
  keyRepeatInterval: number;
  keyRepeatInitialDelay: number;
}

export const DEFAULT_KEY_SETTINGS: KeySettings = {
  keySize: "medium",
  hapticFeedback: false,
  keyRepeatInterval: DEFAULT_KEY_REPEAT_INTERVAL,
  keyRepeatInitialDelay: DEFAULT_KEY_REPEAT_INITIAL_DELAY,
};

const LAYOUT_KEY = "keyLayout";
const SETTINGS_KEY = "keySettings";
// Where 1.x kept the key bar.
const LEGACY_KEY = "keyboardCustomization";

/** The saved global layout, or the 1.x one moved over, or the default. */
export async function loadGlobalLayout(): Promise<KeyLayout> {
  const saved = readLayout(await plainStore.get(LAYOUT_KEY));
  if (saved) return saved;
  const legacy = await plainStore.getJson<Record<string, unknown>>(LEGACY_KEY);
  const moved = migrateLegacy(legacy);
  if (moved) {
    await plainStore.setJson(LAYOUT_KEY, moved).catch(() => {});
    return moved;
  }
  return defaultLayout();
}

export async function loadKeySettings(): Promise<KeySettings> {
  const saved = await plainStore.getJson<Partial<KeySettings>>(SETTINGS_KEY);
  if (saved) return { ...DEFAULT_KEY_SETTINGS, ...saved };
  const legacy = await plainStore.getJson<{ settings?: Partial<KeySettings> }>(
    LEGACY_KEY,
  );
  return { ...DEFAULT_KEY_SETTINGS, ...(legacy?.settings ?? {}) };
}

interface KeyPrefs {
  layout: KeyLayout;
  settings: KeySettings;
  loaded: boolean;
  setLayout: (layout: KeyLayout) => Promise<void>;
  updateSettings: (patch: Partial<KeySettings>) => Promise<void>;
  resetLayout: () => Promise<void>;
}

const Context = createContext<KeyPrefs | null>(null);

export function KeyPrefsProvider({ children }: { children: React.ReactNode }) {
  const [layout, setLayoutState] = useState<KeyLayout>(defaultLayout);
  const [settings, setSettings] = useState<KeySettings>(DEFAULT_KEY_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadGlobalLayout(), loadKeySettings()])
      .then(([l, s]) => {
        if (!alive) return;
        setLayoutState(l);
        setSettings(s);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const setLayout = useCallback(async (next: KeyLayout) => {
    setLayoutState(next);
    await plainStore.setJson(LAYOUT_KEY, next);
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateSettings = useCallback(async (patch: Partial<KeySettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await plainStore.setJson(SETTINGS_KEY, next);
  }, []);

  const resetLayout = useCallback(
    () => setLayout(defaultLayout()),
    [setLayout],
  );

  const value = useMemo(
    () => ({
      layout,
      settings,
      loaded,
      setLayout,
      updateSettings,
      resetLayout,
    }),
    [layout, settings, loaded, setLayout, updateSettings, resetLayout],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useKeyPrefs(): KeyPrefs {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useKeyPrefs needs KeyPrefsProvider");
  return ctx;
}
