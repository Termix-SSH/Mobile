import { useEffect } from "react";
import { AppState, Linking } from "react-native";
import { answerConsent, useConsent } from "@/core/analytics";
import { maybeSendReport } from "@/core/analytics/report";
import { loadConsent } from "@/core/analytics/consent";
import { installCrashReporting } from "@/core/analytics/crash";
import { Button, Sheet, SheetBody, Text } from "@/ui";

export const USAGE_DOCS_URL = "https://docs.termix.site/privacy#mobile-app";

/**
 * Loads the saved answer, sends the daily report and asks the first-run
 * question. Nothing is counted or sent until the answer is yes.
 */
export function AnalyticsHost({ hold }: { hold: boolean }) {
  const { consent, loaded } = useConsent();

  useEffect(() => {
    void loadConsent().catch(() => {});
    installCrashReporting();
  }, []);

  useEffect(() => {
    if (consent !== "on") return;
    void maybeSendReport().catch(() => {});
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void maybeSendReport().catch(() => {});
    });
    return () => sub.remove();
  }, [consent]);

  return (
    <Sheet
      visible={loaded && consent === "unanswered" && !hold}
      onClose={() => {}}
      dismissable={false}
      inline
      title="Share anonymous usage statistics?"
      description="Termix would send a short report once a day. You can change this any time in Settings."
      footer={
        <>
          <Button variant="muted" onPress={() => void answerConsent(false)}>
            No thanks
          </Button>
          <Button onPress={() => void answerConsent(true)}>Share</Button>
        </>
      }
    >
      <SheetBody>
        <Text className="text-meta leading-4 text-muted-foreground">
          The report has the app version, phone type, rough counts of hosts and
          sessions, which features you use, and whether connecting worked. It
          never has hostnames, usernames, addresses, paths, commands or server
          names.
        </Text>
        <Text
          className="mt-2 text-meta text-accent-text"
          onPress={() => void Linking.openURL(USAGE_DOCS_URL)}
        >
          See exactly what is sent
        </Text>
      </SheetBody>
    </Sheet>
  );
}
