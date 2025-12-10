import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, AlertTriangle, Download } from "lucide-react-native";
import { useAppContext } from "../AppContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getVersionInfo, getLatestGitHubRelease } from "../main-axios";
import { useState, useEffect } from "react";
import Constants from "expo-constants";

export default function UpdateRequired() {
  const insets = useSafeAreaInsets();
  const { setShowUpdateScreen } = useAppContext();
  const [versionInfo, setVersionInfo] = useState<{
    localVersion: string;
    serverVersion: string;
  } | null>(null);
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
        const [version, release] = await Promise.all([
          getVersionInfo(),
          getLatestGitHubRelease(),
        ]);
        setVersionInfo(version);
        setLatestRelease(release);
      } catch (error) {
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
      setShowUpdateScreen(false);
    } catch (error) {
      setShowUpdateScreen(false);
    }
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-[#18181b] justify-center items-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator size="large" color="#22C55E" />
        <Text className="text-white text-lg">
          Loading version information...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#18181b]" style={{ paddingTop: insets.top }}>
      <View className="flex-row justify-between items-center px-6 py-4 border-b border-[#303032]">
        <View className="flex-row items-center gap-3">
          <AlertTriangle size={24} color="#f59e0b" />
          <Text className="text-white text-xl font-bold">Update Required</Text>
        </View>
      </View>

      <View className="flex-1 px-6 py-8">
        <View className="bg-[#1a1a1a] rounded-lg p-6 border border-[#303032] mb-6">
          <View className="flex-row items-center gap-3 mb-4">
            <Download size={24} color="#22c55e" />
            <Text className="text-white text-lg font-semibold">
              Version Mismatch Detected
            </Text>
          </View>

          <Text className="text-gray-300 text-base leading-6 mb-6">
            A new version of the mobile app is available. Some features may not
            work properly until you update to the latest version.
          </Text>

          <View className="bg-[#27272a] rounded-md p-4 border border-[#3f3f46]">
            <Text className="text-white font-semibold mb-3">
              Version Information:
            </Text>

            <View className="space-y-2">
              <View className="flex-row justify-between">
                <Text className="text-gray-300">Current Version:</Text>
                <Text className="text-red-400 font-mono">
                  {currentMobileAppVersion}
                </Text>
              </View>

              <View className="flex-row justify-between">
                <Text className="text-gray-300">Latest Release:</Text>
                <Text className="text-green-500 font-mono">
                  {latestRelease?.version || "Unknown"}
                </Text>
              </View>

              {latestRelease?.tagName && (
                <View className="flex-row justify-between">
                  <Text className="text-gray-300">Release Tag:</Text>
                  <Text className="text-green-400 font-mono text-xs">
                    {latestRelease.tagName}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <View className="px-6 pb-6" style={{ paddingBottom: insets.bottom + 24 }}>
        <TouchableOpacity
          onPress={handleDismiss}
          className="bg-green-600 rounded-lg py-4 px-6"
          activeOpacity={0.7}
        >
          <Text className="text-white text-center font-semibold text-lg">
            Continue Anyway
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
