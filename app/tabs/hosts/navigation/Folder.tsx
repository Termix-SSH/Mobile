import { useState } from "react";
import { View, Pressable } from "react-native";
import { ChevronRight, Folder as FolderIcon } from "lucide-react-native";
import { SSHHost } from "@/types";
import Host from "@/app/tabs/hosts/navigation/Host";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface FolderProps {
  name: string;
  hosts: SSHHost[];
  color?: string;
  defaultExpanded?: boolean;
  showTags?: boolean;
  getHostStatus: (hostId: number) => "online" | "offline" | "unknown";
  onHostPress: (host: SSHHost) => void;
}

export default function Folder({
  name,
  hosts,
  color: folderColor,
  defaultExpanded = true,
  showTags = true,
  getHostStatus,
  onHostPress,
}: FolderProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const resolve = useThemeColor();
  const muted = resolve("muted-foreground");

  return (
    <View className="mb-3">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="flex-row items-center gap-2 px-2 py-2"
      >
        <View
          style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
          className="shrink-0"
        >
          <ChevronRight size={14} color={muted} />
        </View>
        <FolderIcon
          size={14}
          color={folderColor ?? muted}
          fill={folderColor ? folderColor : "transparent"}
        />
        <Text
          weight="bold"
          className="text-xs uppercase tracking-wider text-foreground flex-1"
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text className="text-[10px] text-muted-foreground">{hosts.length}</Text>
      </Pressable>

      {expanded ? (
        <View className="gap-1.5 pl-1">
          {hosts.length === 0 ? (
            <Text className="text-[11px] text-muted-foreground px-2 py-2">
              No hosts in this folder
            </Text>
          ) : (
            hosts.map((host) => (
              <Host
                key={host.id}
                host={host}
                status={getHostStatus(host.id)}
                showTags={showTags}
                onPress={onHostPress}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
