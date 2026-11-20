import { View } from "react-native";
import { Field, Input, ListRow, Tabs, Text } from "@/ui";
import { useActiveAccount } from "@/core/accounts";
import { useCapability } from "@/core/features";
import { TailscaleDevicePicker } from "@/features/tailscale/TailscaleDevices";
import { tailnetAddress } from "@/features/tailscale/tailscale";
import {
  BrowserSignInFields,
  isBrowserSignIn,
  useBrowserSignInTabs,
} from "@/screens/hosts/BrowserSignIn";
import { KeyInput } from "@/screens/hosts/keys/KeyInput";
import type { AuthType, Credential } from "@/types";
import type { HostEditorForm } from "./model";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

type Patch = Partial<HostEditorForm>;

export function AuthFields({
  form,
  set,
  credentials,
  isEdit,
  onDevicePick,
}: {
  form: HostEditorForm;
  set: (patch: Patch) => void;
  credentials: Credential[];
  isEdit: boolean;
  /** A Tailscale device was picked: its address and name. */
  onDevicePick: (ip: string, name: string) => void;
}) {
  const account = useActiveAccount();
  const tailscaleAvailable = useCapability("hosts.discovery");
  const signInTabs = useBrowserSignInTabs(form.authType);
  const credentialUser = credentials.find(
    (c) => c.id === form.credentialId,
  )?.username;

  return (
    <View className="gap-3">
      <Field
        label={t("hosts.editor.authFields.username")}
        hint={
          form.authType === "credential" && credentialUser && !form.username
            ? t("hosts.editor.authFields.fromTheCredential", { credentialUser })
            : undefined
        }
      >
        <Input
          value={form.username}
          onChangeText={(username) => set({ username })}
          placeholder={
            form.authType === "credential" && credentialUser
              ? credentialUser
              : "root"
          }
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
        />
      </Field>

      <Field label={t("hosts.editor.authFields.signInWith")}>
        <Tabs<AuthType>
          value={form.authType}
          onChange={(authType) => set({ authType })}
          fill={false}
          options={[
            { id: "password", label: t("hosts.editor.authFields.password") },
            { id: "key", label: t("hosts.editor.authFields.key") },
            {
              id: "credential",
              label: t("hosts.editor.authFields.credential"),
            },
            { id: "none", label: t("hosts.editor.authFields.none") },
            ...(tailscaleAvailable || form.authType === "tailscale"
              ? [
                  {
                    id: "tailscale" as const,
                    label: t("hosts.editor.authFields.tailscale"),
                  },
                ]
              : []),
            ...signInTabs,
          ]}
        />
      </Field>

      {isBrowserSignIn(form.authType) ? (
        <BrowserSignInFields
          authType={form.authType}
          vaultProfileId={form.vaultProfileId}
          onVaultProfile={(vaultProfileId) => set({ vaultProfileId })}
        />
      ) : null}

      {form.authType === "tailscale" ? (
        <View className="gap-2">
          <Text className="text-meta text-muted-foreground">
            {t("hosts.editor.authFields.connectsWithTailscaleSshNo")}
          </Text>
          {tailscaleAvailable ? (
            <TailscaleDevicePicker
              address={form.ip}
              onSelect={(device) => {
                const ip = tailnetAddress(device);
                onDevicePick(ip, device.hostname || device.name || ip);
              }}
            />
          ) : (
            <Text className="text-meta text-muted-foreground">
              {t("hosts.editor.authFields.tailscaleIsNotOnFor", {
                value:
                  account.kind === "local"
                    ? t("common.thisDeviceLower", { deviceWord })
                    : t("hosts.editor.authFields.thisServer"),
              })}
            </Text>
          )}
        </View>
      ) : null}

      {form.authType === "password" ? (
        <Field label={t("hosts.editor.authFields.password")}>
          <Input
            value={form.password}
            onChangeText={(password) => set({ password })}
            secureTextEntry
            placeholder={
              isEdit
                ? t("hosts.editor.authFields.unchangedIfBlank")
                : t("hosts.editor.authFields.password")
            }
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />
        </Field>
      ) : null}

      {form.authType === "key" ? (
        <KeyInput
          value={form.key}
          passphrase={form.keyPassword}
          onChange={(patch) => set(patch)}
          isEdit={isEdit}
        />
      ) : null}

      {form.authType === "credential" ? (
        <Field label={t("hosts.editor.authFields.credential")}>
          {credentials.length === 0 ? (
            <Text className="py-2 text-meta text-muted-foreground">
              {t("hosts.editor.authFields.noCredentialsYetTapThe")}
            </Text>
          ) : (
            <View className="border-t border-border/40">
              {credentials.map((c, i) => (
                <ListRow
                  key={c.id}
                  index={i}
                  title={c.name}
                  meta={[c.username, c.authType === "key" ? "Key" : "Password"]
                    .filter(Boolean)
                    .join(" | ")}
                  selected={form.credentialId === c.id}
                  onPress={() => set({ credentialId: c.id })}
                  accessibilityLabel={t(
                    "hosts.editor.authFields.useCredential",
                    { name: c.name },
                  )}
                />
              ))}
            </View>
          )}
        </Field>
      ) : null}

      <Field
        label={t("hosts.editor.authFields.sudoPassword")}
        hint={t("hosts.editor.authFields.typedIntoSudoPromptsWhen")}
      >
        <Input
          value={form.sudoPassword}
          onChangeText={(sudoPassword) => set({ sudoPassword })}
          secureTextEntry
          placeholder={t("hosts.editor.authFields.notSet")}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
    </View>
  );
}
