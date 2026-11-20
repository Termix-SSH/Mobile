import { Field, Input } from "@/ui";
import type {
  HostEditorSectionDef,
  HostFormTabProps,
} from "@/core/features/types";
import { t } from "@/i18n";

function DefaultPath({ value, onChange }: HostFormTabProps) {
  return (
    <Field
      label={t("fileManager.hostSection.startIn")}
      hint={t("fileManager.hostSection.theFolderTheFileManager")}
    >
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
  label: t("fileManager.hostSection.files"),
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
