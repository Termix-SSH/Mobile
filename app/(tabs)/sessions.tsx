import Sessions from "@/screens/sessions/Sessions";
import { Screen } from "@/components/Screen";
import { ConnectEmptyState } from "@/components/ConnectEmptyState";
import { useAppContext } from "@/contexts/AppContext";
import { hasUsableData, useActiveAccount } from "@/core/accounts";

export default function SessionsScreen() {
  const { isAuthenticated } = useAppContext();
  const account = useActiveAccount();

  if (!hasUsableData(account, isAuthenticated)) {
    return (
      <Screen title="Sessions">
        <ConnectEmptyState message="Connect to a Termix server to open terminals, tunnels and file sessions." />
      </Screen>
    );
  }

  return <Sessions />;
}
