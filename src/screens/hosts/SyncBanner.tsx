import { ActivityIndicator, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { isServerAccount, useActiveAccount } from "@/core/accounts";
import { describeReason, useAccountSync } from "@/core/sync";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useSyncFix } from "@/screens/accounts/useSyncFix";
import { Button, Text } from "@/ui";

/** Reasons that need the user; offline and server hiccups retry on their own. */
const SHOWN = new Set([
  "expired",
  "revoked",
  "proxy_login",
  "basic_auth",
  "client_cert",
  "tls",
  "version_mismatch",
  "different_account",
]);

/**
 * Says why the active server stopped syncing and offers the quickest fix,
 * or that its hosts are on their way the first time.
 */
export function SyncBanner() {
  const color = useThemeColor();
  const account = useActiveAccount();
  const status = useAccountSync(account.id);
  const { openAuthFlow } = useAppContext();
  const { fix, overlay } = useSyncFix(account.id, () => openAuthFlow("login"));

  if (!isServerAccount(account) || account.options.sync !== true) return null;

  const reason = status.reason ?? account.lastError;
  if (status.state === "syncing" && !status.lastSyncAt && !account.lastSyncAt) {
    return (
      <View className="mt-2 flex-row items-center gap-2 border border-border bg-card p-3">
        <ActivityIndicator size="small" color={color("accent-brand")} />
        <Text className="flex-1 text-xs text-muted-foreground">
          Getting your hosts from the server
        </Text>
      </View>
    );
  }
  if (!reason || !SHOWN.has(reason)) return null;

  const text = describeReason(reason);
  return (
    <View className="mt-2 border border-border bg-card p-3">
      <View className="flex-row items-start gap-2">
        <AlertTriangle
          size={15}
          color={color("destructive")}
          style={{ marginTop: 1 }}
        />
        <View className="flex-1">
          <Text weight="medium" className="text-sm text-foreground">
            {text.title}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {text.message} Your hosts stay on this phone meanwhile.
          </Text>
        </View>
      </View>
      {text.fix && text.fixLabel ? (
        <Button
          size="sm"
          className="mt-3 self-start"
          onPress={() => fix(text.fix!)}
        >
          {text.fixLabel}
        </Button>
      ) : null}
      {overlay}
    </View>
  );
}
