import {
  Bell,
  Blocks,
  Database,
  EyeOff,
  Info,
  Keyboard,
  Palette,
  Shield,
  SquareTerminal,
  Users,
} from "lucide-react-native";
import type { SettingsSectionDef } from "./types";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: "accounts",
    title: t("settings.schema.sections.accountsAndSync"),
    description: t("settings.schema.sections.thisDeviceLinkedServersAnd"),
    icon: Users,
    order: 10,
  },
  {
    id: "appearance",
    title: t("settings.schema.sections.appearance"),
    description: t("settings.schema.sections.themeAccentTextSizeAnd"),
    icon: Palette,
    order: 20,
  },
  {
    id: "terminal",
    title: t("settings.schema.sections.terminal"),
    description: t("settings.schema.sections.fontColorsAndBackgroundSessions"),
    icon: SquareTerminal,
    order: 30,
  },
  {
    id: "keyboard",
    title: t("settings.schema.sections.keyboard"),
    description: t("settings.schema.sections.keyRowsAndShortcuts"),
    icon: Keyboard,
    order: 40,
  },
  {
    id: "security",
    title: t("settings.schema.sections.security"),
    description: t("settings.schema.sections.appLockFaceIdAnd"),
    icon: Shield,
    order: 50,
  },
  {
    id: "notifications",
    title: t("settings.schema.sections.notifications"),
    description: t("settings.schema.sections.alertsFromYourServer"),
    icon: Bell,
    order: 60,
  },
  {
    id: "privacy",
    title: t("settings.schema.sections.privacyAndUsageStatistics"),
    description: t("settings.schema.sections.whatStaysOnThis", { deviceWord }),
    icon: EyeOff,
    order: 70,
  },
  {
    id: "plugins",
    title: t("settings.schema.sections.plugins"),
    description: t("settings.schema.sections.whatTheServerAddsTo"),
    icon: Blocks,
    order: 80,
  },
  {
    id: "backup",
    title: t("settings.schema.sections.backupAndData"),
    description: t("settings.schema.sections.backUpRestoreImportAnd"),
    icon: Database,
    order: 90,
  },
  {
    id: "about",
    title: t("settings.schema.sections.aboutAndLogs"),
    description: t("settings.schema.sections.versionAndLogsForBug"),
    icon: Info,
    order: 100,
  },
];
