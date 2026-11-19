import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  ChevronDown,
  Search,
  Server,
  Smartphone,
} from "lucide-react-native";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  accountLabel,
  useActiveAccount,
  useActiveClient,
  type Account,
} from "@/core/accounts";
import { useUnreadAlerts } from "@/screens/notifications/unread";
import { palette } from "@/screens/palette/store";
import { Button, Text } from "@/ui";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

const STATUS: Record<string, string> = {
  idle: t("shell.appHeader.signedIn"),
  syncing: "Syncing",
  offline: "Offline",
  error: t("shell.appHeader.error"),
  signed_out: t("shell.appHeader.signedOut"),
};

/** One short line under the account name. */
export function accountLine(account: Account): string {
  if (account.kind === "local") return t("shell.appHeader.worksWithoutAServer");
  return [
    STATUS[account.status],
    account.options.sync === true
      ? t("shell.appHeader.copyOnThis", { deviceWord })
      : null,
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
      accessibilityLabel={t("shell.appHeader.accountSwitch", {
        account: accountLabel(account),
      })}
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
      accessibilityLabel={t("shell.appHeader.search")}
      onPress={palette.open}
      icon={<Search size={18} color={color("muted-foreground")} />}
    />
  );
}

/** Opens the notifications inbox, with the unread count on it. */
export function NotificationsButton() {
  const color = useThemeColor();
  const client = useActiveClient();
  const unread = useUnreadAlerts();
  if (!client || !client.api.alerts.available()) return null;
  return (
    <View>
      <Button
        variant="ghost"
        size="icon"
        accessibilityLabel={
          unread > 0
            ? t("shell.appHeader.notificationsUnread", { unread })
            : t("shell.appHeader.notifications")
        }
        onPress={() => router.push("/tabs/settings/Notifications" as never)}
        icon={<Bell size={18} color={color("muted-foreground")} />}
      />
      {unread > 0 ? (
        <View
          pointerEvents="none"
          className="absolute right-0.5 top-0.5 min-w-4 items-center bg-accent-brand px-1"
        >
          <Text weight="bold" className="text-2xs text-background">
            {unread > 99 ? "99+" : String(unread)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
