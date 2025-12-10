import { Stack } from "expo-router";
import { AppProvider, useAppContext } from "./AppContext";
import { TerminalSessionsProvider } from "./contexts/TerminalSessionsContext";
import { TerminalCustomizationProvider } from "./contexts/TerminalCustomizationContext";
import { KeyboardProvider } from "./contexts/KeyboardContext";
import { KeyboardCustomizationProvider } from "./contexts/KeyboardCustomizationContext";
import ServerForm from "@/app/authentication/ServerForm";
import LoginForm from "@/app/authentication/LoginForm";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import UpdateRequired from "@/app/authentication/UpdateRequired";

function RootLayoutContent() {
  const {
    showServerManager,
    setShowServerManager,
    showLoginForm,
    setShowLoginForm,
    isAuthenticated,
    showUpdateScreen,
    isLoading,
    setIsLoading,
  } = useAppContext();

  if (isLoading) {
    return (
      <View className="flex-1 bg-dark-bg justify-center items-center">
        <ActivityIndicator size="large" color="#22c55e" />
        <Text className="text-white text-lg mt-4">Initializing...</Text>
        <TouchableOpacity
          onPress={() => {
            setShowLoginForm(false);
            setShowServerManager(true);
          }}
          className="mt-6 px-6 py-3 bg-[#1a1a1a] border border-[#303032] rounded-lg"
        >
          <Text className="text-white font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showUpdateScreen) {
    return <UpdateRequired />;
  }

  if (showServerManager) {
    return <ServerForm />;
  }

  if (showLoginForm) {
    return <LoginForm />;
  }

  if (isAuthenticated) {
    return (
      <View className="flex-1 bg-dark-bg">
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#18181b" },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </View>
    );
  }

  return <LoginForm />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <TerminalSessionsProvider>
            <TerminalCustomizationProvider>
              <KeyboardProvider>
                <KeyboardCustomizationProvider>
                  <RootLayoutContent />
                  <Toaster
                    theme="dark"
                    position="top-center"
                    toastOptions={{
                      style: {
                        backgroundColor: "#18181b",
                        borderWidth: 1,
                        borderColor: "#27272a",
                      },
                    }}
                    richColors={false}
                    closeButton={true}
                    duration={4000}
                  />
                </KeyboardCustomizationProvider>
              </KeyboardProvider>
            </TerminalCustomizationProvider>
          </TerminalSessionsProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
