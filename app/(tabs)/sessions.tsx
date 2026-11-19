import Sessions from "@/screens/sessions/Sessions";
import { Screen } from "@/components/Screen";
import { ConnectEmptyState } from "@/components/ConnectEmptyState";
import { useAppContext } from "@/contexts/AppContext";
import { hasUsableData, useActiveAccount } from "@/core/accounts";
import { t } from "@/i18n";

export default function SessionsScreen() {
  const { isAuthenticated } = useAppContext();
  const account = useActiveAccount();

  if (!hasUsableData(account, isAuthenticated)) {
    return (
      <Screen title={t("app.tabs.sessions.sessions")}>
        <ConnectEmptyState
          message={t("app.tabs.sessions.connectToATermixServer")}
        />
      </Screen>
    );
  }

  return <Sessions />;
}
