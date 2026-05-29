import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAppContext } from "../AppContext";
import { useState, useEffect } from "react";
import { saveServerConfig, getCurrentServerUrl } from "../main-axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Server, ShieldAlert } from "lucide-react-native";
import { Text, Input, Button, Label } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

export default function ServerForm() {
  const {
    setShowServerManager,
    setShowLoginForm,
    setSelectedServer,
    selectedServer,
  } = useAppContext();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const [serverUrl, setServerUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const current = getCurrentServerUrl();
    if (current) setServerUrl(current);
    else if (selectedServer?.ip) setServerUrl(selectedServer.ip);
  }, [selectedServer]);

  const handleConnect = async () => {
    const url = serverUrl.trim();
    if (!url) {
      toast.error("Please enter a server address");
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      toast.error("Server address must start with http:// or https://");
      return;
    }

    setIsLoading(true);
    try {
      await saveServerConfig({
        serverUrl: url,
        lastUpdated: new Date().toISOString(),
      });
      setSelectedServer({ name: "Server", ip: url });
      setShowServerManager(false);
      setShowLoginForm(true);
    } catch (error: any) {
      toast.error(`Failed to save server: ${error?.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        style={{ paddingTop: insets.top }}
      >
        <View className="px-6 pb-12 items-center">
          {/* Brand mark */}
          <View className="w-16 h-16 border border-accent-brand/40 bg-accent-brand/10 items-center justify-center mb-5">
            <Server size={30} color={color("accent-brand")} />
          </View>
          <Text
            weight="bold"
            className="text-3xl tracking-[3px] text-foreground"
          >
            TERMIX
          </Text>
          <Text className="text-xs text-muted-foreground tracking-[2px] mt-1 mb-8">
            CONNECT TO YOUR SERVER
          </Text>

          {/* Card */}
          <View className="w-full max-w-md bg-card border border-border p-5">
            <Label>Server Address</Label>
            <View className="mt-2">
              <Input
                placeholder="https://termix.example.com"
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                keyboardType="url"
                editable={!isLoading}
                leading={<Server size={16} color={color("muted-foreground")} />}
                onSubmitEditing={handleConnect}
              />
            </View>
            <Text className="text-[11px] text-muted-foreground mt-2">
              Enter the address of your self-hosted Termix server, including
              http:// or https://.
            </Text>

            <Button
              variant="accent"
              size="lg"
              className="mt-5"
              loading={isLoading}
              onPress={handleConnect}
            >
              {isLoading ? "Saving…" : "Continue"}
            </Button>
          </View>

          {/* HTTPS / cert hint */}
          <View className="w-full max-w-md flex-row gap-2.5 mt-4 border border-border bg-card/60 px-3 py-2.5">
            <ShieldAlert
              size={15}
              color={color("muted-foreground")}
              style={{ marginTop: 1 }}
            />
            <Text className="flex-1 text-[10px] text-muted-foreground leading-4">
              Using a self-signed certificate? Install its root CA on your
              device first. Local HTTP servers are supported.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
