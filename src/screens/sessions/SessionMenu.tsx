import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Columns2,
  CopyPlus,
  Pencil,
  X,
  XSquare,
} from "lucide-react-native";
import { PromptSheet, Sheet, SheetRow, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { accounts, useClient } from "@/core/accounts";
import { features } from "@/core/features";
import type {
  CompanionDef,
  SessionMenuContext,
  SessionMenuItemDef,
} from "@/core/features/types";
import { displayTitle } from "@/contexts/session-tabs";
import type { TerminalSession } from "@/contexts/TerminalSessionsContext";

/**
 * A tab's menu: rename, another tab on the host, move, close, and whatever
 * the tab's features add, like find or a share link.
 */
export function SessionMenu({
  session,
  index,
  count,
  handle,
  onClose,
  onRename,
  onDuplicate,
  onMove,
  onCloseTab,
  onView,
  companions = [],
  companionOpen,
  companionAsTab,
  onCompanion,
  splitTargets = [],
  splitOn = false,
  onSplit,
  onCloseAll,
}: {
  session: TerminalSession | null;
  index: number;
  count: number;
  handle: SessionMenuContext["handle"];
  onClose: () => void;
  onRename: (title: string) => void;
  onDuplicate: () => void;
  onMove: (toIndex: number) => void;
  onCloseTab: () => void;
  /** A feature item asked to show its view. */
  onView: (item: SessionMenuItemDef, ctx: SessionMenuContext) => void;
  /** Panels that can sit beside this tab. */
  companions?: CompanionDef[];
  companionOpen?: string | null;
  /** On phones a panel opens as its own tab instead. */
  companionAsTab?: boolean;
  onCompanion?: (id: string) => void;
  /** Tabs this one can share the screen with, on large screens. */
  splitTargets?: TerminalSession[];
  /** This tab is in split view now. */
  splitOn?: boolean;
  /** Puts a tab beside this one, or null to end split view. */
  onSplit?: (sessionId: string | null) => void;
  onCloseAll?: () => void;
}) {
  const color = useThemeColor();
  const client = useClient(session?.accountId ?? null);
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);

  const ctx = useMemo<SessionMenuContext | null>(() => {
    if (!session) return null;
    return {
      account: accounts.find(session.accountId) ?? accounts.active(),
      client,
      session,
      handle,
      transport: session.transport ?? null,
    };
  }, [session, client, handle]);
  const items = useMemo(
    () => (ctx ? features.sessionMenuItems(ctx) : []),
    [ctx],
  );

  const icon = (Icon: typeof Pencil) => (
    <Icon size={16} color={color("foreground")} />
  );
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      <Sheet
        visible={session !== null && !renaming && !picking}
        onClose={onClose}
        title={session ? displayTitle(session) : undefined}
        scroll
      >
        <SheetRow
          icon={icon(Pencil)}
          label="Rename"
          onPress={() => setRenaming(true)}
        />
        <SheetRow
          icon={icon(CopyPlus)}
          label="New tab on this host"
          onPress={pick(onDuplicate)}
        />
        {companions.map((c) => (
          <SheetRow
            key={`companion-${c.id}`}
            icon={icon(c.icon as typeof Pencil)}
            label={
              companionAsTab
                ? `${c.title} here`
                : companionOpen === c.id
                  ? `Hide ${c.title} panel`
                  : `Show ${c.title} panel`
            }
            onPress={pick(() => onCompanion?.(c.id))}
          />
        ))}
        {splitOn ? (
          <SheetRow
            icon={icon(Columns2)}
            label="End split view"
            onPress={pick(() => onSplit?.(null))}
          />
        ) : splitTargets.length > 0 && onSplit ? (
          <SheetRow
            icon={icon(Columns2)}
            label="Split view with..."
            onPress={() => setPicking(true)}
          />
        ) : null}
        {items.map((item) => (
          <SheetRow
            key={item.id}
            icon={icon(item.icon as typeof Pencil)}
            label={item.label}
            onPress={pick(() => {
              if (!ctx) return;
              if (item.view) onView(item, ctx);
              else item.run?.(ctx);
            })}
          />
        ))}
        {index > 0 ? (
          <SheetRow
            icon={icon(ArrowLeft)}
            label="Move left"
            onPress={pick(() => onMove(index - 1))}
          />
        ) : null}
        {index < count - 1 ? (
          <SheetRow
            icon={icon(ArrowRight)}
            label="Move right"
            onPress={pick(() => onMove(index + 1))}
          />
        ) : null}
        <SheetRow
          icon={<X size={16} color={color("destructive")} />}
          label="Close tab"
          destructive
          onPress={pick(onCloseTab)}
        />
        {onCloseAll && count > 1 ? (
          <SheetRow
            icon={<XSquare size={16} color={color("destructive")} />}
            label="Close all tabs"
            destructive
            onPress={pick(async () => {
              const ok = await confirm({
                title: `Close all ${count} tabs?`,
                description: "Every session ends.",
                confirmLabel: "Close all",
              });
              if (ok) onCloseAll();
            })}
          />
        ) : null}
      </Sheet>
      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Split view with"
        scroll
      >
        {splitTargets.map((target) => (
          <SheetRow
            key={target.id}
            label={displayTitle(target)}
            onPress={() => {
              setPicking(false);
              onClose();
              onSplit?.(target.id);
            }}
          />
        ))}
      </Sheet>
      <PromptSheet
        visible={renaming}
        title="Rename tab"
        description="Leave it empty to use the host's name."
        defaultValue={session?.customTitle ?? ""}
        placeholder={session?.title}
        validate={() => true}
        onCancel={() => setRenaming(false)}
        onSubmit={(value) => {
          setRenaming(false);
          onClose();
          onRename(value);
        }}
      />
    </>
  );
}
