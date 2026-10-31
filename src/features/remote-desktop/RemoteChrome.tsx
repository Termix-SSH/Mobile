// The parts both remote desktop views share: the key strip, the settings
// sheet and the RDP sign-in sheet.
import React, { useMemo, useState } from "react";
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Keyboard as KeyboardIcon,
  Settings2,
  X,
} from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Button, Input, Sheet, SheetBody, Tabs } from "@/ui";
import type { RdpCredentials } from "./rdp-login";

export const KEY_STRIP_HEIGHT = 44;

export type MouseMode = "touch" | "trackpad";

export interface Modifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
}

export const NO_MODIFIERS: Modifiers = {
  ctrl: false,
  alt: false,
  shift: false,
  win: false,
};

const MODIFIER_SYMS: [keyof Modifiers, number][] = [
  ["ctrl", 0xffe3],
  ["alt", 0xffe9],
  ["shift", 0xffe1],
  ["win", 0xffeb],
];

/** The keysyms to press, in order, for a key with the held modifiers. */
export function withModifiers(keysym: number, mods: Modifiers): number[] {
  return [...MODIFIER_SYMS.filter(([k]) => mods[k]).map(([, s]) => s), keysym];
}

export const CTRL_ALT_DEL = [0xffe3, 0xffe9, 0xffff];

const F_KEYS = Array.from({ length: 12 }, (_, i) => 0xffbe + i);

export function useRemoteColors() {
  const color = useThemeColor();
  return {
    bg: color("background") ?? "rgb(12,13,11)",
    card: color("card") ?? "rgb(24,25,23)",
    border: color("border") ?? "rgb(50,50,50)",
    fg: color("foreground") ?? "rgb(250,250,250)",
    muted: color("muted-foreground") ?? "rgb(164,164,164)",
    accent: color("accent-brand"),
  };
}

function useStripStyles() {
  const c = useRemoteColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        keyStrip: {
          position: "absolute",
          left: 0,
          right: 0,
          height: KEY_STRIP_HEIGHT,
          backgroundColor: c.bg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
        },
        scrollContent: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 4,
        },
        key: {
          height: 34,
          paddingHorizontal: 9,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 4,
        },
        keyText: { color: c.fg, fontSize: 12, fontWeight: "600" },
        divider: {
          width: 1,
          height: 22,
          backgroundColor: c.border,
          marginHorizontal: 2,
        },
        iconKey: {
          width: 36,
          height: 34,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          alignItems: "center",
          justifyContent: "center",
        },
      }),
    [c.bg, c.border, c.card, c.fg],
  );
  return { styles, c };
}

