import { useState } from "react";
import { ScrollView } from "react-native";
import {
  answerConsent,
  buildReport,
  resetAnalyticsId,
  useConsent,
} from "@/core/analytics";
import {
  Button,
  FakeSwitch,
  SettingRow,
  Sheet,
  SheetBody,
  Text,
  useConfirm,
} from "@/ui";
import { toast } from "@/utils/toast";
import { t } from "@/i18n";

export function UsageStatsControl() {
  const { consent } = useConsent();
  return (
    <SettingRow
      label={t(
        "settings.controls.analyticsControls.shareAnonymousUsageStatistics",
      )}
      description={t("settings.controls.analyticsControls.aShortReportOnceA")}
    >
      <FakeSwitch
        checked={consent === "on"}
        onChange={(on) => void answerConsent(on)}
        accessibilityLabel={t(
          "settings.controls.analyticsControls.shareAnonymousUsageStatistics",
        )}
      />
    </SettingRow>
  );
}

export function UsagePreviewControl() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <SettingRow
        label={t("settings.controls.analyticsControls.nextReport")}
        description={t(
          "settings.controls.analyticsControls.seeExactlyWhatWouldBe",
        )}
      >
        <Button
          variant="muted"
          size="sm"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              setText(JSON.stringify(await buildReport(), null, 2));
            } catch {
              toast.error(
                t("settings.controls.analyticsControls.couldNotBuildTheReport"),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("settings.controls.analyticsControls.preview")}
        </Button>
      </SettingRow>
      <Sheet
        visible={text !== null}
        onClose={() => setText(null)}
        title={t("settings.controls.analyticsControls.nextReport")}
        description={t(
          "settings.controls.analyticsControls.thisIsExactlyWhatWould",
        )}
        scroll
      >
        <SheetBody>
          <ScrollView horizontal>
            <Text selectable className="text-meta text-foreground">
              {text}
            </Text>
          </ScrollView>
        </SheetBody>
      </Sheet>
    </>
  );
}

export function UsageResetIdControl() {
  const confirm = useConfirm();
  return (
    <SettingRow
      label={t("settings.controls.analyticsControls.resetInstallId")}
      description={t(
        "settings.controls.analyticsControls.futureReportsWillLookLike",
      )}
      last
    >
      <Button
        variant="muted"
        size="sm"
        onPress={async () => {
          const ok = await confirm({
            title: t("settings.controls.analyticsControls.resetTheInstallId"),
            description: t(
              "settings.controls.analyticsControls.futureReportsWillLookLike2",
            ),
            confirmLabel: t("settings.controls.analyticsControls.reset"),
            destructive: false,
          });
          if (!ok) return;
          await resetAnalyticsId();
          toast.success(
            t("settings.controls.analyticsControls.installIdReset"),
          );
        }}
      >
        {t("settings.controls.analyticsControls.reset")}
      </Button>
    </SettingRow>
  );
}
