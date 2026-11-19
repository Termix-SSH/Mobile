import { useState } from "react";
import { View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  accountLabel,
  accounts,
  useActiveAccount,
  type Account,
} from "@/core/accounts";
import { sync, useAccountSync, type AccountSync } from "@/core/sync";
import { Button, Text } from "@/ui";
import { toast } from "@/utils/toast";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

/** Whether to say the active server can't be reached. */
export function unreachable(account: Account, status: AccountSync): boolean {
  if (account.kind !== "server") return false;
  if (account.status === "signed_out") return false;
  return (
    account.status === "offline" ||
    status.state === "offline" ||
    status.reason === "offline" ||
    status.reason === "server"
  );
}

/** Says the linked server is out of reach, and that the phone still works. */
export function ServerReachBanner() {
  const color = useThemeColor();
  const account = useActiveAccount();
  const status = useAccountSync(account.id);
  const [trying, setTrying] = useState(false);

  if (!unreachable(account, status)) return null;
  const synced = account.kind === "server" && account.options.sync === true;

  const retry = async () => {
    setTrying(true);
    try {
      const client = accounts.activeClient();
      const me = await client?.api.auth.getUserInfo();
      if (!me?.username) throw new Error(t("home.serverReachBanner.noAnswer"));
      await accounts.update(account.id, { status: "idle" });
      if (synced) await sync.syncNow(account.id);
    } catch {
      toast.error(t("home.serverReachBanner.stillCanTReachThe"));
    } finally {
      setTrying(false);
    }
  };

  return (
    <View className="flex-row items-start gap-2 border border-border bg-card p-3">
      <WifiOff
        size={15}
        color={color("muted-foreground")}
        style={{ marginTop: 1 }}
      />
      <View className="flex-1">
        <Text weight="medium" className="text-sm text-foreground">
          {t("home.serverReachBanner.canTReach", {
            account: accountLabel(account),
          })}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {synced
            ? t("home.serverReachBanner.youCanKeepWorkingWith", { deviceWord })
            : t("home.serverReachBanner.hostsSetToConnectFrom", { deviceWord })}
        </Text>
      </View>
      <Button size="sm" variant="muted" loading={trying} onPress={retry}>
        {t("home.serverReachBanner.tryAgain")}
      </Button>
    </View>
  );
}
