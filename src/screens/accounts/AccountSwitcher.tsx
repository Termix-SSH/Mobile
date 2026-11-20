import { useState } from "react";
import { View } from "react-native";
import { Plus, Server, Smartphone, Unlink } from "lucide-react-native";
import { Button, Sheet, SheetRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useAppContext } from "@/contexts/AppContext";
import {
  accountLabel,
  accounts,
  useAccounts,
  type Account,
  type ServerAccount,
} from "@/core/accounts";
import { toUserMessage } from "@/core/errors";
import { toast } from "@/utils/toast";
import { UnlinkSheet } from "./UnlinkSheet";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

const STATUS: Record<string, string> = {
  idle: t("accounts.accountSwitcher.signedIn"),
  syncing: "Syncing",
  offline: "Offline",
  error: t("accounts.accountSwitcher.error"),
  signed_out: t("accounts.accountSwitcher.signedOut"),
};

function details(account: Account): string {
  if (account.kind === "local")
    return t("accounts.accountSwitcher.worksWithoutAServer");
  const parts = [
    account.username,
    account.serverUrl.replace(/^https?:\/\//, ""),
    STATUS[account.status],
    account.options.sync === true
      ? t("accounts.accountSwitcher.syncedCopy")
      : null,
  ];
  return parts.filter(Boolean).join(" | ");
}

/** Lists This device and every linked server; tap one to switch to it. */
export function AccountSwitcher() {
  const color = useThemeColor();
  const [unlinking, setUnlinking] = useState<ServerAccount | null>(null);
  const { accounts: list, active } = useAccounts();
  const { accountSwitcherVisible, closeAccountSwitcher, openAuthFlow } =
    useAppContext();
  const iconColor = color("foreground");

  const switchTo = async (account: Account) => {
    closeAccountSwitcher();
    if (account.id === active.id) return;
    try {
      await accounts.setActive(account.id);
    } catch (e) {
      toast.error(
        toUserMessage(e, t("accounts.accountSwitcher.couldNotSwitchAccount")),
      );
    }
  };

  const unlink = (account: ServerAccount) => {
    closeAccountSwitcher();
    setUnlinking(account);
  };

  const linkServer = () => {
    closeAccountSwitcher();
    openAuthFlow("server");
  };

  return (
    <>
      <UnlinkSheet
        account={unlinking}
        visible={!!unlinking}
        onClose={() => setUnlinking(null)}
      />
      <Sheet
        visible={accountSwitcherVisible}
        onClose={closeAccountSwitcher}
        title={t("accounts.accountSwitcher.accounts")}
        description={t("accounts.accountSwitcher.openTabsKeepRunningWhen")}
      >
        {list.map((account) => {
          const Icon = account.kind === "local" ? Smartphone : Server;
          const isActive = account.id === active.id;
          return (
            <SheetRow
              key={account.id}
              icon={<Icon size={18} color={iconColor} />}
              label={accountLabel(account)}
              description={details(account)}
              selected={isActive}
              onPress={() => switchTo(account)}
              trailing={
                account.kind === "server" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    accessibilityLabel={t("accounts.accountSwitcher.unlink", {
                      account: accountLabel(account),
                    })}
                    onPress={() => unlink(account)}
                    icon={
                      <Unlink size={16} color={color("muted-foreground")} />
                    }
                  />
                ) : null
              }
            />
          );
        })}
        <SheetRow
          icon={<Plus size={18} color={iconColor} />}
          label={t("accounts.accountSwitcher.linkAServer")}
          onPress={linkServer}
        />
        <View className="px-4 py-3">
          <Text className="text-[11px] text-muted-foreground">
            {t("accounts.accountSwitcher.eachServerKeepsItsOwn", {
              deviceWord,
            })}
          </Text>
        </View>
      </Sheet>
    </>
  );
}
