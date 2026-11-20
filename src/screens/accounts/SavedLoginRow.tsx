import { useEffect, useState } from "react";
import { View } from "react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import {
  biometricName,
  clearSavedLogin,
  hasSavedLogin,
} from "@/core/accounts/saved-login";
import { FakeSwitch, SettingRow, Text } from "@/ui";
import { t } from "@/i18n";

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
          {t("accounts.savedLoginRow.signIn")}
        </Text>
      </View>
      <View className="border border-border bg-card px-3">
        <SettingRow
          label={t("accounts.savedLoginRow.signInWith", { name })}
          description={t("accounts.savedLoginRow.whenThisServerSignsYou")}
          last
        >
          <FakeSwitch
            checked
            onChange={() => {
              void clearSavedLogin(client).then(() => setName(null));
            }}
            accessibilityLabel={t("accounts.savedLoginRow.signInWith", {
              name,
            })}
          />
        </SettingRow>
      </View>
    </>
  );
}
