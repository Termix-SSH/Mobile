import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Hosts from "@/screens/hosts/Hosts";

export const HOSTS_PANE_WIDTH = 340;
export const HOSTS_PANE_HIDDEN_KEY = "sessions.hostsPaneHidden";

/** The host list beside the terminal on wide windows. */
export function HostsPane() {
  return (
    <View
      className="border-r border-border bg-background"
      style={{ width: HOSTS_PANE_WIDTH }}
    >
      <Hosts />
    </View>
  );
}

/** Whether the user hid the host list pane. Kept across launches. */
export function useHostsPaneHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(HOSTS_PANE_HIDDEN_KEY)
      .then((v) => {
        if (live && v === "1") setHidden(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const set = useCallback((value: boolean) => {
    setHidden(value);
    AsyncStorage.setItem(HOSTS_PANE_HIDDEN_KEY, value ? "1" : "0").catch(
      () => {},
    );
  }, []);

  return [hidden, set];
}
