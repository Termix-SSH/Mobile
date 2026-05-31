import { View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, Download } from "lucide-react-native";
import { useAppContext } from "../AppContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getVersionInfo, getLatestGitHubRelease } from "../main-axios";
import { useState, useEffect } from "react";
import Constants from "expo-constants";
import { Text, Button, Label } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

export default function UpdateRequired() {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const { setShowUpdateScreen } = useAppContext();
  const [latestRelease, setLatestRelease] = useState<{
    version: string;
    tagName: string;
    publishedAt: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentMobileAppVersion = Constants.expoConfig?.version || "1.0.0";

  useEffect(() => {
    const fetchVersionInfo = async () => {
      try {
        const [, release] = await Promise.all([
          getVersionInfo(),
          getLatestGitHubRelease(),
        ]);
        setLatestRelease(release);
      } catch {
        // best-effort
      } finally {
        setIsLoading(false);
      }
    };
    fetchVersionInfo();
  }, []);

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(
        "dismissedUpdateVersion",
        latestRelease?.version || "unknown",
      );
    } finally {
      setShowUpdateScreen(false);
    }
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator size="large" color={color("accent-brand")} />
        <Text className="mt-4 text-sm text-muted-foreground">
          Loading version information…
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2.5 border-b border-border px-5 py-4">
        <AlertTriangle size={20} color="#eab308" />
        <Text weight="bold" className="text-lg text-foreground">
          Update Available
        </Text>
      </View>

      <View className="flex-1 px-5 py-6">
        <View className="border border-border bg-card p-5">
          <View className="mb-3 flex-row items-center gap-2.5">
            <Download size={18} color={color("accent-brand")} />
            <Text weight="bold" className="text-base text-foreground">
              New version available
            </Text>
          </View>

          <Text className="mb-5 text-sm leading-5 text-muted-foreground">
            A newer version of the mobile app is available. Some features may
            not work correctly until you update.
          </Text>

          <View className="border border-border bg-muted/40 p-3.5">
            <Label className="mb-3">Version Information</Label>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">Installed</Text>
                <Text className="text-xs text-destructive">
                  v{currentMobileAppVersion}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-muted-foreground">Latest</Text>
                <Text className="text-xs text-accent-brand">
                  v{latestRelease?.version || "Unknown"}
                </Text>
              </View>
              {latestRelease?.tagName ? (
                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted-foreground">Tag</Text>
                  <Text className="text-xs text-muted-foreground">
                    {latestRelease.tagName}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      <View className="px-5" style={{ paddingBottom: insets.bottom + 20 }}>
        <Button variant="accent" size="lg" onPress={handleDismiss}>
          Continue Anyway
        </Button>
      </View>
    </View>
  );
}
