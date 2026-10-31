import { Layers, Plus, SquareTerminal } from "lucide-react-native";
import { Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { TmuxWindow } from "./tmux";

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
  if (mins < 1) return "active now";
  if (mins < 60) return `active ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48
    ? `active ${hours} h ago`
    : `active ${Math.round(hours / 24)} days ago`;
}

export function sessionDetail(s: PickSession): string {
  return [
    s.windows ? `${s.windows} ${s.windows === 1 ? "window" : "windows"}` : "",
    s.attached ? `${s.attached} attached` : "",
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
      title="Open a tmux session"
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
        label="New session"
        onPress={() => onPick("")}
      />
      {allowPlain ? (
        <SheetRow
          icon={<SquareTerminal size={16} color={color("foreground")} />}
          label="Plain shell"
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
      title="tmux windows"
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
        label="New window"
        onPress={onNew}
      />
    </Sheet>
  );
}
