import { useState } from "react";
import { Copy, Trash2, Unlink } from "lucide-react-native";
import { accountLabel, type ServerAccount } from "@/core/accounts";
import { toUserMessage } from "@/core/errors";
import { sync, unlinkAccount } from "@/core/sync";
import { Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";

/**
 * Unlink a server: keep a copy of your own hosts, credentials and snippets on
 * This device, or delete everything this phone has for it.
 */
export function UnlinkSheet({
  account,
  visible,
  onClose,
  onDone,
}: {
  account: ServerAccount | null;
  visible: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const color = useThemeColor();
  const synced = account?.options.sync === true;

  const run = async (keep: boolean) => {
    if (!account || busy) return;
    setBusy(true);
    try {
      const result = await unlinkAccount(account.id, {
        keep,
        stop: (id) => sync.forget(id),
      });
      toast.success(
        keep && result.copied
          ? `Unlinked. ${result.copied} items were kept on This device.`
          : "Unlinked",
      );
      onClose();
      onDone?.();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not unlink the server"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible && !!account}
      onClose={onClose}
      dismissable={!busy}
      title={`Unlink ${account ? accountLabel(account) : "server"}?`}
      description="This phone signs out of the server. Nothing is deleted on the server."
      icon={<Unlink size={18} color={color("foreground")} />}
    >
      {synced ? (
        <SheetRow
          icon={<Copy size={18} color={color("foreground")} />}
          label="Keep a copy on This device"
          description="Your own hosts, credentials and snippets move to This device. Hosts shared with you are not kept."
          onPress={() => void run(true)}
          disabled={busy}
        />
      ) : null}
      <SheetRow
        icon={<Trash2 size={18} color={color("destructive")} />}
        label="Delete from this phone"
        description="Everything this phone has for the server is removed."
        destructive
        onPress={() => void run(false)}
        disabled={busy}
      />
    </Sheet>
  );
}
