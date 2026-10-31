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

export function UsageStatsControl() {
  const { consent } = useConsent();
  return (
    <SettingRow
      label="Share anonymous usage statistics"
      description="A short report once a day. No hosts, names or addresses"
    >
      <FakeSwitch
        checked={consent === "on"}
        onChange={(on) => void answerConsent(on)}
        accessibilityLabel="Share anonymous usage statistics"
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
        label="Next report"
        description="See exactly what would be sent"
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
              toast.error("Could not build the report");
            } finally {
              setBusy(false);
            }
          }}
        >
          Preview
        </Button>
      </SettingRow>
      <Sheet
        visible={text !== null}
        onClose={() => setText(null)}
        title="Next report"
        description="This is exactly what would be sent right now."
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
      label="Reset install id"
      description="Future reports will look like a new install"
      last
    >
      <Button
        variant="muted"
        size="sm"
        onPress={async () => {
          const ok = await confirm({
            title: "Reset the install id?",
            description: "Future reports will look like a new install.",
            confirmLabel: "Reset",
            destructive: false,
          });
          if (!ok) return;
          await resetAnalyticsId();
          toast.success("Install id reset");
        }}
      >
        Reset
      </Button>
    </SettingRow>
  );
}
