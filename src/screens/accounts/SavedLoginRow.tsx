import { useEffect, useState } from "react";
import { View } from "react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import {
  biometricName,
  clearSavedLogin,
  hasSavedLogin,
} from "@/core/accounts/saved-login";
import { FakeSwitch, SettingRow, Text } from "@/ui";

/** Shows the saved Face ID sign in for a server, with a switch to drop it. */
export function SavedLoginRow({ client }: { client: AccountClient }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!(await hasSavedLogin(client).catch(() => false))) return;
      const label = await biometricName();
      if (live) setName(label);
    })();
    return () => {
      live = false;
    };
  }, [client]);

  if (!name) return null;
  return (
    <>
      <View className="mb-2 mt-6">
        <Text weight="medium" className="text-sm text-foreground">
          Sign in
        </Text>
      </View>
      <View className="border border-border bg-card px-3">
        <SettingRow
          label={`Sign in with ${name}`}
          description="When this server signs you out, sign in again without typing your password."
          last
        >
          <FakeSwitch
            checked
            onChange={() => {
              void clearSavedLogin(client).then(() => setName(null));
            }}
            accessibilityLabel={`Sign in with ${name}`}
          />
        </SettingRow>
      </View>
    </>
  );
}