/** A strip key that can light up while it is held or on. */
export function StripKey({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const { styles, c } = useStripStyles();
  return (
    <TouchableOpacity
      style={[
        styles.key,
        active && { borderColor: c.accent, backgroundColor: c.accent },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.keyText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function StripDivider() {
  const { styles } = useStripStyles();
  return <View style={styles.divider} />;
}

/**
 * The always visible key strip: sticky modifiers, keyboard toggle, Esc, Tab,
 * arrows, navigation keys, Ctrl+Alt+Del, Win, F keys and settings. `send`
 * gets the keysyms to press in order, modifiers first.
 */
export function RemoteKeyStrip({
  bottom,
  keyboardOpen,
  onKeyboard,
  send,
  onSettings,
  children,
}: {
  bottom: number;
  keyboardOpen: boolean;
  onKeyboard: () => void;
  send: (keysyms: number[]) => void;
  onSettings: () => void;
  /** Extra keys after the modifiers, like held mouse buttons. */
  children?: React.ReactNode;
}) {
  const { styles, c } = useStripStyles();
  const [mods, setMods] = useState<Modifiers>(NO_MODIFIERS);
  const [showF, setShowF] = useState(false);
  const press = (k: number) => {
    send(withModifiers(k, mods));
    setMods(NO_MODIFIERS);
  };
  const toggle = (k: keyof Modifiers) => setMods((m) => ({ ...m, [k]: !m[k] }));
  const icon = (Icon: typeof ChevronLeft, k: number, label: string) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconKey}
      onPress={() => press(k)}
    >
      <Icon size={14} color={c.fg} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.keyStrip, { bottom }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scrollContent}
      >
        {(["ctrl", "alt", "shift", "win"] as const).map((k) => (
          <StripKey
            key={k}
            active={mods[k]}
            onPress={() => toggle(k)}
            label={
              k === "ctrl"
                ? "Ctrl"
                : k === "alt"
                  ? "Alt"
                  : k === "shift"
                    ? "Shift"
                    : "Win"
            }
          />
        ))}
        {children}
        <StripDivider />
        {keyboardOpen ? (
          <TouchableOpacity
            style={[
              styles.key,
              { borderColor: c.accent, backgroundColor: c.accent },
            ]}
            onPress={() => Keyboard.dismiss()}
          >
            <X size={13} color="#fff" />
            <Text style={[styles.keyText, { color: "#fff" }]}>Done</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Keyboard"
            style={styles.iconKey}
            onPress={onKeyboard}
          >
            <KeyboardIcon size={15} color={c.muted} />
          </TouchableOpacity>
        )}
        <StripDivider />
        <StripKey label="Esc" onPress={() => press(0xff1b)} />
        <StripKey label="Tab" onPress={() => press(0xff09)} />
        <StripDivider />
        {icon(ChevronLeft, 0xff51, "Left arrow")}
        {icon(ChevronUp, 0xff52, "Up arrow")}
        {icon(ChevronDown, 0xff54, "Down arrow")}
        {icon(ChevronRight, 0xff53, "Right arrow")}
        <StripDivider />
        {[
          { label: "Home", k: 0xff50 },
          { label: "End", k: 0xff57 },
          { label: "PgUp", k: 0xff55 },
          { label: "PgDn", k: 0xff56 },
          { label: "Bksp", k: 0xff08 },
          { label: "Del", k: 0xffff },
          { label: "Enter", k: 0xff0d },
        ].map(({ label, k }) => (
          <StripKey key={label} label={label} onPress={() => press(k)} />
        ))}
        <StripDivider />
        <StripKey label="CAD" onPress={() => send(CTRL_ALT_DEL)} />
        <StripKey label="Win" onPress={() => send([0xffeb])} />
        <StripDivider />
        <StripKey
          label="Fn"
          active={showF}
          onPress={() => setShowF((v) => !v)}
        />
        {showF &&
          F_KEYS.map((ks, i) => (
            <StripKey key={ks} label={`F${i + 1}`} onPress={() => press(ks)} />
          ))}
        <StripDivider />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.iconKey}
          onPress={onSettings}
        >
          <Settings2 size={15} color={c.muted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/** Mouse mode and zoom, plus any extra rows a view adds. */
export function RemoteSettingsSheet({
  visible,
  onClose,
  mouseMode,
  onMouseMode,
  zoom,
  onResetZoom,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  mouseMode: MouseMode;
  onMouseMode: (m: MouseMode) => void;
  zoom: number;
  onResetZoom: () => void;
  children?: React.ReactNode;
}) {
  const c = useRemoteColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
          gap: 8,
        },
        label: {
          color: c.muted,
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 1,
        },
        desc: { color: c.muted, fontSize: 11, lineHeight: 16 },
        zoomRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        zoomLabel: { color: c.muted, fontSize: 12, flex: 1 },
      }),
    [c.border, c.muted],
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Remote Settings"
      scroll={false}
    >
      <View style={styles.section}>
        <Text style={styles.label}>Mouse Mode</Text>
        <Tabs
          options={[
            { id: "touch" as MouseMode, label: "Touch" },
            { id: "trackpad" as MouseMode, label: "Trackpad" },
          ]}
          value={mouseMode}
          onChange={onMouseMode}
        />
        <Text style={styles.desc}>
          {mouseMode === "touch"
            ? "Tap where you want to click. Hold for a right click, drag to drag."
            : "Drag to move the pointer. Tap to click, two finger tap to right click, tap then drag to drag."}
        </Text>
      </View>
      <View style={styles.zoomRow}>
        <Text style={styles.zoomLabel}>
          Zoom: {zoom.toFixed(1)}x. Pinch anywhere to zoom
        </Text>
        <Button variant="muted" size="sm" onPress={onResetZoom}>
          Reset
        </Button>
      </View>
      {children}
    </Sheet>
  );
}

/** Asks for a login that is used once and never saved. */
export function RdpSignInSheet({
  visible,
  title = "RDP sign-in",
  showDomain = true,
  description,
  initialUsername,
  initialDomain,
  onCancel,
  onConnect,
}: {
  visible: boolean;
  title?: string;
  /** VNC has no domain. */
  showDomain?: boolean;
  description: string;
  initialUsername: string;
  initialDomain: string;
  onCancel: () => void;
  onConnect: (credentials: RdpCredentials) => void;
}) {
  const c = useRemoteColors();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState(initialDomain);
  const [shownFor, setShownFor] = useState(false);
  // Start fresh each time it opens.
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) {
      setUsername(initialUsername);
      setDomain(initialDomain);
      setPassword("");
    }
  }
  return (
    <Sheet
      scroll
      visible={visible}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <View className="flex-row justify-end gap-2">
          <Button variant="muted" onPress={onCancel}>
            Cancel
          </Button>
          <Button
            variant="muted"
            disabled={showDomain && !username.trim()}
            onPress={() => {
              const credentials = {
                username: username.trim(),
                password,
                domain,
              };
              setPassword("");
              Keyboard.dismiss();
              onConnect(credentials);
            }}
          >
            Connect
          </Button>
        </View>
      }
    >
      <SheetBody>
        <View className="gap-3">
          <Text style={{ color: c.fg }}>Username</Text>
          <Input
            accessibilityLabel="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {showDomain ? (
            <>
              <Text style={{ color: c.fg }}>Domain (optional)</Text>
              <Input
                accessibilityLabel="Domain"
                value={domain}
                onChangeText={setDomain}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : null}
          <Text style={{ color: c.fg }}>Password</Text>
          <Input
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </SheetBody>
    </Sheet>
  );
}
