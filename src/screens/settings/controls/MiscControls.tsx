import { useState } from "react";
import { Platform, View } from "react-native";
import Constants from "expo-constants";
import { useAccounts } from "@/core/accounts";
import { clearRecent } from "@/core/hosts/recent";
import { getLatestGitHubRelease, isNewerVersion } from "@/core/updates";
import { Button, SettingRow, Text } from "@/ui";
import { toast } from "@/utils/toast";
import { BackgroundSessionsSection } from "../BackgroundSessionsSection";

export function BackgroundSessionsControl() {
  return <BackgroundSessionsSection />;
}

export function PrivacyNoteControl() {
  return (
    <View className="py-3">
      <Text className="text-meta text-muted-foreground">
        Hosts, credentials and snippets are kept in an encrypted file on this
        phone. Usage statistics are off unless you turn them on below. A linked
        server only gets what you let it sync.
      </Text>
    </View>
  );
}

export function ClearRecentControl() {
  const { accounts: list } = useAccounts();
  const [busy, setBusy] = useState(false);
  return (
    <SettingRow
      label="Recent hosts"
      description="Forget the hosts you opened lately on every account"
      last
    >
      <Button
        variant="muted"
        size="sm"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await Promise.all(list.map((a) => clearRecent(a.id)));
            toast.success("Recent hosts cleared");
          } finally {
            setBusy(false);
          }
        }}
      >
        Clear
      </Button>
    </SettingRow>
  );
}

export function VersionControl() {
  const version = Constants.expoConfig?.version ?? "";
  const [state, setState] = useState<"idle" | "busy">("idle");
  const check = async () => {
    setState("busy");
    try {
      const latest = await getLatestGitHubRelease();
      if (!latest) toast.error("Could not check for updates");
      else if (isNewerVersion(latest.version, version)) {
        toast.info(`Version ${latest.version} is out. Update from your store.`);
      } else toast.success("You have the newest version");
    } finally {
      setState("idle");
    }
  };
  return (
    <>
      <SettingRow label="Termix Mobile" description={`${Platform.OS}`}>
        <Text className="text-row text-muted-foreground">
          {version ? `v${version}` : "-"}
        </Text>
      </SettingRow>
      <SettingRow label="Updates" last>
        <Button
          variant="muted"
          size="sm"
          loading={state === "busy"}
          onPress={check}
        >
          Check
        </Button>
      </SettingRow>
    </>
  );
}
