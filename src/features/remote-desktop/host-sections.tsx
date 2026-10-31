import { View } from "react-native";
import { Field, FieldRow, Input, Text, digits } from "@/ui";
import type {
  HostEditorSectionDef,
  HostFormEditor,
  HostFormTabProps,
} from "@/core/features/types";
import type { SSHHost, SSHHostData } from "@/types";

type Protocol = "rdp" | "vnc" | "telnet";

interface ProtocolForm {
  user: string;
  password: string;
  domain: string;
  port: string;
}

const SPEC: Record<
  Protocol,
  {
    label: string;
    toggle: string;
    order: number;
    port: number;
    userLabel: string;
    userPlaceholder: string;
    domain: boolean;
  }
> = {
  rdp: {
    label: "RDP",
    toggle: "enableRdp",
    order: 10,
    port: 3389,
    userLabel: "Username",
    userPlaceholder: "Administrator",
    domain: true,
  },
  vnc: {
    label: "VNC",
    toggle: "enableVnc",
    order: 20,
    port: 5900,
    userLabel: "Username (optional)",
    userPlaceholder: "vnc",
    domain: false,
  },
  telnet: {
    label: "Telnet",
    toggle: "enableTelnet",
    order: 30,
    port: 23,
    userLabel: "Username",
    userPlaceholder: "admin",
    domain: false,
  },
};

export function readProtocol(
  protocol: Protocol,
  host: SSHHost | null,
): ProtocolForm {
  const h = (host ?? {}) as Partial<SSHHost>;
  const spec = SPEC[protocol];
  const pick = {
    rdp: [h.rdpUser ?? (host ? "" : "Administrator"), h.rdpPassword, h.rdpPort],
    vnc: [h.vncUser, h.vncPassword, h.vncPort],
    telnet: [h.telnetUser, h.telnetPassword, h.telnetPort],
  }[protocol];
  return {
    user: (pick[0] as string | undefined) ?? "",
    password: (pick[1] as string | undefined) ?? "",
    domain: protocol === "rdp" ? (h.rdpDomain ?? "") : "",
    port: String((pick[2] as number | undefined) ?? spec.port),
  };
}

export function writeProtocol(
  protocol: Protocol,
  value: ProtocolForm,
  payload: SSHHostData,
): void {
  const port = parseInt(value.port, 10) || SPEC[protocol].port;
  if (protocol === "rdp") {
    payload.rdpUser = value.user;
    payload.rdpPassword = value.password;
    payload.rdpDomain = value.domain;
    payload.rdpPort = port;
  } else if (protocol === "vnc") {
    payload.vncUser = value.user;
    payload.vncPassword = value.password;
    payload.vncPort = port;
  } else {
    payload.telnetUser = value.user;
    payload.telnetPassword = value.password;
    payload.telnetPort = port;
  }
}

function editorFor(protocol: Protocol): HostFormEditor {
  const spec = SPEC[protocol];
  function Section({ value, onChange, context }: HostFormTabProps) {
    const form = value as unknown as ProtocolForm;
    return (
      <View className="gap-3">
        <Field label={spec.userLabel}>
          <Input
            value={form.user}
            onChangeText={(user) => onChange({ user })}
            placeholder={spec.userPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
        <FieldRow>
          <Field label="Password" className="flex-[2]">
            <Input
              value={form.password}
              onChangeText={(password) => onChange({ password })}
              secureTextEntry
              placeholder={context.isEdit ? "Unchanged if blank" : "Password"}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />
          </Field>
          <Field label="Port" className="flex-1">
            <Input
              value={form.port}
              onChangeText={(v) => onChange({ port: digits(v) })}
              keyboardType="number-pad"
              placeholder={String(spec.port)}
            />
          </Field>
        </FieldRow>
        {spec.domain ? (
          <Field label="Domain">
            <Input
              value={form.domain}
              onChangeText={(domain) => onChange({ domain })}
              placeholder="WORKGROUP"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        ) : null}
        {protocol !== "telnet" ? (
          <Text className="text-meta text-muted-foreground">
            Display, sound and clipboard settings are in the Termix web app.
          </Text>
        ) : null}
      </View>
    );
  }
  return {
    read: (host) => ({ ...readProtocol(protocol, host) }),
    write: (value, payload) =>
      writeProtocol(protocol, value as unknown as ProtocolForm, payload),
    validate: (value) => {
      const port = Number((value as unknown as ProtocolForm).port || spec.port);
      return port > 0 && port <= 65535
        ? null
        : `${spec.label} port must be from 1 to 65535`;
    },
    component: Section,
  };
}

export function protocolSection(protocol: Protocol): HostEditorSectionDef {
  const spec = SPEC[protocol];
  return {
    id: protocol,
    label: spec.label,
    group: "protocol",
    order: spec.order,
    toggle: spec.toggle,
    editor: editorFor(protocol),
  };
}
