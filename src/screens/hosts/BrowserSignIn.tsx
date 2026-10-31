import { useEffect, useState } from "react";
import { View } from "react-native";
import { useFeatureContext } from "@/core/features";
import { serverAuthPlugin } from "@/core/transport/local/auth-support";
import { ChoiceRow, Text } from "@/ui";
import type { VaultProfile } from "@/core/api/modules/vault";

/** Sign in types that run in the server's browser flow, in tab order. */
export const BROWSER_SIGN_INS = [
  { id: "opkssh", label: "OPKSSH", title: "OPKSSH" },
  { id: "stepca", label: "Step CA", title: "Step CA" },
  { id: "vault", label: "Vault", title: "Vault" },
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
    ? `${info.title} needs a Termix server. Link one to use this sign in.`
    : !on
      ? `${info.title} is off on this server. This host keeps its sign in setting.`
      : `Signs in with ${info.title} in your browser through your Termix server. Connect this host through the server.`;

  return (
    <View className="gap-2">
      <Text className="text-xs text-muted-foreground">{note}</Text>
      {authType === "vault" && on ? (
        <ChoiceRow<string>
          label="Vault profile"
          value={vaultProfileId == null ? "" : String(vaultProfileId)}
          options={[
            { value: "", label: "None" },
            ...profiles.map((p) => ({ value: String(p.id), label: p.name })),
          ]}
          onChange={(v) => onVaultProfile(v ? Number(v) : null)}
          last
        />
      ) : null}
    </View>
  );
}
