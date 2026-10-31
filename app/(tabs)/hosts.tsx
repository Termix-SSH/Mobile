import Hosts from "@/screens/hosts/Hosts";
import { Screen } from "@/components/Screen";
import { ConnectEmptyState } from "@/components/ConnectEmptyState";
import { useAppContext } from "@/contexts/AppContext";
import { hasUsableData, useActiveAccount } from "@/core/accounts";

export default function HostsScreen() {
  const { isAuthenticated } = useAppContext();
  const account = useActiveAccount();

  if (!hasUsableData(account, isAuthenticated)) {
    return (
      <Screen title="Hosts">
        <ConnectEmptyState />
      </Screen>
    );
  }

  return <Hosts />;
}
