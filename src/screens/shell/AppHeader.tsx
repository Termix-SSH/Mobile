import { Pressable, View } from "react-native";
import { ChevronDown, Search, Server, Smartphone } from "lucide-react-native";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import { accountLabel, useActiveAccount, type Account } from "@/core/accounts";
import { palette } from "@/screens/palette/store";
import { Button, Text } from "@/ui";

const STATUS: Record<string, string> = {
  idle: "Signed in",
  syncing: "Syncing",
  offline: "Offline",
  error: "Error",
  signed_out: "Signed out",
};

/** One short line under the account name. */
export function accountLine(account: Account): string {
  if (account.kind === "local") return "Works without a server";
  return [
    STATUS[account.status],
    account.options.sync === true ? "Copy on this phone" : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/** The account switcher on the left of a screen header. */
export function AccountButton() {
  const color = useThemeColor();
  const account = useActiveAccount();
  const { openAccountSwitcher } = useAppContext();
  const Icon = account.kind === "local" ? Smartphone : Server;
  return (
    <Pressable
      onPress={openAccountSwitcher}
      accessibilityRole="button"
      accessibilityLabel={`Account ${accountLabel(account)}, switch`}
      className="flex-row items-center gap-2 active:opacity-70"
      hitSlop={6}
    >
      <Icon size={18} color={color("accent-brand")} />
      <View className="min-w-0 shrink">
        <View className="flex-row items-center gap-1">
          <Text
            weight="bold"
            className="shrink text-title text-foreground"
            numberOfLines={1}
          >
            {accountLabel(account)}
          </Text>
          <ChevronDown size={16} color={color("muted-foreground")} />
        </View>
        <Text className="text-meta text-muted-foreground" numberOfLines={1}>
          {accountLine(account)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Opens the search and command palette. */
export function SearchButton() {
  const color = useThemeColor();
  return (
    <Button
      variant="ghost"
      size="icon"
      accessibilityLabel="Search"
      onPress={palette.open}
      icon={<Search size={18} color={color("muted-foreground")} />}
    />
  );
}
