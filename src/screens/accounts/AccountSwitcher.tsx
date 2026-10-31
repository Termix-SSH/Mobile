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

const STATUS: Record<string, string> = {
  idle: "Signed in",
  syncing: "Syncing",
  offline: "Offline",
  error: "Error",
  signed_out: "Signed out",
};

function details(account: Account): string {
  if (account.kind === "local") return "Works without a server";
  const parts = [
    account.username,
    account.serverUrl.replace(/^https?:\/\//, ""),
    STATUS[account.status],
    account.options.sync === true ? "Synced copy" : null,
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
      toast.error(toUserMessage(e, "Could not switch account"));
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
        title="Accounts"
        description="Open tabs keep running when you switch."
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
                    accessibilityLabel={`Unlink ${accountLabel(account)}`}
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
          label="Link a server"
          onPress={linkServer}
        />
        <View className="px-4 py-3">
          <Text className="text-[11px] text-muted-foreground">
            Each server keeps its own hosts, credentials and settings on this
            phone.
          </Text>
        </View>
      </Sheet>
    </>
  );
}
