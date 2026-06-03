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
  message = "Connect to a Termix server to manage your hosts, terminals, files and more.",
}: {
  title?: string;
  message?: string;
}) {
  const color = useThemeColor();
  const { hasServerConfigured, openAuthFlow } = useAppContext();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="mb-5 h-16 w-16 items-center justify-center border border-border bg-card">
        <ServerOff size={28} color={color("muted-foreground")} />
      </View>
      <Text weight="bold" className="text-center text-lg text-foreground">
        {title}
      </Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
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
