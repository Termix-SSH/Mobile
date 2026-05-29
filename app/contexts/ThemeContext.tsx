import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { View, useColorScheme as useRNColorScheme } from "react-native";
import { vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_ACCENT,
  hexToRgbTriplet,
  STORAGE_KEYS,
  THEME_IS_DARK,
  THEME_VARS,
  type ThemeId,
} from "@/app/constants/theme";

interface ThemeContextValue {
  /** User selection, may be "system". */
  theme: ThemeId;
  /** Concrete resolved theme (never "system"). */
  resolvedTheme: Exclude<ThemeId, "system">;
  isDark: boolean;
  accent: string; // hex, e.g. "#f59145"
  accentTriplet: string; // "245 145 69"
  ready: boolean;
  setTheme: (t: ThemeId) => void;
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_ACCENT_TRIPLET = hexToRgbTriplet(DEFAULT_ACCENT)!;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [theme, setThemeState] = useState<ThemeId>("dark");
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);
  const [ready, setReady] = useState(false);

  // Load persisted preferences once on mount.
  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedAccent] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.theme),
          AsyncStorage.getItem(STORAGE_KEYS.accent),
        ]);
        if (savedTheme) setThemeState(savedTheme as ThemeId);
        if (savedAccent && hexToRgbTriplet(savedAccent))
          setAccentState(savedAccent);
      } catch {
        // best-effort; fall back to defaults
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    AsyncStorage.setItem(STORAGE_KEYS.theme, t).catch(() => {});
  }, []);

  const setAccent = useCallback((hex: string) => {
    if (!hexToRgbTriplet(hex)) return;
    setAccentState(hex);
    AsyncStorage.setItem(STORAGE_KEYS.accent, hex).catch(() => {});
  }, []);

  const resolvedTheme: Exclude<ThemeId, "system"> =
    theme === "system" ? (systemScheme === "light" ? "light" : "dark") : theme;

  const isDark = THEME_IS_DARK[resolvedTheme];
  const accentTriplet = hexToRgbTriplet(accent) ?? DEFAULT_ACCENT_TRIPLET;

  // Build the CSS-variable style for the active theme + accent.
  const themeStyle = useMemo(() => {
    const tokens = THEME_VARS[resolvedTheme];
    const cssVars: Record<string, string> = { "--accent-brand": accentTriplet };
    for (const [name, value] of Object.entries(tokens)) {
      cssVars[`--${name}`] = value;
    }
    return vars(cssVars);
  }, [resolvedTheme, accentTriplet]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      isDark,
      accent,
      accentTriplet,
      ready,
      setTheme,
      setAccent,
    }),
    [
      theme,
      resolvedTheme,
      isDark,
      accent,
      accentTriplet,
      ready,
      setTheme,
      setAccent,
    ],
  );

  // The `dark` class enables Tailwind dark: variants; the vars() style on the
  // same root view supplies every theme token (and overrides the accent).
  return (
    <ThemeContext.Provider value={value}>
      <View
        style={[{ flex: 1 }, themeStyle]}
        className={isDark ? "dark" : undefined}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Resolve a token name (e.g. "accent-brand", "muted-foreground") to an rgb()
 *  string, optionally with alpha. Useful for non-className props (icon colors,
 *  WebView injection, chart fills). */
export function useThemeColor() {
  const { resolvedTheme, accentTriplet } = useTheme();
  return useCallback(
    (token: string, alpha = 1) => {
      const triplet =
        token === "accent-brand"
          ? accentTriplet
          : THEME_VARS[resolvedTheme][token];
      if (!triplet) return undefined;
      return alpha >= 1
        ? `rgb(${triplet.split(" ").join(",")})`
        : `rgba(${triplet.split(" ").join(",")},${alpha})`;
    },
    [resolvedTheme, accentTriplet],
  );
}
