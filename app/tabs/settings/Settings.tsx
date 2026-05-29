import { useEffect, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  User,
  Palette,
  Shield,
  SlidersHorizontal,
  ChevronRight,
  Type,
  LogOut,
  Lock,
  KeyRound,
} from "lucide-react-native";
import { useAppContext } from "@/app/AppContext";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import { useTheme } from "@/app/contexts/ThemeContext";
import { useAppLock } from "@/app/contexts/AppLockContext";
import {
  clearAuth,
  logoutUser,
  getUserInfo,
  getVersionInfo,
  changePassword,
} from "@/app/main-axios";
import { Screen } from "@/app/components/Screen";
import {
  Text,
  Button,
  Input,
  Label,
  AccordionSection,
  SettingRow,
  FakeSwitch,
  SegmentedControl,
  Dialog,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import {
  ACCENT_PRESET_COLORS,
  FONT_SIZES,
  THEMES,
  THEME_LABELS,
  type ThemeId,
  type FontSizeId,
} from "@/app/constants/theme";
import { toast } from "@/app/utils/toast";

export default function Settings() {
  const router = useRouter();
  const color = useThemeColor();
  const {
    setAuthenticated,
    setShowLoginForm,
    setShowServerManager,
  } = useAppContext();
  const { clearAllSessions } = useTerminalSessions();
  const { theme, setTheme, accent, setAccent, fontSize, setFontSize } =
    useTheme();
  const appLock = useAppLock();

  const [username, setUsername] = useState("—");
  const [isAdmin, setIsAdmin] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [version, setVersion] = useState("");
  const [open, setOpen] = useState<string | null>("appearance");

  // App-lock PIN dialog
  const [pinDialog, setPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  // Change-password dialog
  const [pwDialog, setPwDialog] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");

  useEffect(() => {
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
  }, []);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  const handleLogout = async () => {
    try {
      await logoutUser();
      await clearAuth();
      clearAllSessions();
      setAuthenticated(false);
      setShowLoginForm(true);
      setShowServerManager(false);
    } catch {
      // best-effort
    }
  };

  const handleAppLockToggle = async (v: boolean) => {
    if (v) {
      setPin("");
      setPinDialog(true);
    } else {
      await appLock.disable();
      toast.success("App lock disabled");
    }
  };

  const confirmPin = async () => {
    if (pin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }
    await appLock.enable(pin);
    setPinDialog(false);
    toast.success("App lock enabled");
  };

  const handleChangePassword = async () => {
    if (!curPw || newPw.length < 6) {
      toast.error("Enter current password and a new one (min 6 chars)");
      return;
    }
    try {
      await changePassword(curPw, newPw);
      toast.success("Password updated");
      setPwDialog(false);
      setCurPw("");
      setNewPw("");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to update password");
    }
  };

  return (
    <Screen title="Settings">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      >
        {/* Account */}
        <AccordionSection
          label="Account"
          icon={<User size={14} color={color("muted-foreground")} />}
          open={open === "account"}
          onToggle={() => toggle("account")}
        >
          <View className="pt-3 gap-2.5">
            <View className="flex-row justify-between">
              <Label>Username</Label>
              <Text weight="medium" className="text-sm text-foreground">
                {username}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Label>Role</Label>
              <View className="px-1.5 py-0.5 bg-accent-brand/10 border border-accent-brand/40">
                <Text className="text-[10px] text-accent-brand uppercase tracking-wider">
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
            <Button
              variant="destructive"
              className="mt-2"
              onPress={handleLogout}
              icon={<LogOut size={15} color={color("destructive")} />}
            >
              Logout
            </Button>
          </View>
        </AccordionSection>

        {/* Appearance — headline feature */}
        <AccordionSection
          label="Appearance"
          icon={<Palette size={14} color={color("muted-foreground")} />}
          open={open === "appearance"}
          onToggle={() => toggle("appearance")}
        >
          <View className="pt-3 gap-4">
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
                      className={`flex-row items-center gap-1.5 px-2 py-1.5 border ${active ? "border-accent-brand/50 bg-accent-brand/10" : "border-border"}`}
                    >
                      {th.preview !== "auto" ? (
                        <View
                          style={{ backgroundColor: th.preview }}
                          className="w-3 h-3 border border-border/50"
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
                      className={`w-8 h-8 border-2 ${active ? "border-foreground" : "border-transparent"}`}
                    />
                  );
                })}
              </View>
              <View className="flex-row items-center gap-2 border border-border bg-card px-2.5 h-9 mt-1">
                <View
                  style={{ backgroundColor: accent }}
                  className="w-4 h-4 border border-border/60"
                />
                <Input
                  containerClassName="flex-1 h-9 border-0 bg-transparent px-0"
                  value={accent}
                  onChangeText={(v) => {
                    if (/^#[0-9a-fA-F]{6}$/.test(v.trim())) setAccent(v.trim());
                    else setAccent(v); // keep typing; ThemeProvider validates
                  }}
                  autoCapitalize="none"
                  placeholder="#f59145"
                />
                <Text className="text-[10px] text-muted-foreground">hex</Text>
              </View>
            </View>

            {/* Font size */}
            <View className="gap-2">
              <View className="flex-row items-center gap-1.5">
                <Type size={12} color={color("muted-foreground")} />
                <Label>Font Size</Label>
              </View>
              <SegmentedControl<FontSizeId>
                value={fontSize}
                onChange={setFontSize}
                options={FONT_SIZES.map((f) => ({ id: f.id, label: f.label }))}
              />
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
            >
              <FakeSwitch
                checked={appLock.enabled}
                onChange={handleAppLockToggle}
              />
            </SettingRow>
            <SettingRow
              label="Change Password"
              description="Update your account password"
              last
            >
              <Button
                variant="outline"
                size="sm"
                onPress={() => setPwDialog(true)}
                icon={<KeyRound size={14} color={color("foreground")} />}
              >
                Change
              </Button>
            </SettingRow>
          </View>
        </AccordionSection>

        {/* Customization */}
        <AccordionSection
          label="Customization"
          icon={<SlidersHorizontal size={14} color={color("muted-foreground")} />}
          open={open === "customization"}
          onToggle={() => toggle("customization")}
        >
          <View className="pt-2">
            <Pressable
              onPress={() =>
                router.push("/tabs/settings/TerminalCustomization" as any)
              }
              className="flex-row items-center justify-between py-3 border-b border-border"
            >
              <View>
                <Text weight="medium" className="text-sm text-foreground">
                  Terminal
                </Text>
                <Text className="text-[11px] text-muted-foreground mt-0.5">
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
                <Text className="text-[11px] text-muted-foreground mt-0.5">
                  Layout, keys, presets
                </Text>
              </View>
              <ChevronRight size={16} color={color("muted-foreground")} />
            </Pressable>
          </View>
        </AccordionSection>
      </ScrollView>

      {/* App-lock PIN dialog */}
      <Dialog
        visible={pinDialog}
        onClose={() => setPinDialog(false)}
        title="Set App Lock PIN"
        description="Choose a 4+ digit PIN. Biometrics will be used when available."
        icon={<Lock size={15} color={color("accent-brand")} />}
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={() => setPinDialog(false)}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onPress={confirmPin}>
              Enable
            </Button>
          </>
        }
      >
        <Input
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="••••"
          autoFocus
        />
      </Dialog>

      {/* Change-password dialog */}
      <Dialog
        visible={pwDialog}
        onClose={() => setPwDialog(false)}
        title="Change Password"
        icon={<KeyRound size={15} color={color("accent-brand")} />}
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={() => setPwDialog(false)}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onPress={handleChangePassword}>
              Update
            </Button>
          </>
        }
      >
        <View className="gap-3">
          <View className="gap-1.5">
            <Label>Current Password</Label>
            <Input
              value={curPw}
              onChangeText={setCurPw}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View className="gap-1.5">
            <Label>New Password</Label>
            <Input
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        </View>
      </Dialog>
    </Screen>
  );
}
