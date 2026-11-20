import { Layers, Plus, SquareTerminal } from "lucide-react-native";
import { Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { TmuxWindow } from "./tmux";
import { t } from "@/i18n";

export interface PickSession {
  name: string;
  windows?: number;
  attached?: number;
  /** Unix seconds. */
  activity?: number;
}

function ago(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (mins < 1) return t("terminal.tmux.tmuxSheets.activeNow");
  if (mins < 60) {
    return t("terminal.tmux.tmuxSheets.activeMinAgo", { count: mins });
  }
  const hours = Math.round(mins / 60);
  return hours < 48
    ? t("terminal.tmux.tmuxSheets.activeHoursAgo", { count: hours })
    : t("terminal.tmux.tmuxSheets.activeDaysAgo", {
        count: Math.round(hours / 24),
      });
}

export function sessionDetail(s: PickSession): string {
  return [
    s.windows
      ? t("terminal.tmux.tmuxSheets.windowCount", { count: s.windows })
      : "",
    s.attached
      ? t("terminal.tmux.tmuxSheets.attached", { count: s.attached })
      : "",
    ago(s.activity),
  ]
    .filter(Boolean)
    .join(" | ");
}

/** Which tmux session to open, when the host has more than one. */
export function TmuxPickerSheet({
  sessions,
  allowPlain,
  onPick,
}: {
  sessions: PickSession[] | null;
  /** Offer the plain shell too. */
  allowPlain: boolean;
  /** A name, "" for a new session, or null for the plain shell. */
  onPick: (name: string | null) => void;
}) {
  const color = useThemeColor();
  return (
    <Sheet
      visible={sessions !== null}
      onClose={() => onPick(allowPlain ? null : "")}
      title={t("terminal.tmux.tmuxSheets.openATmuxSession")}
      scroll
    >
      {(sessions ?? []).map((s) => (
        <SheetRow
          key={s.name}
          icon={<Layers size={16} color={color("foreground")} />}
          label={s.name}
          description={sessionDetail(s)}
          onPress={() => onPick(s.name)}
        />
      ))}
      <SheetRow
        icon={<Plus size={16} color={color("foreground")} />}
        label={t("terminal.tmux.tmuxSheets.newSession")}
        onPress={() => onPick("")}
      />
      {allowPlain ? (
        <SheetRow
          icon={<SquareTerminal size={16} color={color("foreground")} />}
          label={t("terminal.tmux.tmuxSheets.plainShell")}
          onPress={() => onPick(null)}
        />
      ) : null}
    </Sheet>
  );
}

/** The tmux windows of a session. Tap one to switch to it. */
export function TmuxWindowsSheet({
  windows,
  onPick,
  onNew,
  onClose,
}: {
  windows: TmuxWindow[] | null;
  onPick: (window: TmuxWindow) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const color = useThemeColor();
  return (
    <Sheet
      visible={windows !== null}
      onClose={onClose}
      title={t("terminal.tmux.tmuxSheets.tmuxWindows")}
      scroll
    >
      {(windows ?? []).map((w) => (
        <SheetRow
          key={`${w.session}:${w.index}`}
          label={`${w.index}: ${w.name}`}
          description={w.session}
          selected={w.active}
          onPress={() => onPick(w)}
        />
      ))}
      <SheetRow
        icon={<Plus size={16} color={color("foreground")} />}
        label={t("terminal.tmux.tmuxSheets.newWindow")}
        onPress={onNew}
      />
    </Sheet>
  );
}
