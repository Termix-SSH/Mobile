import type { ComponentType } from "react";
import type { FeatureIcon, SettingsSectionId } from "@/core/features";

export type { SettingsSectionId };

/** What Settings knows about the phone and the active account. */
export interface SettingsEnv {
  /** The active account is a server and it is signed in. */
  signedIn: boolean;
  /** The active account is a linked server. */
  hasServer: boolean;
  isAdmin: boolean;
  os: string;
  widgets: boolean;
  /** App Lock is turned on. */
  appLock: boolean;
  /** Ids of the plugins running on the active server. */
  plugins: string[];
}

export interface SettingsSectionDef {
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: FeatureIcon;
  order: number;
}

/**
 * One setting. With `href` it is a row that opens a screen. With `Control`
 * it draws itself (a switch, a picker) and the fields here only feed search.
 */
export interface SettingsItemDef {
  id: string;
  section: SettingsSectionId;
  label: string;
  description?: string;
  keywords?: string[];
  order: number;
  icon: FeatureIcon;
  href?: string;
  Control?: ComponentType;
  destructive?: boolean;
  when?: (env: SettingsEnv) => boolean;
}

export interface SettingsGroup {
  section: SettingsSectionDef;
  items: SettingsItemDef[];
}
