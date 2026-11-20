import { Field, Input } from "@/ui";
import type {
  HostEditorSectionDef,
  HostFormTabProps,
} from "@/core/features/types";
import { t } from "@/i18n";

const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

export function macError(value: string): string | null {
  const mac = value.trim();
  return !mac || MAC.test(mac)
    ? null
    : t("wakeOnLan.hostSection.useAMacAddressLike");
}

function MacAddress({ value, onChange }: HostFormTabProps) {
  const mac = String(value.macAddress ?? "");
  return (
    <Field
      label={t("wakeOnLan.hostSection.macAddress")}
      hint={t("wakeOnLan.hostSection.neededToWakeThisHost")}
      error={macError(mac)}
    >
      <Input
        value={mac}
        onChangeText={(macAddress) => onChange({ macAddress })}
        placeholder="00:1A:2B:3C:4D:5E"
        autoCapitalize="characters"
        autoCorrect={false}
      />
    </Field>
  );
}

export const wakeHostSection: HostEditorSectionDef = {
  id: "wake-on-lan",
  label: t("wakeOnLan.hostSection.wakeOnLan"),
  group: "host",
  order: 90,
  editor: {
    read: (host) => ({ macAddress: host?.macAddress ?? "" }),
    write: (value, payload) => {
      payload.macAddress = String(value.macAddress ?? "").trim();
    },
    validate: (value) => macError(String(value.macAddress ?? "")),
    component: MacAddress,
  },
};
