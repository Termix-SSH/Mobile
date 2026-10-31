import Home from "@/screens/home/Home";
import { Screen } from "@/components/Screen";
import { ConnectEmptyState } from "@/components/ConnectEmptyState";
import { useAppContext } from "@/contexts/AppContext";
import { hasUsableData, useActiveAccount } from "@/core/accounts";

export default function HomeScreen() {
  const { isAuthenticated } = useAppContext();
  const account = useActiveAccount();

  if (!hasUsableData(account, isAuthenticated)) {
    return (
      <Screen title="Home">
        <ConnectEmptyState />
      </Screen>
    );
  }

  return <Home />;
}
