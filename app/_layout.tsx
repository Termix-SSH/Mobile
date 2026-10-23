import { Stack } from "expo-router";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { TerminalSessionsProvider } from "@/contexts/TerminalSessionsContext";
import { TerminalCustomizationProvider } from "@/contexts/TerminalCustomizationContext";
import { KeyboardProvider } from "@/contexts/KeyboardContext";
import { KeyboardCustomizationProvider } from "@/contexts/KeyboardCustomizationContext";
import {
  ThemeProvider,
  useTheme,
  useThemeColor,
} from "@/contexts/ThemeContext";
import { AppLockProvider, useAppLock } from "@/contexts/AppLockContext";
import { LockScreen } from "@/components/LockScreen";
import AuthFlow from "@/screens/authentication/AuthFlow";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "@/ui/Toast";
import { ConfirmProvider } from "@/ui/Confirm";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { FONT_MAP, MONO_FONT, MONO_FONT_BOLD } from "@/constants/fonts";
import "../global.css";
import UpdateRequired from "@/screens/authentication/UpdateRequired";
import { WidgetDeepLinkHost } from "@/widgets";
import { registerBuiltInFeatures } from "@/features";
import { AccountSwitcher } from "@/screens/accounts/AccountSwitcher";
import { LabLaunch } from "@/screens/dev/terminal-lab/LabLaunch";

registerBuiltInFeatures();

function RootLayoutContent() {
  const {
    authFlowVisible,
    openAuthFlow,
    showUpdateScreen,
    isLoading,
    setIsLoading,
  } = useAppContext();
  const accent = useThemeColor()("accent-brand");

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={accent} />
        <Text
          className="mt-4 text-base text-foreground"
          style={{ fontFamily: MONO_FONT }}
        >
          Initializing…
        </Text>
        <TouchableOpacity
          onPress={() => {
            setIsLoading(false);
            openAuthFlow("server");
          }}
          className="mt-6 border border-border bg-card px-6 py-3"
        >
          <Text
            className="text-foreground"
            style={{ fontFamily: MONO_FONT_BOLD }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showUpdateScreen) return <UpdateRequired />;

  // The tab shell always renders once loaded. When the user isn't connected,
  // the tabs themselves show a "no server connected" empty state. The auth flow
  // is layered on top as a dismissible full-screen overlay.
  return (
    <View className="flex-1 bg-background">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      {/* Home-screen widget taps: session navigation and the snippet run
          sheet. Mounted here so it is active for the whole session, including
          cold starts from a widget. */}
      <WidgetDeepLinkHost />
      <LabLaunch />
      <AccountSwitcher />
      <AppLockGate />
      {authFlowVisible ? (
        <View className="absolute inset-0 bg-background">
          <AuthFlow />
        </View>
      ) : null}
    </View>
  );
}

function AppLockGate() {
  const { enabled, locked } = useAppLock();
  if (!enabled || !locked) return null;
  return <LockScreen />;
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_MAP);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStatusBar />
          {!fontsLoaded ? (
            <View className="flex-1 bg-background" />
          ) : (
            <AppLockProvider>
              <AppProvider>
                <TerminalSessionsProvider>
                  <TerminalCustomizationProvider>
                    <KeyboardProvider>
                      <KeyboardCustomizationProvider>
                        <ConfirmProvider>
                          <RootLayoutContent />
                        </ConfirmProvider>
                        <Toaster />
                      </KeyboardCustomizationProvider>
                    </KeyboardProvider>
                  </TerminalCustomizationProvider>
                </TerminalSessionsProvider>
              </AppProvider>
            </AppLockProvider>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
