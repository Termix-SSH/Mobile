import { useState } from "react";
import { Copy, Trash2, Unlink } from "lucide-react-native";
import { accountLabel, type ServerAccount } from "@/core/accounts";
import { toUserMessage } from "@/core/errors";
import { sync, unlinkAccount } from "@/core/sync";
import { Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

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
          ? t("accounts.unlinkSheet.unlinkedItemsWereKeptOn", {
              copied: result.copied,
            })
          : t("accounts.unlinkSheet.unlinked"),
      );
      onClose();
      onDone?.();
    } catch (error) {
      toast.error(
        toUserMessage(error, t("accounts.unlinkSheet.couldNotUnlinkTheServer")),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible && !!account}
      onClose={onClose}
      dismissable={!busy}
      title={t("accounts.unlinkSheet.unlink", {
        value: account ? accountLabel(account) : "server",
      })}
      description={t("accounts.unlinkSheet.thisSignsOutOfThe", { deviceWord })}
      icon={<Unlink size={18} color={color("foreground")} />}
    >
      {synced ? (
        <SheetRow
          icon={<Copy size={18} color={color("foreground")} />}
          label={t("accounts.unlinkSheet.keepACopyOnThis")}
          description={t("accounts.unlinkSheet.yourOwnHostsCredentialsAnd")}
          onPress={() => void run(true)}
          disabled={busy}
        />
      ) : null}
      <SheetRow
        icon={<Trash2 size={18} color={color("destructive")} />}
        label={t("accounts.unlinkSheet.deleteFromThis", { deviceWord })}
        description={t("accounts.unlinkSheet.everythingThisHasForThe", {
          deviceWord,
        })}
        destructive
        onPress={() => void run(false)}
        disabled={busy}
      />
    </Sheet>
  );
}
