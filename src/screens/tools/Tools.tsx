import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Wrench } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import {
  useQuickActions,
  useTools,
  type FeatureIcon,
  type ToolDef,
} from "@/core/features";
import { AccountButton, SearchButton } from "@/screens/shell/AppHeader";
import { EmptyState, ListRow, Text, Section as UiSection } from "@/ui";
import { HostPicker } from "./HostPicker";

function Section({ title, children }: { title: string; children: any }) {
  return (
    <UiSection title={title} bodyClassName="">
      {children}
    </UiSection>
  );
}

function Row({
  index,
  icon: Icon,
  label,
  description,
  onPress,
}: {
  index: number;
  icon: FeatureIcon;
  label: string;
  description?: string;
  onPress: () => void;
}) {
  const color = useThemeColor();
  return (
    <ListRow
      index={index}
      title={label}
      icon={<Icon size={16} color={color("muted-foreground")} />}
      meta={
        description ? (
          <Text className="text-meta text-muted-foreground">{description}</Text>
        ) : undefined
      }
      trailing={<ChevronRight size={16} color={color("muted-foreground")} />}
      onPress={onPress}
    />
  );
}

/** Files, snippets, Docker and the rest, as the features register them. */
export default function Tools() {
  const router = useRouter();
  const tools = useTools();
  const quick = useQuickActions();
  const repos = useRepositories();
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const { navigateToSessions } = useTerminalSessions();
  const [picking, setPicking] = useState<ToolDef | null>(null);

  const onHost = tools.filter((t) => t.tabType);
  const screens = tools.filter((t) => !t.tabType && t.href);
  const pickable = useMemo(
    () =>
      picking ? hosts.data.filter((h) => picking.isAvailable?.(h) ?? true) : [],
    [picking, hosts.data],
  );

  const open = (tool: ToolDef) => {
    if (tool.tabType) setPicking(tool);
    else if (tool.href) router.push(tool.href as never);
  };

  const empty =
    onHost.length === 0 && screens.length === 0 && quick.actions.length === 0;

  return (
    <Screen titleNode={<AccountButton />} headerRight={<SearchButton />}>
      {empty ? (
        <EmptyState icon={Wrench} title="No tools here yet" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 48 }}
        >
          {onHost.length ? (
            <Section title="On a host">
              {onHost.map((tool, i) => (
                <Row
                  key={tool.id}
                  index={i}
                  {...tool}
                  onPress={() => open(tool)}
                />
              ))}
            </Section>
          ) : null}
          {screens.length ? (
            <Section title="Saved">
              {screens.map((tool, i) => (
                <Row
                  key={tool.id}
                  index={i}
                  {...tool}
                  onPress={() => open(tool)}
                />
              ))}
            </Section>
          ) : null}
          {quick.actions.length ? (
            <Section title="From your server">
              {quick.actions.map((action, i) => (
                <Row
                  key={action.id}
                  index={i}
                  icon={action.icon}
                  label={action.label}
                  onPress={() => action.run(quick.ctx)}
                />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}
      <HostPicker
        visible={picking !== null}
        title={picking?.label ?? ""}
        hosts={pickable}
        onClose={() => setPicking(null)}
        onPick={(host) => {
          const tool = picking;
          setPicking(null);
          if (tool?.tabType) void navigateToSessions(host, tool.tabType);
        }}
      />
    </Screen>
  );
}
