import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useRepositories } from "@/core/data/hooks";
import { emptyIndex, type DefaultsIndex } from "@/core/hosts/defaults/resolve";
import type { DefaultsTarget } from "@/core/hosts/defaults/store";
import type { Credential } from "@/types";
import { toast } from "@/utils/toast";
import {
  Button,
  ChoiceRow,
  EmptyState,
  FakeSwitch,
  Input,
  PromptSheet,
  SettingRow,
  Sheet,
  SheetBody,
  SheetRow,
  Text,
} from "@/ui";
import {
  describeRow,
  envText,
  keyRows,
  parseEnvText,
  parseRowText,
  pluginRows,
  sourceLabel,
  type KeyRow,
} from "./model";

const USER = "__user__";

const targetOf = (choice: string): DefaultsTarget =>
  choice === USER ? { level: "user" } : { level: "folder", folder: choice };

export default function HostDefaults() {
  const router = useRouter();
  const color = useThemeColor();
  const repos = useRepositories();
  const store = repos.hostDefaults;
  const [index, setIndex] = useState<DefaultsIndex>(emptyIndex());
  const [logins, setLogins] = useState<Credential[]>([]);
  const [choice, setChoice] = useState(USER);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [envDraft, setEnvDraft] = useState("");
  const [authOpen, setAuthOpen] = useState<KeyRow | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    setIndex(await store.index());
    setLogins(await repos.credentials.list().catch(() => []));
  }, [store, repos]);

  useEffect(() => {
    void load();
    return store?.subscribe(() => void load());
  }, [load, store]);

  const target = useMemo(() => targetOf(choice), [choice]);
  const rows = useMemo(() => keyRows(index, target), [index, target]);
  const extra = useMemo(() => pluginRows(index, target), [index, target]);
  const folderNames = useMemo(
    () => [...index.folders.keys()].sort((a, b) => a.localeCompare(b)),
    [index],
  );
  const loginName = (id: number) => logins.find((l) => l.id === id)?.name;

  const save = async (row: KeyRow, value: unknown) => {
    try {
      await store!.set(target, row.fullKey, value);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the default");
    }
  };
  const reset = async (row: KeyRow) => {
    try {
      await store!.unset(target, row.fullKey);
    } catch (e: any) {
      toast.error(e?.message || "Could not reset the default");
    }
  };

  const open = (row: KeyRow) => {
    if (row.kind === "env") setEnvDraft(envText(row.value));
    if (row.kind === "auth") return setAuthOpen(row);
    setEditing(row);
  };

  const adminCount = index.admin.size;

  const header = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
    >
      <ArrowLeft size={20} color={color("foreground")} />
    </Pressable>
  );

  if (!store) {
    return (
      <Screen
        title="Host defaults"
        subtitle="New hosts start from these"
        headerLeft={header}
      >
        <EmptyState
          title="Managed on the server"
          hint="Defaults for this server are set in the web app."
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Host defaults"
      subtitle="New hosts start from these"
      headerLeft={header}
    >
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <View className="border border-border bg-card px-3">
          <ChoiceRow
            label="Level"
            description="Your defaults, or one folder's"
            value={choice}
            options={[
              { value: USER, label: "My defaults" },
              ...folderNames.map((name) => ({ value: name, label: name })),
            ]}
            onChange={setChoice}
            last
          />
        </View>
        <Text className="text-meta text-muted-foreground">
          A folder wins over your defaults, and your defaults win over the
          server&apos;s. A host keeps any value you set on it yourself.
          {adminCount > 0 ? ` The server sets ${adminCount}.` : ""}
        </Text>
        <View className="border border-border bg-card px-3">
          {rows.map((row, i) => (
            <Row
              key={row.fullKey}
              row={row}
              last={i === rows.length - 1}
              loginName={loginName}
              onOpen={() => open(row)}
              onSwitch={(v) => void save(row, v)}
              onReset={() => void reset(row)}
            />
          ))}
        </View>
        {extra.length > 0 ? (
          <View className="border border-border bg-card px-3">
            {extra.map((entry, i) => (
              <SettingRow
                key={entry.fullKey}
                label={entry.fullKey}
                last={i === extra.length - 1}
              >
                <Text
                  className="text-row text-muted-foreground"
                  numberOfLines={1}
                >
                  {entry.text}
                </Text>
              </SettingRow>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PromptSheet
        visible={!!editing && editing.kind !== "env"}
        title={editing?.label ?? ""}
        description={editing?.hint}
        defaultValue={
          editing ? String(editing.own ? (editing.value ?? "") : "") : ""
        }
        validate={(v) => parseRowText(editing?.kind ?? "text", v) !== null}
        onCancel={() => setEditing(null)}
        onSubmit={(v) => {
          const row = editing!;
          setEditing(null);
          void save(row, parseRowText(row.kind, v));
        }}
      />
      <Sheet
        visible={editing?.kind === "env"}
        onClose={() => setEditing(null)}
        title={editing?.label ?? ""}
        description={editing?.hint}
        footer={
          <Button
            onPress={() => {
              const row = editing!;
              setEditing(null);
              void save(row, parseEnvText(envDraft));
            }}
          >
            Save
          </Button>
        }
      >
        <SheetBody>
          <Input
            value={envDraft}
            onChangeText={setEnvDraft}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="LANG=en_US.UTF-8"
            style={{ minHeight: 120 }}
          />
        </SheetBody>
      </Sheet>
      <Sheet
        visible={!!authOpen}
        onClose={() => setAuthOpen(null)}
        title="Authentication"
        scroll
      >
        <SheetRow
          label="None"
          selected={false}
          onPress={() => {
            const row = authOpen!;
            setAuthOpen(null);
            void save(row, { authType: "none" });
          }}
        />
        {logins.map((login) => (
          <SheetRow
            key={login.id}
            label={login.name}
            description={login.username}
            selected={false}
            onPress={() => {
              const row = authOpen!;
              setAuthOpen(null);
              void save(row, {
                authType: "credential",
                credentialId: login.id,
              });
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

function Row({
  row,
  last,
  loginName,
  onOpen,
  onSwitch,
  onReset,
}: {
  row: KeyRow;
  last: boolean;
  loginName: (id: number) => string | undefined;
  onOpen: () => void;
  onSwitch: (value: boolean) => void;
  onReset: () => void;
}) {
  const color = useThemeColor();
  const note = row.own
    ? row.hint
    : [sourceLabel(row.source), row.hint].filter(Boolean).join(" | ");
  return (
    <SettingRow label={row.label} description={note || undefined} last={last}>
      <View className="flex-row items-center gap-2">
        {row.kind === "switch" ? (
          <FakeSwitch
            checked={Boolean(row.value)}
            onChange={onSwitch}
            accessibilityLabel={row.label}
          />
        ) : row.kind === "readonly" ? (
          <Text className="text-row text-muted-foreground">
            {describeRow(row, loginName)}
          </Text>
        ) : (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${describeRow(row, loginName)}`}
            className="min-h-11 flex-row items-center gap-1"
          >
            <Text
              weight={row.own ? "medium" : "regular"}
              className={`text-row ${row.own ? "text-foreground" : "text-muted-foreground"}`}
              numberOfLines={1}
            >
              {describeRow(row, loginName)}
            </Text>
            <ChevronRight size={14} color={color("muted-foreground")} />
          </Pressable>
        )}
        {row.own && row.kind !== "readonly" ? (
          <Button variant="ghost" size="sm" onPress={onReset}>
            Reset
          </Button>
        ) : null}
      </View>
    </SettingRow>
  );
}
