import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Search, Server, X } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SSHHost } from "@/types";
import { EmptyState, Input, ListRow, Sheet, Text } from "@/ui";

/** Hosts whose name, address, user, folder or tags hold the query. */
export function matchHosts(hosts: SSHHost[], query: string): SSHHost[] {
  const q = query.trim().toLowerCase();
  const sorted = [...hosts].sort((a, b) =>
    (a.name || a.ip).localeCompare(b.name || b.ip),
  );
  if (!q) return sorted;
  return sorted.filter((h) =>
    [h.name, h.ip, h.username, h.folder, ...(h.tags ?? [])]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}

/** Asks which host to open a tool on. */
export function HostPicker({
  visible,
  title,
  hosts,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  hosts: SSHHost[];
  onPick: (host: SSHHost) => void;
  onClose: () => void;
}) {
  const color = useThemeColor();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => matchHosts(hosts, query), [hosts, query]);

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setQuery("");
        onClose();
      }}
      title={title}
      description="Pick a host"
    >
      <View className="px-4 pb-2">
        <Input
          placeholder="Search hosts"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          leading={<Search size={15} color={color("muted-foreground")} />}
          trailing={
            query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery("")}
                hitSlop={8}
              >
                <X size={15} color={color("muted-foreground")} />
              </Pressable>
            ) : undefined
          }
        />
      </View>
      <ScrollView
        style={{ maxHeight: 420 }}
        keyboardShouldPersistTaps="handled"
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={Server}
            title={hosts.length ? "No hosts match" : "No hosts can use this"}
            hint={
              hosts.length
                ? undefined
                : "Turn it on for a host in the host editor."
            }
          />
        ) : (
          shown.map((host, index) => (
            <ListRow
              key={host.id}
              index={index}
              title={host.name || host.ip}
              meta={
                <Text className="text-meta text-muted-foreground">
                  {host.username ? `${host.username}@` : ""}
                  {host.ip}
                </Text>
              }
              onPress={() => {
                setQuery("");
                onPick(host);
              }}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}
