import { stopAnalytics } from "./client";
import { resetInstallId, setConsent } from "./consent";
import { maybeSendReport } from "./report";
import { clearUsage } from "./usage";

export { useConsent, loadConsent } from "./consent";
export { buildReport } from "./report";
export { trackTabOpened } from "./track";
export { recordConnect, noteSessions } from "./usage";

/** The answer to the first-run question, or the Settings switch. */
export async function answerConsent(on: boolean): Promise<void> {
  if (on) {
    await setConsent("on");
    void maybeSendReport().catch(() => {});
    return;
  }
  await setConsent("off");
  await stopAnalytics();
  await clearUsage();
}

/** A new random id. The running client is dropped so it can't keep the old one. */
export async function resetAnalyticsId(): Promise<void> {
  await stopAnalytics();
  await resetInstallId();
}
