import { Field, Input } from "@/ui";
import type {
  HostEditorSectionDef,
  HostFormTabProps,
} from "@/core/features/types";

function DefaultPath({ value, onChange }: HostFormTabProps) {
  return (
    <Field label="Start in" hint="The folder the file manager opens first">
      <Input
        value={String(value.defaultPath ?? "")}
        onChangeText={(defaultPath) => onChange({ defaultPath })}
        placeholder="/"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Field>
  );
}

export const filesHostSection: HostEditorSectionDef = {
  id: "files",
  label: "Files",
  group: "ssh",
  order: 60,
  toggle: "enableFileManager",
  editor: {
    read: (host) => ({ defaultPath: host?.defaultPath || "/" }),
    write: (value, payload) => {
      payload.defaultPath = String(value.defaultPath ?? "").trim() || "/";
    },
    component: DefaultPath,
  },
};
