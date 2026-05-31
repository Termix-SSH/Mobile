export type KeyCategory =
  | "modifier"
  | "navigation"
  | "function"
  | "number"
  | "symbol"
  | "operator"
  | "punctuation"
  | "action"
  | "shortcut"
  | "arrow"
  | "macro";

export type KeyWidth = "narrow" | "normal" | "wide" | "full";

export type KeySize = "small" | "medium" | "large";

export type PresetType =
  | "default"
  | "minimal"
  | "developer"
  | "sysadmin"
  | "compact"
  | "custom";

export interface KeyConfig {
  id: string;
  label: string;
  value: string;
  category: KeyCategory;
  width?: KeyWidth;
  visible?: boolean;
  isModifier?: boolean;
  description?: string;
}

export interface KeyboardRow {
  id: string;
  category: string;
  label: string;
  visible: boolean;
  keys: KeyConfig[];
}

export interface TopBarConfig {
  pinnedKeys: KeyConfig[];
  keys: KeyConfig[];
}

export interface FullKeyboardConfig {
  rows: KeyboardRow[];
}

export interface KeyboardSettings {
  keySize: KeySize;
  compactMode: boolean;
  hapticFeedback: boolean;
  showHints: boolean;
}

export interface KeyboardCustomization {
  preset: PresetType;
  version: number;
  topBar: TopBarConfig;
  fullKeyboard: FullKeyboardConfig;
  settings: KeyboardSettings;
}

export interface PresetDefinition {
  id: PresetType;
  name: string;
  description: string;
  topBar: TopBarConfig;
  fullKeyboard: FullKeyboardConfig;
}
