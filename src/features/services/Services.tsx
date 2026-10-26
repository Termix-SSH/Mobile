import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Cog, Search } from "lucide-react-native";
import { useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import { useExecTarget, usePoll, type ExecRunner } from "@/core/exec";
import { useThemeColor } from "@/contexts/ThemeContext";
import { ExecGate, SessionFrame } from "@/screens/sessions/shared";
import type { SSHHost } from "@/types";
import { Badge, Input, Tabs, Text } from "@/ui";
import { createLocalServicesBackend } from "./backend/local";
import { createRelayServicesBackend } from "./backend/relay";
import type {
  HostServices,
  ServicesBackend,
  UnitSummary,
} from "./backend/types";
import { JournalView } from "./JournalView";
import { UnitDetailView } from "./UnitDetailView";

type Section = "services" | "journal";
type Filter = "all" | "running" | "failed";

export const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/** Dot color for a unit's active state. */
export function stateTone(active: string): "success" | "destructive" | "muted" {
  if (active === "active") return "success";
  if (active === "failed") return "destructive";
  return "muted";
}

/** systemd services and the journal for a host. */
export function Services({
  host,
  isVisible,
}: {
  host: SSHHost;
  isVisible: boolean;
}) {
  const { target, retry, switchOrigin } = useExecTarget(
    host,
    "services",
    isVisible,
  );
  if (!isVisible) return null;
  return (
    <ExecGate
      target={target}
      onRetry={() => void retry()}
      onSwitch={switchOrigin}
      local={(runner) => <LocalServices host={host} runner={runner} />}
      relay={(serverHost) => <RelayServices host={serverHost} />}
    />
  );
}

function LocalServices({
  host,
  runner,
}: {
  host: SSHHost;
  runner: ExecRunner;
}) {
  const backend = useMemo(() => createLocalServicesBackend(runner), [runner]);
  return <ServicesView host={host} backend={backend} />;
}

function RelayServices({ host }: { host: SSHHost }) {
  const client = useClient(useSessionAccountId());
  const backend = useMemo(
    () => (client ? createRelayServicesBackend(client, host) : null),
    [client, host],
  );
  if (!backend) return null;
  return <ServicesView host={host} backend={backend} />;
}

export function ServicesView({
  host,
  backend,
}: {
  host: SSHHost;
  backend: ServicesBackend;
}) {
  const color = useThemeColor();
  const [section, setSection] = useState<Section>("services");
  const [status, setStatus] = useState<HostServices | null>(null);
  const [units, setUnits] = useState<UnitSummary[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [journalUnit, setJournalUnit] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const s = status ?? (await backend.status(signal));
        if (!status) setStatus(s);
        if (s.init === "none") return;
        setUnits(await backend.units("service", signal));
        setError("");
      } catch (e) {
        if (!signal?.aborted) setError(errorText(e, "Could not read services"));
      }
    },
    [backend, status],
  );
  usePoll(load, {
    intervalMs: 10_000,
    enabled: section === "services" && !open,
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      setStatus(null);
      const s = await backend.status();
      setStatus(s);
      if (s.init !== "none") setUnits(await backend.units("service"));
    } catch (e) {
      setError(errorText(e, "Could not read services"));
    } finally {
      setRefreshing(false);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (units ?? []).filter((u) => {
      if (filter === "running" && u.active !== "active") return false;
      if (filter === "failed" && u.active !== "failed") return false;
      return (
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.description.toLowerCase().includes(q)
      );
    });
  }, [units, query, filter]);

  if (open) {
    return (
      <UnitDetailView
        backend={backend}
        name={open}
        readOnly={!!status?.readOnly}
        onBack={() => setOpen(null)}
        onJournal={(unit) => {
          setOpen(null);
          setJournalUnit(unit);
          setSection("journal");
        }}
      />
    );
  }

  const failed = units?.filter((u) => u.active === "failed").length ?? 0;
  const noInit = status?.init === "none";
  const frame =
    error && !units
      ? "error"
      : noInit
        ? "empty"
        : section === "services" && !units
          ? "loading"
          : section === "services" && shown.length === 0
            ? "empty"
            : "ready";

  const where = backend.via === "local" ? " | this phone" : "";
  const subtitle = status
    ? `${status.init === "none" ? "Services" : `${status.init} ${status.version}`.trim()}${failed ? ` | ${failed} failed` : ""}${where}`
    : `Services${where}`;

  return (
    <SessionFrame
      title={host.name}
      subtitle={subtitle}
      status={frame}
      loadingLabel="Reading services..."
      errorMessage={error}
      onRetry={error ? () => void refresh() : undefined}
      emptyMessage={
        noInit
          ? "This host has no systemd or OpenRC."
          : units?.length
            ? "No services match"
            : "No services found"
      }
      emptyIcon={<Cog size={32} color={color("muted-foreground")} />}
      toolbar={
        noInit ? undefined : (
          <View className="gap-2.5 px-3 py-2.5">
            <Tabs<Section>
              value={section}
              onChange={(s) => {
                if (s === "journal") setJournalUnit(null);
                setSection(s);
              }}
              options={[
                { id: "services", label: "Services" },
                { id: "journal", label: "Journal" },
              ]}
            />
            {section === "services" ? (
              <>
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search services..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  leading={
                    <Search size={15} color={color("muted-foreground")} />
                  }
                />
                <Tabs<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: "all", label: "All" },
                    { id: "running", label: "Running" },
                    {
                      id: "failed",
                      label: failed ? `Failed (${failed})` : "Failed",
                    },
                  ]}
                />
              </>
            ) : null}
          </View>
        )
      }
    >
      {section === "journal" ? (
        <JournalView
          key={journalUnit ?? "all"}
          backend={backend}
          unit={journalUnit}
          journal={status?.journal !== false}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={color("accent-brand")}
              onRefresh={refresh}
            />
          }
        >
          {shown.map((u) => (
            <Pressable
              key={u.name}
              onPress={() => setOpen(u.name)}
              className="flex-row items-center gap-2.5 border border-border bg-card px-3 py-2.5 active:bg-muted/30"
            >
              <View className="min-w-0 flex-1">
                <Text
                  weight="medium"
                  className="text-sm text-foreground"
                  numberOfLines={1}
                >
                  {u.name.replace(/\.service$/, "")}
                </Text>
                {u.description ? (
                  <Text
                    className="text-[10px] text-muted-foreground"
                    numberOfLines={1}
                  >
                    {u.description}
                  </Text>
                ) : null}
              </View>
              <Badge variant={stateTone(u.active)}>
                {u.active === "active" ? u.sub : u.active}
              </Badge>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SessionFrame>
  );
}
