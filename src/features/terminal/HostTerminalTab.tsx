import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { ChoiceRow, FakeSwitch, Input, Label, SettingRow, Text } from "@/ui";
import { TERMINAL_THEMES } from "@/constants/terminal-themes";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useRepositories } from "@/core/data/hooks";
import type {
  HostFormEditor,
  HostFormTabProps,
  HostFormValues,
} from "@/core/features/types";
import type { Snippet, SSHHost, SSHHostData, TerminalConfig } from "@/types";
import { BELL_STYLES, CURSOR_STYLES, TERMINAL_FONTS } from "./settings";
import { PASSWORD_FILL_PREF } from "./password-fill";

type Config = Partial<TerminalConfig>;
type EnvVar = { key: string; value: string };

const PHONE = "phone";
const withPhone = <T extends string>(
  options: readonly { value: T; label: string }[],
) => [{ value: PHONE, label: "App setting" }, ...options];

const THEMES = withPhone(
  Object.entries(TERMINAL_THEMES)
    .filter(([id]) => id !== "termix")
    .map(([id, theme]) => ({ value: id, label: theme.name })),
);
const FONTS = withPhone(TERMINAL_FONTS);
const CURSORS = withPhone(CURSOR_STYLES);
const BELLS = withPhone(BELL_STYLES);
const BACKSPACE = [
  { value: "normal", label: "Delete (^?)" },
  { value: "control-h", label: "Control H (^H)" },
] as const;

const SWITCHES: {
  key: keyof TerminalConfig;
  label: string;
  description?: string;
  fallback: boolean;
}[] = [
  {
    key: "useSSHTitle",
    label: "Tab title from the shell",
    description: "Programs can set the tab title",
    fallback: false,
  },
  {
    key: "autoTmux",
    label: "Open tmux",
    description: "Attach to a tmux session, or start one",
    fallback: false,
  },
  {
    key: "autoReconnect",
    label: "Reconnect on drop",
    fallback: false,
  },
  {
    key: "keepOpenOnExit",
    label: "Keep tab open on exit",
    description: "Press Enter to connect again",
    fallback: false,
  },
  {
    key: "enableCommandHistory",
    label: "Save command history",
    fallback: true,
  },
  {
    key: "passwordPromptAutoFill",
    label: "Offer to fill password prompts",
    fallback: true,
  },
  {
    key: "sudoPasswordAutoFill",
    label: "Offer to fill sudo prompts",
    description: "Uses the sudo password from the SSH tab",
    fallback: false,
  },
];

export function envOf(options: Record<string, unknown> | undefined): EnvVar[] {
  const list = options?.environmentVariables;
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e === "object")
    .map((e) => ({ key: String(e.key ?? ""), value: String(e.value ?? "") }));
}

