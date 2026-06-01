import { View, Pressable } from "react-native";
import { ChevronRight, Folder as FolderIcon } from "lucide-react-native";
import { SSHHost, HostTreeNode } from "@/types";
import Host, { HostMetrics } from "@/app/tabs/hosts/navigation/Host";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import {
  GetHostStatus,
  folderCounts,
  isFolder,
} from "@/app/tabs/hosts/navigation/hostTree";

interface SharedProps {
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  getHostStatus: GetHostStatus;
  getHostMetrics?: (hostId: number) => HostMetrics | undefined;
  showTags?: boolean;
  onHostPress: (host: SSHHost) => void;
}

/** Mutable counter so striping is continuous across the whole flattened tree. */
type StripeCounter = { i: number };

function TreeNode({
  node,
  depth,
  stripe,
  shared,
}: {
  node: HostTreeNode;
  depth: number;
  stripe: StripeCounter;
  shared: SharedProps;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground") ?? "#9ca3af";
  const accent = color("accent-brand") ?? "#f59145";

  if (!isFolder(node)) {
    const striped = stripe.i++ % 2 === 1;
    return (
      <Host
        host={node.host}
        status={shared.getHostStatus(node.host.id)}
        metrics={shared.getHostMetrics?.(node.host.id)}
        showTags={shared.showTags}
        striped={striped}
        onPress={shared.onHostPress}
      />
    );
  }

  const isOpen = shared.expandedPaths.has(node.path);
  const { total, online } = folderCounts(node, shared.getHostStatus);
  const folderStriped = stripe.i++ % 2 === 1;

  return (
    <View>
      <Pressable
        onPress={() => shared.onToggle(node.path)}
        className={`flex-row items-center gap-2 px-2 py-2 active:bg-muted/40 ${
          folderStriped ? "bg-muted/20" : ""
        }`}
      >
        <View
          style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
          className="shrink-0"
        >
          <ChevronRight size={13} color={color("muted-foreground", 0.6)} />
        </View>
        <FolderIcon
          size={14}
          color={node.color ?? (isOpen ? accent : muted)}
          fill={node.color ? node.color : "transparent"}
        />
        <Text
          weight="bold"
          className="flex-1 text-[13px] text-foreground/80"
          numberOfLines={1}
        >
          {node.name}
        </Text>
        <Text className="text-[10px]">
          {online > 0 ? (
            <Text className="text-[10px] text-accent-brand" weight="bold">
              {online}
            </Text>
          ) : null}
          <Text className="text-[10px] text-muted-foreground/40">/{total}</Text>
        </Text>
      </Pressable>

      {isOpen ? (
        <View className="ml-3.5 border-l border-border/40 pl-1.5">
          {node.children.length === 0 ? (
            <Text className="px-2 py-2 text-[11px] text-muted-foreground">
              No hosts in this folder
            </Text>
          ) : (
            node.children.map((child) => (
              <TreeNode
                key={isFolder(child) ? `f:${child.path}` : `h:${child.host.id}`}
                node={child}
                depth={depth + 1}
                stripe={stripe}
                shared={shared}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Renders a list of host-tree nodes (folders nest recursively, hosts are
 * leaves). Expansion state is controlled by the parent so it can be persisted.
 */
export default function HostTree({
  nodes,
  ...shared
}: { nodes: HostTreeNode[] } & SharedProps) {
  const stripe: StripeCounter = { i: 0 };
  return (
    <View className="gap-1.5">
      {nodes.map((node) => (
        <TreeNode
          key={isFolder(node) ? `f:${node.path}` : `h:${node.host.id}`}
          node={node}
          depth={0}
          stripe={stripe}
          shared={shared}
        />
      ))}
    </View>
  );
}
