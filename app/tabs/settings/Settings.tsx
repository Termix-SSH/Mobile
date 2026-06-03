import { useEffect, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  User,
  Palette,
  Shield,
  SlidersHorizontal,
  ChevronRight,
  LogOut,
  Lock,
  Server as ServerIcon,
  ShieldCheck,
  Monitor,
  Key,
  FileText,
} from "lucide-react-native";
import { useAppContext } from "@/app/AppContext";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import { useTheme, useThemeColor } from "@/app/contexts/ThemeContext";
import { useAppLock } from "@/app/contexts/AppLockContext";
import {
  clearSession,
  logoutUser,
  getUserInfo,
  getVersionInfo,
  getCurrentServerUrl,
} from "@/app/main-axios";
import { Screen } from "@/app/components/Screen";
import { LockScreen } from "@/app/components/LockScreen";
import {
  Text,
  Button,
  Input,
  Label,
  AccordionSection,
  SettingRow,
  FakeSwitch,
  Dialog,
} from "@/app/components/ui";
import {
  ACCENT_PRESET_COLORS,
  THEMES,
  THEME_LABELS,
  type ThemeId,
} from "@/app/constants/theme";
import { toast } from "@/app/utils/toast";

export default function Settings() {
  const router = useRouter();
  const color = useThemeColor();
  const appVersion = Constants.expoConfig?.version ?? "";
  const { isAuthenticated, setAuthenticated, openAuthFlow, authFlowVisible } =
    useAppContext();
  const { clearAllSessions } = useTerminalSessions();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const appLock = useAppLock();

  const [accentDraft, setAccentDraft] = useState(accent);

  // Keep draft in sync when accent changes from a swatch tap
  useEffect(() => {
    setAccentDraft(accent);
  }, [accent]);

  const [username, setUsername] = useState("—");
  const [isAdmin, setIsAdmin] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [version, setVersion] = useState("");
  const [serverUrl, setServerUrl] = useState<string>(
    () => getCurrentServerUrl() ?? "",
  );
  const [open, setOpen] = useState<string | null>("appearance");

  // App-lock PIN setup dialog (two-step: enter then confirm)
  const [pinDialog, setPinDialog] = useState(false);
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pin, setPin] = useState(""); // first entry
  const [confirm, setConfirm] = useState(""); // second entry
  // Re-auth gate shown before disabling app lock.
  const [reauth, setReauth] = useState<null | "disable">(null);

  // Re-read on auth changes and whenever the auth flow closes — the user may
  // have just changed the active server inside it (which leaves isAuthenticated
  // unchanged, so we can't rely on that alone).
  useEffect(() => {
    if (authFlowVisible) return;
    setServerUrl(getCurrentServerUrl() ?? "");
    if (!isAuthenticated) {
      setUsername("—");
      setIsAdmin(false);
      setTotpEnabled(false);
      return;
    }
    getUserInfo()
      .then((u) => {
        setUsername(u.username ?? "—");
        setIsAdmin(!!u.is_admin);
        setTotpEnabled(!!u.totp_enabled);
      })
      .catch(() => {});
    getVersionInfo()
      .then((v) => setVersion(v?.localVersion ?? v?.version ?? ""))
      .catch(() => {});
  }, [isAuthenticated, authFlowVisible]);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // best-effort — server-side logout may fail if token already expired
    }
    await clearSession();
    clearAllSessions();
    setAuthenticated(false);
    // The tabs fall back to their "no server connected" empty states; the user
    // re-authenticates from there or from this Server section.
  };

  const handleChangeServer = async () => {
    // Mirror sign-out: invalidate the server-side session too (not just the
    // local JWT), otherwise the still-valid Termix cookie in the browser/WebView
    // lets the next OIDC resume the old account.
    try {
      await logoutUser();
    } catch {
      // best-effort — session may already be gone
    }
    await clearSession();
    openAuthFlow("server");
  };

  const handleAppLockToggle = (v: boolean) => {
    if (v) {
      setPin("");
      setConfirm("");
      setPinStep("enter");
      setPinDialog(true);
    } else {
      // Require re-authentication before disabling — the switch stays on
      // (it's controlled by appLock.enabled) until the gate succeeds.
      setReauth("disable");
    }
  };

  const advancePin = async () => {
    if (pinStep === "enter") {
      if (pin.length !== 4) {
        toast.error("PIN must be 4 digits");
        return;
      }
      setPinStep("confirm");
      return;
    }
    if (confirm !== pin) {
      toast.error("PINs don't match");
      setPin("");
      setConfirm("");
      setPinStep("enter");
      return;
    }
    await appLock.enable(pin);
    setPinDialog(false);
    toast.success("App lock enabled");
  };

  const closePinDialog = () => {
    setPinDialog(false);
    setPin("");
    setConfirm("");
    setPinStep("enter");
  };

  return (
    <Screen title="Settings">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      >
        {/* Server */}
        <AccordionSection
          label="Server"
          icon={<ServerIcon size={14} color={color("muted-foreground")} />}
          open={open === "server"}
          onToggle={() => toggle("server")}
        >
          <View className="gap-2.5 pt-3">
            <View className="gap-1">
              <Label>Active Server</Label>
              <View className="flex-row items-center gap-2">
                <View
                  className={`h-2 w-2 rounded-full ${isAuthenticated ? "bg-accent-brand" : "bg-muted-foreground"}`}
                />
                <Text
                  weight="medium"
                  className="flex-1 text-sm text-foreground"
                  numberOfLines={1}
                >
                  {serverUrl
                    ? serverUrl.replace(/^https?:\/\//, "")
                    : "Not configured"}
                </Text>
              </View>
              <Text className="text-[11px] text-muted-foreground">
                {isAuthenticated
                  ? "Connected"
                  : serverUrl
                    ? "Configured but not signed in"
                    : "No server added yet"}
              </Text>
            </View>

            <Button
              variant="outline"
              className="mt-1"
              onPress={handleChangeServer}
              icon={<ServerIcon size={15} color={color("foreground")} />}
            >
              {serverUrl ? "Change server" : "Add server"}
            </Button>

            {isAuthenticated ? (
              <Button
                variant="destructive"
                onPress={handleLogout}
                icon={<LogOut size={15} color={color("destructive")} />}
              >
                Sign out
              </Button>
            ) : serverUrl ? (
              <Button variant="accent" onPress={() => openAuthFlow("login")}>
                Sign in
              </Button>
            ) : null}
          </View>
        </AccordionSection>

        {/* Account */}
        {isAuthenticated ? (
          <AccordionSection
            label="Account"
            icon={<User size={14} color={color("muted-foreground")} />}
            open={open === "account"}
            onToggle={() => toggle("account")}
          >
            <View className="gap-2.5 pt-3">
              <View className="flex-row justify-between">
                <Label>Username</Label>
                <Text weight="medium" className="text-sm text-foreground">
                  {username}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Label>Role</Label>
                <View className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                  <Text className="text-[10px] uppercase tracking-wider text-accent-brand">
                    {isAdmin ? "Administrator" : "User"}
                  </Text>
                </View>
              </View>
              <View className="flex-row justify-between">
                <Label>2FA</Label>
                <Text
                  weight="medium"
                  className={`text-sm ${totpEnabled ? "text-accent-brand" : "text-muted-foreground"}`}
                >
                  {totpEnabled ? "Enabled" : "Disabled"}
                </Text>
              </View>
              {version ? (
                <View className="flex-row justify-between">
                  <Label>Version</Label>
                  <Text weight="medium" className="text-sm text-accent-brand">
                    v{version}
                  </Text>
                </View>
              ) : null}

              <View className="mt-1 gap-0">
                <Pressable
                  onPress={() => router.push("/tabs/settings/TwoFactorAuth" as any)}
                  className="flex-row items-center justify-between border-t border-border py-3"
                >
                  <View className="flex-row items-center gap-2">
                    <ShieldCheck size={15} color={color("muted-foreground")} />
                    <Text weight="medium" className="text-sm text-foreground">
                      Two-Factor Authentication
                    </Text>
                  </View>
                  <ChevronRight size={15} color={color("muted-foreground")} />
                </Pressable>
                {isAdmin ? (
                  <Pressable
                    onPress={() => router.push("/tabs/settings/ActiveSessions" as any)}
                    className="flex-row items-center justify-between border-t border-border py-3"
                  >
                    <View className="flex-row items-center gap-2">
                      <Monitor size={15} color={color("muted-foreground")} />
                      <Text weight="medium" className="text-sm text-foreground">
                        Active Sessions
                      </Text>
                    </View>
                    <ChevronRight size={15} color={color("muted-foreground")} />
                  </Pressable>
                ) : null}
                {isAdmin ? (
                  <Pressable
                    onPress={() => router.push("/tabs/settings/ApiKeys" as any)}
                    className="flex-row items-center justify-between border-t border-border py-3"
                  >
                    <View className="flex-row items-center gap-2">
                      <Key size={15} color={color("muted-foreground")} />
                      <Text weight="medium" className="text-sm text-foreground">
                        API Keys
                      </Text>
                    </View>
                    <ChevronRight size={15} color={color("muted-foreground")} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push("/tabs/settings/Snippets" as any)}
                  className="flex-row items-center justify-between border-t border-border py-3"
                >
                  <View className="flex-row items-center gap-2">
                    <FileText size={15} color={color("muted-foreground")} />
                    <Text weight="medium" className="text-sm text-foreground">
                      Snippets
                    </Text>
                  </View>
                  <ChevronRight size={15} color={color("muted-foreground")} />
                </Pressable>
              </View>
            </View>
          </AccordionSection>
        ) : null}

        {/* Appearance — headline feature */}
        <AccordionSection
          label="Appearance"
          icon={<Palette size={14} color={color("muted-foreground")} />}
          open={open === "appearance"}
          onToggle={() => toggle("appearance")}
        >
          <View className="gap-4 pt-3">
            {/* Theme */}
            <View className="gap-2">
              <Label>Theme</Label>
              <View className="flex-row flex-wrap gap-1.5">
                {THEMES.map((th) => {
                  const active = theme === th.id;
                  return (
                    <Pressable
                      key={th.id}
                      onPress={() => setTheme(th.id as ThemeId)}
                      className={`flex-row items-center gap-1.5 border px-2 py-1.5 ${active ? "border-accent-brand/50 bg-accent-brand/10" : "border-border"}`}
                    >
                      {th.preview !== "auto" ? (
                        <View
                          style={{ backgroundColor: th.preview }}
                          className="h-3 w-3 border border-border/50"
                        />
                      ) : null}
                      <Text
                        className={`text-[11px] ${active ? "text-accent-brand" : "text-muted-foreground"}`}
                      >
                        {THEME_LABELS[th.id]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Accent color */}
            <View className="gap-2">
              <Label>Accent Color</Label>
              <View className="flex-row flex-wrap gap-2">
                {ACCENT_PRESET_COLORS.map((ac) => {
                  const active =
                    accent.toLowerCase() === ac.value.toLowerCase();
                  return (
                    <Pressable
                      key={ac.value}
                      onPress={() => setAccent(ac.value)}
                      style={{ backgroundColor: ac.value }}
                      className={`h-8 w-8 border-2 ${active ? "border-foreground" : "border-transparent"}`}
                    />
                  );
                })}
              </View>
              <View className="mt-1 h-9 flex-row items-center gap-2 border border-border bg-card px-2.5">
                <View
                  style={{ backgroundColor: accent }}
                  className="h-4 w-4 border border-border/60"
                />
                <Input
                  containerClassName="flex-1 h-9 border-0 bg-transparent px-0"
                  value={accentDraft}
                  onChangeText={(v) => {
                    setAccentDraft(v);
                    if (/^#[0-9a-fA-F]{6}$/.test(v.trim())) setAccent(v.trim());
                  }}
                  onBlur={() => {
                    if (!/^#[0-9a-fA-F]{6}$/.test(accentDraft.trim())) {
                      setAccentDraft(accent);
                    }
                  }}
                  autoCapitalize="none"
                  placeholder="#f59145"
                />
                <Text className="text-[10px] text-muted-foreground">hex</Text>
              </View>
            </View>
          </View>
        </AccordionSection>

        {/* Security */}
        <AccordionSection
          label="Security"
          icon={<Shield size={14} color={color("muted-foreground")} />}
          open={open === "security"}
          onToggle={() => toggle("security")}
        >
          <View className="pt-1">
            <SettingRow
              label="App Lock"
              description={
                appLock.hasBiometrics
                  ? "Require biometrics or PIN to open the app"
                  : "Require a PIN to open the app"
              }
              last
            >
              <FakeSwitch
                checked={appLock.enabled}
                onChange={handleAppLockToggle}
              />
            </SettingRow>
          </View>
        </AccordionSection>

        {/* Customization */}
        <AccordionSection
          label="Customization"
          icon={
            <SlidersHorizontal size={14} color={color("muted-foreground")} />
          }
          open={open === "customization"}
          onToggle={() => toggle("customization")}
        >
          <View className="pt-2">
            <Pressable
              onPress={() =>
                router.push("/tabs/settings/TerminalCustomization" as any)
              }
              className="flex-row items-center justify-between border-b border-border py-3"
            >
              <View>
                <Text weight="medium" className="text-sm text-foreground">
                  Terminal
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted-foreground">
                  Font, theme, cursor, scrollback
                </Text>
              </View>
              <ChevronRight size={16} color={color("muted-foreground")} />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push("/tabs/settings/KeyboardCustomization" as any)
              }
              className="flex-row items-center justify-between py-3"
            >
              <View>
                <Text weight="medium" className="text-sm text-foreground">
                  Keyboard
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted-foreground">
                  Layout, keys, presets
                </Text>
              </View>
              <ChevronRight size={16} color={color("muted-foreground")} />
            </Pressable>
          </View>
        </AccordionSection>

        {/* Version footer */}
        <Text className="mt-4 text-center text-[11px] text-muted-foreground">
          {appVersion ? `Termix Mobile v${appVersion}` : "Termix Mobile"}
        </Text>
      </ScrollView>

      {/* App-lock PIN setup dialog (two-step) */}
      <Dialog
        visible={pinDialog}
        onClose={closePinDialog}
        title={pinStep === "enter" ? "Set App Lock PIN" : "Confirm PIN"}
        description={
          pinStep === "enter"
            ? "Choose a 4-digit PIN. Biometrics can be used to unlock when available."
            : "Re-enter your PIN to confirm."
        }
        icon={<Lock size={15} color={color("accent-brand")} />}
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={closePinDialog}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onPress={advancePin}>
              {pinStep === "enter" ? "Next" : "Enable"}
            </Button>
          </>
        }
      >
        {pinStep === "enter" ? (
          <Input
            key="pin-enter"
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="••••"
            autoFocus
          />
        ) : (
          <Input
            key="pin-confirm"
            value={confirm}
            onChangeText={(v) => setConfirm(v.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="••••"
            autoFocus
          />
        )}
      </Dialog>

      {/* Re-auth gate before disabling app lock */}
      {reauth === "disable" ? (
        <LockScreen
          title="Confirm it's you"
          subtitle="Enter your PIN to disable App Lock"
          onVerifyPin={appLock.verifyPin}
          onBiometric={appLock.authenticateBiometrics}
          onCancel={() => setReauth(null)}
          onSuccess={async () => {
            await appLock.disable();
            setReauth(null);
            toast.success("App lock disabled");
          }}
        />
      ) : null}
    </Screen>
  );
}
