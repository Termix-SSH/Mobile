import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronRight,
  Download,
  Languages,
  Server,
  Smartphone,
} from "lucide-react-native";
import { Button, Label, Sheet, SheetRow, Text } from "@/ui";
import { ScreenHeader } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { LOCAL_ACCOUNT_ID } from "@/core/accounts/types";
import { ImportPanel } from "@/features/host-transfer/ImportPanel";
import { useRestoreBackup } from "@/screens/settings/RestoreBackup";
import { deviceWord } from "@/utils/device-word";
import { savedLanguage, t } from "@/i18n";
import {
  currentLanguageLabel,
  languageOptions,
  switchLanguage,
} from "@/i18n/options";

export type WelcomeChoice = "standalone" | "link" | "import";

function Choice({
  icon,
  title,
  body,
  primary,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const color = useThemeColor();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      className={`min-h-20 flex-row items-center gap-3 border p-4 active:bg-muted/50 ${
        primary
          ? "border-accent-brand/60 bg-accent-brand/10"
          : "border-border bg-card"
      }`}
    >
      <View
        className={`h-11 w-11 items-center justify-center border ${
          primary ? "border-accent-brand/40" : "border-border"
        }`}
      >
        {icon}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text weight="bold" className="text-base text-foreground">
          {title}
        </Text>
        <Text className="text-meta leading-4 text-muted-foreground">
          {body}
        </Text>
      </View>
      <ChevronRight size={18} color={color("muted-foreground")} />
    </Pressable>
  );
}

/**
 * The first screen of a new install. Using the app with no server is the
 * main path; linking a server and importing hosts are the other two.
 */
export default function Welcome({
  onDone,
}: {
  onDone: (choice: WelcomeChoice) => void;
}) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const accent = color("accent-brand");
  const fg = color("foreground");
  const [view, setView] = useState<"choose" | "import">("choose");
  const [imported, setImported] = useState(false);
  const [picking, setPicking] = useState(false);
  const restore = useRestoreBackup({
    accountId: LOCAL_ACCOUNT_ID,
    accountName: t("onboarding.welcome.thisDevice"),
    askFirst: false,
    onDone: () => setImported(true),
  });

  if (view === "import") {
    return (
      <View
        className="flex-1 bg-background"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <ScreenHeader
          title={t("onboarding.welcome.import")}
          onBack={() => setView("choose")}
        />
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 20,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2">
            <Label>{t("onboarding.welcome.hosts")}</Label>
            <Text className="text-sm leading-5 text-muted-foreground">
              {t("onboarding.welcome.aTermixHostFileYour", { deviceWord })}
            </Text>
            <ImportPanel
              onImported={(r) => r.created > 0 && setImported(true)}
            />
          </View>
          <View className="gap-2">
            <Label>{t("onboarding.welcome.backup")}</Label>
            <Text className="text-sm leading-5 text-muted-foreground">
              {t("onboarding.welcome.aBackupThisAppMade")}
            </Text>
            <Button variant="muted" onPress={() => void restore.start()}>
              {t("onboarding.welcome.restoreABackup")}
            </Button>
          </View>
          <Button size="lg" onPress={() => onDone("import")}>
            {imported
              ? t("onboarding.welcome.done")
              : t("onboarding.welcome.skipForNow")}
          </Button>
        </ScrollView>
        {restore.sheet}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: 20,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingLeft: insets.left + 20,
        paddingRight: insets.right + 20,
        gap: 24,
      }}
    >
      <View className="gap-2">
        <View className="h-14 w-14 items-center justify-center border border-accent-brand/40 bg-accent-brand/10">
          <Server size={28} color={accent} />
        </View>
        <Text
          weight="bold"
          className="mt-2 text-3xl tracking-[3px] text-foreground"
        >
          {"TERMIX"}
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {t("onboarding.welcome.sshFilesAndRemoteDesktops", { deviceWord })}
        </Text>
      </View>

      <View className="gap-3">
        <Choice
          primary
          icon={<Smartphone size={20} color={accent} />}
          title={t("onboarding.welcome.useWithoutAServer")}
          body={t("onboarding.welcome.hostsCredentialsAndSnippetsAre", {
            deviceWord,
          })}
          onPress={() => onDone("standalone")}
        />
        <Choice
          icon={<Server size={20} color={fg} />}
          title={t("onboarding.welcome.linkATermixServer")}
          body={t("onboarding.welcome.syncYourHostsCredentialsSnippets")}
          onPress={() => onDone("link")}
        />
        <Choice
          icon={<Download size={20} color={fg} />}
          title={t("onboarding.welcome.import")}
          body={t("onboarding.welcome.bringHostsFromATermix")}
          onPress={() => setView("import")}
        />
      </View>

      <Pressable
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t("settings.language.label")}: ${currentLanguageLabel()}`}
        className="min-h-11 flex-row items-center justify-center gap-2 self-center px-3 active:opacity-70"
      >
        <Languages size={16} color={color("muted-foreground")} />
        <Text className="text-sm text-muted-foreground">
          {currentLanguageLabel()}
        </Text>
        <ChevronRight size={14} color={color("muted-foreground")} />
      </Pressable>

      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("settings.language.label")}
        scroll
      >
        {languageOptions().map((o) => (
          <SheetRow
            key={o.value}
            label={o.label}
            description={o.description}
            selected={o.value === savedLanguage()}
            onPress={() => {
              setPicking(false);
              switchLanguage(o.value);
            }}
          />
        ))}
      </Sheet>
    </ScrollView>
  );
}
