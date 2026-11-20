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
import { deviceWord } from "@/utils/device-word";
import { t as tr } from "@/i18n";

type Config = Partial<TerminalConfig>;
type EnvVar = { key: string; value: string };

const PHONE = "phone";
const withPhone = <T extends string>(
  options: readonly { value: T; label: string }[],
) => [
  { value: PHONE, label: tr("terminal.hostTerminalTab.appSetting") },
  ...options,
];

const THEMES = withPhone(
  Object.entries(TERMINAL_THEMES)
    .filter(([id]) => id !== "termix")
    .map(([id, theme]) => ({ value: id, label: theme.name })),
);
const FONTS = withPhone(TERMINAL_FONTS);
const CURSORS = withPhone(CURSOR_STYLES);
const BELLS = withPhone(BELL_STYLES);
const BACKSPACE = [
  { value: "normal", label: tr("terminal.hostTerminalTab.delete") },
  { value: "control-h", label: tr("terminal.hostTerminalTab.controlHH") },
] as const;

const SWITCHES: {
  key: keyof TerminalConfig;
  label: string;
  description?: string;
  fallback: boolean;
}[] = [
  {
    key: "useSSHTitle",
    label: tr("terminal.hostTerminalTab.tabTitleFromTheShell"),
    description: tr("terminal.hostTerminalTab.programsCanSetTheTab"),
    fallback: false,
  },
  {
    key: "autoTmux",
    label: tr("terminal.hostTerminalTab.openTmux"),
    description: tr("terminal.hostTerminalTab.attachToATmuxSession"),
    fallback: false,
  },
  {
    key: "autoReconnect",
    label: tr("terminal.hostTerminalTab.reconnectOnDrop"),
    fallback: false,
  },
  {
    key: "keepOpenOnExit",
    label: tr("terminal.hostTerminalTab.keepTabOpenOnExit"),
    description: tr("terminal.hostTerminalTab.pressEnterToConnectAgain"),
    fallback: false,
  },
  {
    key: "enableCommandHistory",
    label: tr("terminal.hostTerminalTab.saveCommandHistory"),
    fallback: true,
  },
  {
    key: "passwordPromptAutoFill",
    label: tr("terminal.hostTerminalTab.offerToFillPasswordPrompts"),
    fallback: true,
  },
  {
    key: "sudoPasswordAutoFill",
    label: tr("terminal.hostTerminalTab.offerToFillSudoPrompts"),
    description: tr("terminal.hostTerminalTab.usesTheSudoPasswordFrom"),
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
    { value: "", label: tr("terminal.hostTerminalTab.none") },
    ...snippets.map((s) => ({ value: snippetKey(s), label: s.name })),
  ];

  const keepalive = options.keepaliveInterval;
  const keepaliveCount = options.keepaliveCountMax;

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Heading>{tr("terminal.hostTerminalTab.look")}</Heading>
        <ChoiceRow
          label={tr("terminal.hostTerminalTab.theme")}
          value={(config.theme as string) ?? PHONE}
          options={THEMES}
          onChange={pick("theme")}
        />
        <ChoiceRow
          label={tr("terminal.hostTerminalTab.font")}
          value={(config.fontFamily as string) ?? PHONE}
          options={FONTS}
          onChange={pick("fontFamily")}
        />
        <ChoiceRow
          label={tr("terminal.hostTerminalTab.cursor")}
          value={(config.cursorStyle as string) ?? PHONE}
          options={CURSORS}
          onChange={pick("cursorStyle")}
        />
        <ChoiceRow
          label={tr("terminal.hostTerminalTab.bell")}
          value={(config.bellStyle as string) ?? PHONE}
          options={BELLS}
          onChange={pick("bellStyle")}
        />
        <SettingRow label={tr("terminal.hostTerminalTab.scrollbackLines")} last>
          <Input
            size="sm"
            containerClassName="w-24"
            className="text-right"
            keyboardType="number-pad"
            placeholder={tr("terminal.hostTerminalTab.app")}
            value={config.scrollback ? String(config.scrollback) : ""}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              setConfig({ scrollback: Number.isFinite(n) ? n : undefined });
            }}
          />
        </SettingRow>
      </View>

      <View className="gap-1">
        <Heading>{tr("terminal.hostTerminalTab.behavior")}</Heading>
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
          label={tr("terminal.hostTerminalTab.backspaceSends")}
          value={config.backspaceMode ?? "normal"}
          options={BACKSPACE}
          onChange={(v) => setConfig({ backspaceMode: v })}
        />
        <ChoiceRow
          label={tr("terminal.hostTerminalTab.startupSnippet")}
          description={tr("terminal.hostTerminalTab.runsOnceTheShellIs")}
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
            label={tr("terminal.hostTerminalTab.fillWithoutAsking")}
            description={tr("terminal.hostTerminalTab.onThisOnlyOnceYou", {
              deviceWord,
            })}
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
        <Heading>{tr("terminal.hostTerminalTab.connection")}</Heading>
        <SettingRow
          label={tr("terminal.hostTerminalTab.keepalive")}
          description={tr("terminal.hostTerminalTab.secondsBetweenPings0Turns")}
        >
          <Input
            size="sm"
            containerClassName="w-24"
            className="text-right"
            keyboardType="number-pad"
            placeholder={tr("terminal.hostTerminalTab.default")}
            accessibilityLabel={tr("terminal.hostTerminalTab.keepaliveSeconds")}
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
          label={tr("terminal.hostTerminalTab.missedPings")}
          description={tr(
            "terminal.hostTerminalTab.dropTheConnectionAfterThis",
          )}
          last
        >
          <Input
            size="sm"
            containerClassName="w-24"
            className="text-right"
            keyboardType="number-pad"
            placeholder={tr("terminal.hostTerminalTab.default")}
            accessibilityLabel={tr(
              "terminal.hostTerminalTab.missedPingsBeforeDrop",
            )}
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
        <Heading>{tr("terminal.hostTerminalTab.environment")}</Heading>
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
              accessibilityLabel={tr("terminal.hostTerminalTab.removeVariable")}
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
          <Text className="text-row text-muted-foreground">
            {tr("terminal.hostTerminalTab.addVariable")}
          </Text>
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
