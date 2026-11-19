import { useState } from "react";
import { Platform, View } from "react-native";
import Constants from "expo-constants";
import { useAccounts } from "@/core/accounts";
import { clearRecent } from "@/core/hosts/recent";
import { getLatestGitHubRelease, isNewerVersion } from "@/core/updates";
import { Button, SettingRow, Text } from "@/ui";
import { toast } from "@/utils/toast";
import { BackgroundSessionsSection } from "../BackgroundSessionsSection";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

export function BackgroundSessionsControl() {
  return <BackgroundSessionsSection />;
}

export function PrivacyNoteControl() {
  return (
    <View className="py-3">
      <Text className="text-meta text-muted-foreground">
        {t("settings.controls.miscControls.hostsCredentialsAndSnippetsAre", {
          deviceWord,
        })}
      </Text>
    </View>
  );
}

export function ClearRecentControl() {
  const { accounts: list } = useAccounts();
  const [busy, setBusy] = useState(false);
  return (
    <SettingRow
      label={t("settings.controls.miscControls.recentHosts")}
      description={t("settings.controls.miscControls.forgetTheHostsYouOpened")}
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
            toast.success(
              t("settings.controls.miscControls.recentHostsCleared"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("settings.controls.miscControls.clear")}
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
      if (!latest)
        toast.error(
          t("settings.controls.miscControls.couldNotCheckForUpdates"),
        );
      else if (isNewerVersion(latest.version, version)) {
        toast.info(
          t("settings.controls.miscControls.versionIsOutUpdateFrom", {
            version: latest.version,
          }),
        );
      } else
        toast.success(
          t("settings.controls.miscControls.youHaveTheNewestVersion"),
        );
    } finally {
      setState("idle");
    }
  };
  return (
    <>
      <SettingRow
        label={t("settings.controls.miscControls.termixMobile")}
        description={`${Platform.OS}`}
      >
        <Text className="text-row text-muted-foreground">
          {version ? `v${version}` : "-"}
        </Text>
      </SettingRow>
      <SettingRow label={t("settings.controls.miscControls.updates")} last>
        <Button
          variant="muted"
          size="sm"
          loading={state === "busy"}
          onPress={check}
        >
          {t("settings.controls.miscControls.check")}
        </Button>
      </SettingRow>
    </>
  );
}
