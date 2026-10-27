import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronRight,
  Download,
  Server,
  Smartphone,
} from "lucide-react-native";
import { Button, Label, Text } from "@/ui";
import { ScreenHeader } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { LOCAL_ACCOUNT_ID } from "@/core/accounts/types";
import { ImportPanel } from "@/features/host-transfer/ImportPanel";
import { useRestoreBackup } from "@/screens/settings/RestoreBackup";

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
  const restore = useRestoreBackup({
    accountId: LOCAL_ACCOUNT_ID,
    accountName: "This device",
    askFirst: false,
    onDone: () => setImported(true),
  });

  if (view === "import") {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Import" onBack={() => setView("choose")} />
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 20,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2">
            <Label>Hosts</Label>
            <Text className="text-sm leading-5 text-muted-foreground">
              A Termix host file, your ~/.ssh/config, or a host link or QR code
              from another phone. They are saved on this phone.
            </Text>
            <ImportPanel
              onImported={(r) => r.created > 0 && setImported(true)}
            />
          </View>
          <View className="gap-2">
            <Label>Backup</Label>
            <Text className="text-sm leading-5 text-muted-foreground">
              A backup this app made, locked with a passphrase. It brings back
              hosts, credentials and snippets.
            </Text>
            <Button variant="muted" onPress={() => void restore.start()}>
              Restore a backup
            </Button>
          </View>
          <Button size="lg" onPress={() => onDone("import")}>
            {imported ? "Done" : "Skip for now"}
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
          TERMIX
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          SSH, files and remote desktops from your phone. How do you want to
          start?
        </Text>
      </View>

      <View className="gap-3">
        <Choice
          primary
          icon={<Smartphone size={20} color={accent} />}
          title="Use without a server"
          body="Hosts, credentials and snippets are kept encrypted on this phone. You can link a server any time later."
          onPress={() => onDone("standalone")}
        />
        <Choice
          icon={<Server size={20} color={fg} />}
          title="Link a Termix server"
          body="Sync your hosts, credentials, snippets and settings with your server and use its plugins."
          onPress={() => onDone("link")}
        />
        <Choice
          icon={<Download size={20} color={fg} />}
          title="Import"
          body="Bring hosts from a Termix file, an SSH config, a QR code or a backup."
          onPress={() => setView("import")}
        />
      </View>
    </ScrollView>
  );
}
