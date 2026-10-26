import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Pencil,
  Copy,
  CopyPlus,
  Trash2,
  Pin,
  PinOff,
  ListChecks,
} from "lucide-react-native";
import { SSHHost } from "@/types";
import type { HostMetrics } from "@/screens/hosts/navigation/Host";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { Button, Sheet, SheetRow, Tabs, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import {
  useHostActions,
  type HostActionContext,
  type HostActionDef,
} from "@/core/features";
import {
  ORIGINS,
  ORIGIN_LABELS,
  originInputs,
  originOf,
  planConnection,
  saveOrigin,
  type Blocked,
  type ConnectionOrigin,
} from "@/core/transport";
import { isSshHost } from "@/utils/hosts";

const FIX_LABEL: Record<Exclude<ConnectionOrigin, "auto">, string> = {
  server: "Connect through the server",
  device: "Connect from this phone",
};

export function HostActionSheet({
  host,
  status,
  metrics,
  visible,
  onClose,
  onEdit,
  onClone,
  onDelete,
  onTogglePin,
  onSelect,
}: {
  host: SSHHost | null;
  status: "online" | "offline" | "unknown";
  metrics?: HostMetrics;
  visible: boolean;
  onClose: () => void;
  onEdit: (host: SSHHost) => void;
  onClone: (host: SSHHost) => void;
  onDelete: (host: SSHHost) => void;
  /** Shows Pin or Unpin. */
  onTogglePin?: (host: SSHHost) => void;
  /** Shows Select, which starts multi select with this host. */
  onSelect?: (host: SSHHost) => void;
}) {
  const { navigateToSessions } = useTerminalSessions();
  const { ctx, actions } = useHostActions();
  const color = useThemeColor();
  const iconColor = color("foreground");
  const accountId = ctx.account.id;
  const [origin, setOrigin] = useState<ConnectionOrigin | null>(null);
  const [blocked, setBlocked] = useState<
    (Blocked & { retry: () => void }) | null
  >(null);

  // Only a linked server's SSH hosts can pick where they connect from.
  const picksOrigin =
    !!host && ctx.account.kind === "server" && isSshHost(host);

  useEffect(() => {
    setBlocked(null);
    if (!visible || !host || !picksOrigin) return;
    let live = true;
    originOf(accountId, host).then((o) => live && setOrigin(o));
    return () => {
      live = false;
    };
  }, [visible, host, picksOrigin, accountId]);

  if (!host) return null;

  const changeOrigin = async (next: ConnectionOrigin) => {
    setOrigin(next);
    setBlocked(null);
    try {
      await saveOrigin(accountId, host.id, next);
    } catch (err) {
      toast.error(
        "Could not save how this host connects",
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const originNote =
    picksOrigin && origin
      ? planConnection(origin, originInputs(accountId, true)).blocked?.reason
      : undefined;

  const runAction = async (action: HostActionDef) => {
    let wasBlocked = false;
    const actionCtx: HostActionContext = {
      ...ctx,
      openSession: async (type, opts) => {
        const result = await navigateToSessions(host, type, {
          ...opts,
          quiet: true,
        });
        if (result) {
          wasBlocked = true;
          setBlocked({ ...result, retry: () => void runAction(action) });
        }
      },
      close: onClose,
    };
    await action.run(host, actionCtx);
    if (!wasBlocked) onClose();
  };

  const available = actions.filter((a) => a.isAvailable(host, ctx));
  const connectActions = available.filter((a) => a.group === "connect");
  const manageActions = available.filter((a) => a.group === "manage");

  const copyAddress = async () => {
    await Clipboard.setStringAsync(
      `${host.username ? `${host.username}@` : ""}${host.ip}`,
    );
    toast.success("Address copied");
    onClose();
  };

  const dotColor =
    status === "online"
      ? color("success")
      : status === "offline"
        ? color("destructive")
        : color("muted-foreground");

  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center gap-2.5 border-b border-border px-4 pb-3 pt-2">
        <View
          style={{ backgroundColor: dotColor }}
          className="h-2.5 w-2.5 rounded-full"
        />
        <View className="min-w-0 flex-1">
          <Text
            weight="bold"
            className="text-sm text-foreground"
            numberOfLines={1}
          >
            {host.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {host.username ? `${host.username}@` : ""}
            {host.ip}
            {host.port ? `:${host.port}` : ""}
          </Text>
        </View>
        {status === "online" &&
        metrics &&
        (metrics.cpu != null || metrics.ram != null) ? (
          <View className="shrink-0 items-end">
            {metrics.cpu != null ? (
              <Text className="text-2xs text-muted-foreground">
                CPU {Math.round(metrics.cpu)}%
              </Text>
            ) : null}
            {metrics.ram != null ? (
              <Text className="text-2xs text-muted-foreground">
                RAM {Math.round(metrics.ram)}%
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {picksOrigin && origin ? (
        <View className="gap-2 border-b border-border px-4 py-3">
          <Text className="text-xs uppercase tracking-[1px] text-muted-foreground">
            Connect from
          </Text>
          <Tabs<ConnectionOrigin>
            options={ORIGINS.map((id) => ({ id, label: ORIGIN_LABELS[id] }))}
            value={origin}
            onChange={changeOrigin}
          />
          {originNote ? (
            <Text className="text-meta text-muted-foreground">
              {originNote}
            </Text>
          ) : null}
        </View>
      ) : null}

      {blocked ? (
        <View className="gap-2 border-b border-border bg-card px-4 py-3">
          <Text className="text-xs leading-5 text-foreground">
            {blocked.reason}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {blocked.fix && blocked.fix !== "auto" ? (
              <Button
                size="sm"
                onPress={async () => {
                  const retry = blocked.retry;
                  await changeOrigin(blocked.fix!);
                  retry();
                }}
              >
                {FIX_LABEL[blocked.fix]}
              </Button>
            ) : null}
            <Button size="sm" variant="muted" onPress={() => setBlocked(null)}>
              Dismiss
            </Button>
          </View>
        </View>
      ) : null}

      <ScrollView style={{ maxHeight: 440 }}>
        {/* Connection actions (SSH features + protocols) */}
        {[...connectActions, ...manageActions].map((action) => {
          const Icon = action.icon;
          return (
            <SheetRow
              key={action.id}
              icon={<Icon size={18} color={iconColor} />}
              label={action.label}
              onPress={() => void runAction(action)}
            />
          );
        })}
        {onTogglePin && !host.shared ? (
          <SheetRow
            icon={
              host.pin ? (
                <PinOff size={18} color={iconColor} />
              ) : (
                <Pin size={18} color={iconColor} />
              )
            }
            label={host.pin ? "Unpin" : "Pin to Home"}
            onPress={() => {
              onTogglePin(host);
              onClose();
            }}
          />
        ) : null}
        {onSelect ? (
          <SheetRow
            icon={<ListChecks size={18} color={iconColor} />}
            label="Select"
            onPress={() => {
              onSelect(host);
              onClose();
            }}
          />
        ) : null}
        <SheetRow
          icon={<Pencil size={18} color={iconColor} />}
          label="Edit Host"
          onPress={() => {
            onEdit(host);
            onClose();
          }}
        />
        <SheetRow
          icon={<Copy size={18} color={iconColor} />}
          label="Copy Address"
          onPress={copyAddress}
        />
        <SheetRow
          icon={<CopyPlus size={18} color={iconColor} />}
          label="Clone Host"
          onPress={() => {
            onClone(host);
            onClose();
          }}
        />
        <SheetRow
          icon={<Trash2 size={18} color={color("destructive")} />}
          label="Delete Host"
          destructive
          onPress={() => {
            onDelete(host);
            onClose();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}
