import { Stack } from "expo-router";
import { AppProvider, useAppContext } from "./AppContext";
import { TerminalSessionsProvider } from "./contexts/TerminalSessionsContext";
import { TerminalCustomizationProvider } from "./contexts/TerminalCustomizationContext";
import { KeyboardProvider } from "./contexts/KeyboardContext";
import { KeyboardCustomizationProvider } from "./contexts/KeyboardCustomizationContext";
import {
  ThemeProvider,
  useTheme,
  useThemeColor,
} from "./contexts/ThemeContext";
import { AppLockProvider, useAppLock } from "./contexts/AppLockContext";
import { LockScreen } from "@/app/components/LockScreen";
import AuthFlow from "@/app/authentication/AuthFlow";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "sonner-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { FONT_MAP, MONO_FONT, MONO_FONT_BOLD } from "./constants/fonts";
import "../global.css";
import UpdateRequired from "@/app/authentication/UpdateRequired";

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

function ThemedToaster() {
  const { isDark } = useTheme();
  const card = useThemeColor()("card");
  const border = useThemeColor()("border");
  return (
    <Toaster
      theme={isDark ? "dark" : "light"}
      position="top-center"
      toastOptions={{
        style: {
          backgroundColor: card,
          borderWidth: 1,
          borderColor: border,
          borderRadius: 0,
        },
      }}
      richColors={false}
      closeButton
      duration={4000}
    />
  );
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
                        <RootLayoutContent />
                        <ThemedToaster />
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
