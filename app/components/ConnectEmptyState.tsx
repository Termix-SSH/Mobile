import { View } from "react-native";
import { ServerOff } from "lucide-react-native";
import { Text, Button } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { useAppContext } from "@/app/AppContext";

/**
 * Shown inside a tab when there is no authenticated server connection. Prompts
 * the user to connect, opening the auth flow. Used across Hosts / Sessions so
 * the disconnected state is consistent.
 */
export function ConnectEmptyState({
  title = "No server connected",
  message = "Connect to a Termix server to manage your hosts, terminals and files.",
}: {
  title?: string;
  message?: string;
}) {
  const color = useThemeColor();
  const { hasServerConfigured, openAuthFlow } = useAppContext();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 border border-border bg-card items-center justify-center mb-5">
        <ServerOff size={28} color={color("muted-foreground")} />
      </View>
      <Text weight="bold" className="text-lg text-foreground text-center">
        {title}
      </Text>
      <Text className="text-sm text-muted-foreground text-center mt-2 leading-5">
        {message}
      </Text>
      <Button
        variant="accent"
        size="lg"
        className="mt-6 w-full max-w-xs"
        onPress={() => openAuthFlow(hasServerConfigured ? "login" : "server")}
      >
        {hasServerConfigured ? "Sign in" : "Add server"}
      </Button>
    </View>
  );
}
