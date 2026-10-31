import { View } from "react-native";
import { ServerOff } from "lucide-react-native";
import { Button, EmptyState } from "@/ui";
import { useAppContext } from "@/contexts/AppContext";
import { useAccounts } from "@/core/accounts";

/**
 * Shown inside a tab when there is no authenticated server connection. Prompts
 * the user to connect, opening the auth flow. Used across Hosts / Sessions so
 * the disconnected state is consistent.
 */
export function ConnectEmptyState({
  title = "No server connected",
  message = "Connect to a Termix server to manage your hosts, terminals, files and more.",
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
              {hasServerConfigured ? "Sign in" : "Add server"}
            </Button>
            {accounts.length > 1 ? (
              <Button
                variant="ghost"
                className="min-w-48"
                onPress={openAccountSwitcher}
              >
                Switch account
              </Button>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
