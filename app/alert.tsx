import { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { accounts } from "@/core/accounts";

// termix-mobile://alert?account=<id>, from a tapped alert notification.
// Switches to that server, then opens its inbox.
export default function AlertLink() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = typeof account === "string" ? account : "";
    const switchTo =
      id && accounts.find(id) && accounts.active().id !== id
        ? accounts.setActive(id)
        : Promise.resolve();
    void switchTo.catch(() => {}).finally(() => setReady(true));
  }, [account]);

  if (!ready) return null;
  return <Redirect href={"/tabs/settings/Notifications" as never} />;
}
