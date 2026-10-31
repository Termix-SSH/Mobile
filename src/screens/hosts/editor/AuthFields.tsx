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
        label="Username"
        hint={
          form.authType === "credential" && credentialUser && !form.username
            ? `From the credential: ${credentialUser}`
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

      <Field label="Sign in with">
        <Tabs<AuthType>
          value={form.authType}
          onChange={(authType) => set({ authType })}
          fill={false}
          options={[
            { id: "password", label: "Password" },
            { id: "key", label: "Key" },
            { id: "credential", label: "Credential" },
            { id: "none", label: "None" },
            ...(tailscaleAvailable || form.authType === "tailscale"
              ? [{ id: "tailscale" as const, label: "Tailscale" }]
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
            Connects with Tailscale SSH. No password or key is kept.
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
              Tailscale is not on for{" "}
              {account.kind === "local" ? "this phone" : "this server"}. This
              host keeps its Tailscale sign in.
            </Text>
          )}
        </View>
      ) : null}

      {form.authType === "password" ? (
        <Field label="Password">
          <Input
            value={form.password}
            onChangeText={(password) => set({ password })}
            secureTextEntry
            placeholder={isEdit ? "Unchanged if blank" : "Password"}
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
        <Field label="Credential">
          {credentials.length === 0 ? (
            <Text className="py-2 text-meta text-muted-foreground">
              No credentials yet. Tap the key icon in Hosts to add one.
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
                  accessibilityLabel={`Use credential ${c.name}`}
                />
              ))}
            </View>
          )}
        </Field>
      ) : null}

      <Field
        label="Sudo password"
        hint="Typed into sudo prompts when the Terminal section turns that on"
      >
        <Input
          value={form.sudoPassword}
          onChangeText={(sudoPassword) => set({ sudoPassword })}
          secureTextEntry
          placeholder="Not set"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
    </View>
  );
}
