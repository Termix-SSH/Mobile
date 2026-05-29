import Hosts from "@/app/tabs/hosts/Hosts";
import { Screen } from "@/app/components/Screen";
import { ConnectEmptyState } from "@/app/components/ConnectEmptyState";
import { useAppContext } from "@/app/AppContext";

export default function HostsScreen() {
  const { isAuthenticated } = useAppContext();

  if (!isAuthenticated) {
    return (
      <Screen title="Hosts">
        <ConnectEmptyState />
      </Screen>
    );
  }

  return <Hosts />;
}