function TerminalTab({ host, value, onChange }: HostFormTabProps) {
  const color = useThemeColor();
  const repos = useRepositories();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  // A phone choice, saved right away and never synced.
  const [alwaysFill, setAlwaysFill] = useState(false);
  useEffect(() => {
    if (!host) return;
    repos.hostPrefs
      .get(host, PASSWORD_FILL_PREF)
      .then((v) => setAlwaysFill(v === "always"))
      .catch(() => {});
  }, [host, repos]);
  const config = (value.terminalConfig ?? {}) as Config;
  const options = (value.sshOptions ?? {}) as Record<string, unknown>;
  const env = envOf(options);

  useEffect(() => {
    repos.snippets
      .list()
      .then(setSnippets)
      .catch(() => {});
  }, [repos]);

  const setConfig = (patch: Config) =>
    onChange({ terminalConfig: { ...config, ...patch } });
  const setOptions = (patch: Record<string, unknown>) =>
    onChange({ sshOptions: { ...options, ...patch } });
  const pick = (key: keyof TerminalConfig) => (next: string) =>
    setConfig({ [key]: next === PHONE ? undefined : next } as Config);
  const setEnv = (next: EnvVar[]) => setOptions({ environmentVariables: next });

  // A local copy keeps snippets by syncId, a server by its own id.
  const snippetKey = (s: Snippet) =>
    repos.source === "local" ? (s.syncId ?? String(s.id)) : String(s.id);
  const startup = config.startupSnippetId;
  const startupOptions = [
    { value: "", label: "None" },
    ...snippets.map((s) => ({ value: snippetKey(s), label: s.name })),
  ];

  const keepalive = options.keepaliveInterval;
  const keepaliveCount = options.keepaliveCountMax;

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Heading>Look</Heading>
        <ChoiceRow
          label="Theme"
          value={(config.theme as string) ?? PHONE}
          options={THEMES}
          onChange={pick("theme")}
        />
        <ChoiceRow
          label="Font"
          value={(config.fontFamily as string) ?? PHONE}
          options={FONTS}
          onChange={pick("fontFamily")}
        />
        <ChoiceRow
          label="Cursor"
          value={(config.cursorStyle as string) ?? PHONE}
          options={CURSORS}
          onChange={pick("cursorStyle")}
        />
        <ChoiceRow
          label="Bell"
          value={(config.bellStyle as string) ?? PHONE}
          options={BELLS}
          onChange={pick("bellStyle")}
        />
        <SettingRow label="Scrollback lines" last>
          <Input
            size="sm"
            containerClassName="w-24"
            className="text-right"
            keyboardType="number-pad"
            placeholder="App"
            value={config.scrollback ? String(config.scrollback) : ""}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              setConfig({ scrollback: Number.isFinite(n) ? n : undefined });
            }}
          />
        </SettingRow>
      </View>

      <View className="gap-1">
        <Heading>Behavior</Heading>
        {SWITCHES.map((row) => (
          <SettingRow
            key={row.key}
            label={row.label}
            description={row.description}
          >
            <FakeSwitch
              checked={(config[row.key] as boolean | undefined) ?? row.fallback}
              onChange={(v) => setConfig({ [row.key]: v } as Config)}
            />
          </SettingRow>
        ))}
        <ChoiceRow
          label="Backspace sends"
          value={config.backspaceMode ?? "normal"}
          options={BACKSPACE}
          onChange={(v) => setConfig({ backspaceMode: v })}
        />
        <ChoiceRow
          label="Startup snippet"
          description="Runs once the shell is ready"
          value={startup == null ? "" : String(startup)}
          options={startupOptions}
          onChange={(v) => {
            if (!v) return setConfig({ startupSnippetId: null });
            setConfig({
              startupSnippetId: repos.source === "local" ? v : Number(v),
            });
          }}
          last={!host}
        />
        {host ? (
          <SettingRow
            label="Fill without asking"
            description="On this phone only, once you picked Always fill"
            last
          >
            <FakeSwitch
              checked={alwaysFill}
              onChange={(v) => {
                setAlwaysFill(v);
                repos.hostPrefs
                  .set(host, PASSWORD_FILL_PREF, v ? "always" : null)
                  .catch(() => {});
              }}
            />
          </SettingRow>
        ) : null}
      </View>

      <View className="gap-1">
        <Heading>Connection</Heading>
        <SettingRow
          label="Keepalive"
          description="Seconds between pings, 0 turns it off"
        >
          <Input
            size="sm"
            containerClassName="w-24"
            className="text-right"
            keyboardType="number-pad"
            placeholder="Default"
            accessibilityLabel="Keepalive seconds"
            value={keepalive == null ? "" : String(keepalive)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              setOptions({
                keepaliveInterval: Number.isFinite(n) ? n : undefined,
              });
            }}
          />
        </SettingRow>
        <SettingRow
          label="Missed pings"
          description="Drop the connection after this many go unanswered"
          last
        >
          <Input
            size="sm"
            containerClassName="w-24"
            className="text-right"
            keyboardType="number-pad"
            placeholder="Default"
            accessibilityLabel="Missed pings before drop"
            value={keepaliveCount == null ? "" : String(keepaliveCount)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              setOptions({
                keepaliveCountMax: Number.isFinite(n) && n > 0 ? n : undefined,
              });
            }}
          />
        </SettingRow>
      </View>

      <View className="gap-2">
        <Heading>Environment</Heading>
        {env.map((item, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <Input
              size="sm"
              containerClassName="flex-1"
              placeholder="NAME"
              autoCapitalize="characters"
              autoCorrect={false}
              value={item.key}
              onChangeText={(t) =>
                setEnv(env.map((e, j) => (j === i ? { ...e, key: t } : e)))
              }
            />
            <Input
              size="sm"
              containerClassName="flex-1"
              placeholder="value"
              autoCapitalize="none"
              autoCorrect={false}
              value={item.value}
              onChangeText={(t) =>
                setEnv(env.map((e, j) => (j === i ? { ...e, value: t } : e)))
              }
            />
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove variable"
              onPress={() => setEnv(env.filter((_, j) => j !== i))}
              className="h-8 w-8 items-center justify-center"
            >
              <Trash2 size={14} color={color("muted-foreground")} />
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setEnv([...env, { key: "", value: "" }])}
          className="min-h-11 flex-row items-center gap-2 border border-dashed border-border px-3"
        >
          <Plus size={14} color={color("muted-foreground")} />
          <Text className="text-row text-muted-foreground">Add variable</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return <Label>{children}</Label>;
}

export function readHostTerminal(host: SSHHost | null): HostFormValues {
  return {
    terminalConfig: { ...(host?.terminalConfig ?? {}) },
    sshOptions: { ...(host?.sshOptions ?? {}) },
  };
}

export function writeHostTerminal(value: HostFormValues, payload: SSHHostData) {
  payload.terminalConfig = value.terminalConfig as Config;
  const options = { ...((value.sshOptions ?? {}) as Record<string, unknown>) };
  const env = envOf(options).filter((e) => e.key.trim());
  options.environmentVariables = env.map((e) => ({
    key: e.key.trim(),
    value: e.value,
  }));
  if (options.keepaliveInterval === undefined) delete options.keepaliveInterval;
  if (options.keepaliveCountMax === undefined) delete options.keepaliveCountMax;
  payload.sshOptions = options;
}

export const hostTerminalEditor: HostFormEditor = {
  read: readHostTerminal,
  write: writeHostTerminal,
  component: TerminalTab,
};
