import { useEffect, useState } from "react";
import { View } from "react-native";
import { useFeatureContext } from "@/core/features";
import { serverAuthPlugin } from "@/core/transport/local/auth-support";
import { ChoiceRow, Text } from "@/ui";
import type { VaultProfile } from "@/core/api/modules/vault";
import { t } from "@/i18n";

/** Sign in types that run in the server's browser flow, in tab order. */
export const BROWSER_SIGN_INS = [
  {
    id: "opkssh",
    label: "OPKSSH",
    title: "OPKSSH",
  },
  {
    id: "stepca",
    label: t("hosts.browserSignIn.stepCa"),
    title: t("hosts.browserSignIn.stepCa"),
  },
  {
    id: "vault",
    label: t("hosts.browserSignIn.vault"),
    title: t("hosts.browserSignIn.vault"),
  },
] as const;

export type BrowserSignInType = (typeof BROWSER_SIGN_INS)[number]["id"];

export function isBrowserSignIn(value: string): value is BrowserSignInType {
  return BROWSER_SIGN_INS.some((s) => s.id === value);
}

/**
 * Tabs for the types the linked server can do, plus the one the host already
 * has so it never silently changes.
 */
export function useBrowserSignInTabs(current: string) {
  const { client } = useFeatureContext();
  return BROWSER_SIGN_INS.filter((s) => {
    if (s.id === current) return true;
    const plugin = serverAuthPlugin(s.id);
    return (
      !!client && !!plugin && client.supports({ plugin, pluginApiOnly: true })
    );
  }).map((s) => ({ id: s.id, label: s.label }));
}

export function BrowserSignInFields({
  authType,
  vaultProfileId,
  onVaultProfile,
}: {
  authType: BrowserSignInType;
  vaultProfileId: number | null;
  onVaultProfile: (id: number | null) => void;
}) {
  const { client } = useFeatureContext();
  const info = BROWSER_SIGN_INS.find((s) => s.id === authType)!;
  const plugin = serverAuthPlugin(authType);
  const on =
    !!client && !!plugin && client.supports({ plugin, pluginApiOnly: true });
  const [profiles, setProfiles] = useState<VaultProfile[]>([]);

  useEffect(() => {
    if (authType !== "vault" || !on || !client) return;
    let cancelled = false;
    client.api.vault
      .listProfiles()
      .then((list) => {
        if (!cancelled) setProfiles(list ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authType, on, client]);

  const note = !client
    ? t("hosts.browserSignIn.needsATermixServerLink", { title: info.title })
    : !on
      ? t("hosts.browserSignIn.isOffOnThisServer", { title: info.title })
      : t("hosts.browserSignIn.signsInWithInYour", { title: info.title });

  return (
    <View className="gap-2">
      <Text className="text-xs text-muted-foreground">{note}</Text>
      {authType === "vault" && on ? (
        <ChoiceRow<string>
          label={t("hosts.browserSignIn.vaultProfile")}
          value={vaultProfileId == null ? "" : String(vaultProfileId)}
          options={[
            { value: "", label: t("hosts.browserSignIn.none") },
            ...profiles.map((p) => ({ value: String(p.id), label: p.name })),
          ]}
          onChange={(v) => onVaultProfile(v ? Number(v) : null)}
          last
        />
      ) : null}
    </View>
  );
}
