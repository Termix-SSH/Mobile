import { View } from "react-native";
import { ServerOff } from "lucide-react-native";
import { Button, EmptyState } from "@/ui";
import { useAppContext } from "@/contexts/AppContext";
import { useAccounts } from "@/core/accounts";
import { t } from "@/i18n";

/**
 * Shown inside a tab when there is no authenticated server connection. Prompts
 * the user to connect, opening the auth flow. Used across Hosts / Sessions so
 * the disconnected state is consistent.
 */
export function ConnectEmptyState({
  title = t("components.connectEmptyState.noServerConnected"),
  message = t("components.connectEmptyState.connectToATermixServer"),
}: {
  title?: string;
  message?: string;
}) {
  const { hasServerConfigured, openAuthFlow, openAccountSwitcher } =
    useAppContext();
  const { accounts } = useAccounts();

  return (
    <View className="flex-1 justify-center">
      <EmptyState
        icon={ServerOff}
        title={title}
        hint={message}
        action={
          <View className="items-center gap-2">
            <Button
              size="lg"
              className="min-w-48"
              onPress={() =>
                openAuthFlow(hasServerConfigured ? "login" : "server")
              }
            >
              {hasServerConfigured
                ? t("components.connectEmptyState.signIn")
                : t("components.connectEmptyState.addServer")}
            </Button>
            {accounts.length > 1 ? (
              <Button
                variant="ghost"
                className="min-w-48"
                onPress={openAccountSwitcher}
              >
                {t("components.connectEmptyState.switchAccount")}
              </Button>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
