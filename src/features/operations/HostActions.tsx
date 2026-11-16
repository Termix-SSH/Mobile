import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Zap } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useActiveClient } from "@/core/accounts";
import { useRepositories } from "@/core/data/hooks";
import { serverHostId } from "@/core/sync";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import {
  Badge,
  Button,
  ChoiceRow,
  EmptyState,
  FakeSwitch,
  Field,
  Input,
  ListRow,
  SettingRow,
  Text,
  useConfirm,
} from "@/ui";
import {
  appliesTo,
  errorText,
  getCatalog,
  getTargets,
  runAction,
  STATE_LABELS,
  type Action,
  type Outcome,
} from "./api";

type Values = Record<string, unknown>;

function initial(action: Action): Values {
  const values: Values = {};
  for (const field of action.inputs) {
    if (field.default !== undefined) values[field.key] = field.default;
  }
  return values;
}

function clean(values: Values): Values {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== "" && value != null),
  );
}

/** One action's form: its target, its inputs, a dry run and a run button. */
function ActionForm({
  action,
  hostId,
  onDone,
}: {
  action: Action;
  hostId: number;
  onDone: () => void;
}) {
  const client = useActiveClient();
  const confirm = useConfirm();
  const [values, setValues] = useState<Values>(() => initial(action));
  const [target, setTarget] = useState("");
  const [targets, setTargets] = useState<{ key: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!client || !action.resource) return;
    let live = true;
    const load = async (attempt: number) => {
      const rows = await getTargets(client, action.resource!, hostId).catch(
        () => [],
      );
      if (!live) return;
      if (rows === null && attempt < 8) {
        setTimeout(() => void load(attempt + 1), 1500);
        return;
      }
      setTargets(rows ?? []);
    };
    void load(0);
    return () => {
      live = false;
    };
  }, [client, action.resource, hostId]);

  const run = async (dryRun: boolean) => {
    if (!client) return;
    if (!dryRun && action.risk === "destructive") {
      const ok = await confirm({
        title: action.title,
        description: "This can't be undone. Run it?",
        confirmLabel: "Run",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await runAction(client, action.id, {
        hostId,
        resourceKey: action.scope === "resource" ? target : undefined,
        input: clean(values),
        dryRun,
        confirmed: !dryRun,
      });
      setOutcome(result);
      if (result.status === "pending_approval") {
        toast.info("Sent for approval");
      }
    } catch (error) {
      toast.error(errorText(error, "The action could not run"));
    } finally {
      setBusy(false);
    }
  };

  const shown = action.inputs.filter(
    (field) => !field.requires || values[field.requires] === true,
  );
  const ready = action.scope !== "resource" || !!target;

  return (
    <View className="gap-3 p-3">
      <View className="gap-1">
        <Text className="text-body font-medium">{action.title}</Text>
        <Text className="text-meta text-muted-foreground">
          {action.description ?? action.pluginName}
        </Text>
      </View>
      {action.scope === "resource" &&
        (targets.length > 0 ? (
          <ChoiceRow
            label="Target"
            value={target}
            options={targets.map((row) => ({
              value: row.key,
              label: row.name,
            }))}
            onChange={setTarget}
          />
        ) : (
          <Field
            label="Target"
            hint="The item on the host, such as a container"
          >
            <Input
              value={target}
              onChangeText={setTarget}
              autoCapitalize="none"
            />
          </Field>
        ))}
      {shown.map((field) =>
        field.type === "boolean" ? (
          <SettingRow
            key={field.key}
            label={field.label}
            description={field.description}
          >
            <FakeSwitch
              checked={values[field.key] === true}
              onChange={(value) => setValues({ ...values, [field.key]: value })}
            />
          </SettingRow>
        ) : field.type === "select" && field.options ? (
          <ChoiceRow
            key={field.key}
            label={field.label}
            value={String(values[field.key] ?? "")}
            options={field.options.map((option) => ({
              value: option.value,
              label: field.optionLabels?.[option.value] ?? option.value,
            }))}
            onChange={(value) => setValues({ ...values, [field.key]: value })}
          />
        ) : (
          <Field
            key={field.key}
            label={field.required ? `${field.label} *` : field.label}
            hint={field.description}
          >
            <Input
              value={
                values[field.key] === undefined ? "" : String(values[field.key])
              }
              onChangeText={(text) =>
                setValues({ ...values, [field.key]: text })
              }
              secureTextEntry={field.type === "secret"}
              multiline={field.type === "textarea" || field.type === "json"}
              keyboardType={field.type === "number" ? "numeric" : "default"}
              autoCapitalize="none"
            />
          </Field>
        ),
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="muted"
          disabled={!ready || busy}
          onPress={() => void run(true)}
        >
          Dry run
        </Button>
        <Button
          variant={action.risk === "destructive" ? "destructive" : "default"}
          disabled={!ready || busy}
          onPress={() => void run(false)}
        >
          Run
        </Button>
        <Button variant="ghost" onPress={onDone}>
          Back
        </Button>
      </View>
      {outcome ? (
        <View className="gap-1 border border-border p-3">
          <Text className="text-meta font-medium">
            {STATE_LABELS[outcome.status] ?? outcome.status}
          </Text>
          <Text className="text-meta text-muted-foreground">
            {outcome.summary ?? outcome.error ?? ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Every action any plugin offers for one host, in one list. */
export default function HostActions() {
  const router = useRouter();
  const client = useActiveClient();
  const repos = useRepositories();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [host, setHost] = useState<SSHHost | null | undefined>(undefined);
  const [serverId, setServerId] = useState<number | null>(null);
  const [actions, setActions] = useState<Action[] | null>(null);
  const [picked, setPicked] = useState<Action | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    repos.hosts
      .get(Number(id))
      .then(setHost)
      .catch(() => setHost(null));
  }, [id, repos]);

  const load = useCallback(async () => {
    if (!client || !host) return;
    try {
      setServerId(await serverHostId(client.accountId, host));
      setActions((await getCatalog(client)).actions);
      setError("");
    } catch (e) {
      setError(errorText(e, "Could not load actions"));
    }
  }, [client, host]);

  useEffect(() => {
    void load();
  }, [load]);

  const usable = useMemo(
    () =>
      (actions ?? []).filter((action) =>
        appliesTo(action, host?.pluginSettings),
      ),
    [actions, host],
  );

  return (
    <Screen
      title="Actions"
      subtitle={host?.name || host?.ip}
      onBack={() => (picked ? setPicked(null) : router.back())}
    >
      <ScrollView>
        {picked && serverId !== null ? (
          <ActionForm
            action={picked}
            hostId={serverId}
            onDone={() => setPicked(null)}
          />
        ) : error ? (
          <EmptyState title={error} />
        ) : actions && usable.length === 0 ? (
          <EmptyState
            title="No actions for this host"
            hint="Turn on a plugin like Docker or Services for this host on the server."
          />
        ) : (
          usable.map((action, index) => (
            <ListRow
              key={action.id}
              index={index}
              title={action.title}
              icon={<Zap size={16} />}
              meta={action.pluginName}
              badges={
                action.risk === "read" ? undefined : (
                  <Badge
                    variant={
                      action.risk === "destructive" ? "destructive" : "muted"
                    }
                  >
                    {action.risk === "destructive" ? "Destructive" : "Changes"}
                  </Badge>
                )
              }
              onPress={() => setPicked(action)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
