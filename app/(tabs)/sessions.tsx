import Sessions from "@/app/tabs/sessions/Sessions";
import { Screen } from "@/app/components/Screen";
import { ConnectEmptyState } from "@/app/components/ConnectEmptyState";
import { useAppContext } from "@/app/AppContext";

export default function SessionsScreen() {
  const { isAuthenticated } = useAppContext();

  if (!isAuthenticated) {
    return (
      <Screen title="Sessions">
        <ConnectEmptyState message="Connect to a Termix server to open terminals, tunnels and file sessions." />
      </Screen>
    );
  }

  return <Sessions />;
}
