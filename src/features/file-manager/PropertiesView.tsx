import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, InlineView, Text } from "@/ui";
import { toUserMessage } from "@/core/errors";
import type { FileBackend, FileEntry } from "./backend/types";
import { isFolderLike } from "./list/FileRow";
import { formatDateTime, formatFileSize, modeText } from "./utils/fileUtils";
import { t } from "@/i18n";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View className="flex-row gap-3 border-b border-border/40 py-2.5">
      <Text className="w-28 text-xs text-muted-foreground">{label}</Text>
      <View className="min-w-0 flex-1">
        {typeof value === "string" ? (
          <Text selectable className="text-xs text-foreground">
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

const TYPE_LABEL = {
  file: t("fileManager.propertiesView.file"),
  directory: t("fileManager.propertiesView.folder"),
  link: t("fileManager.propertiesView.link"),
};

/** Everything the host says about one file or folder. */
export function PropertiesView({
  open,
  entry,
  backend,
  onClose,
  onPermissions,
}: {
  open: boolean;
  entry: FileEntry | null;
  backend: FileBackend;
  onClose: () => void;
  onPermissions: (entry: FileEntry) => void;
}) {
  const [info, setInfo] = useState<FileEntry | null>(entry);
  const [error, setError] = useState<string | null>(null);
  const [folderSize, setFolderSize] = useState<number | null | "loading">(null);

  useEffect(() => {
    if (!open || !entry) return;
    let alive = true;
    setInfo(entry);
    setError(null);
    setFolderSize(null);
    backend
      .stat(entry.path)
      .then((fresh) => alive && setInfo({ ...entry, ...fresh }))
      .catch((e) => alive && setError(toUserMessage(e)));
    return () => {
      alive = false;
    };
  }, [open, entry, backend]);

  if (!info) return null;
  const mode = modeText(info.mode);
  const folder = isFolderLike(info);

  const countSize = async () => {
    setFolderSize("loading");
    setFolderSize(await backend.folderSize(info.path).catch(() => null));
  };

  return (
    <InlineView
      open={open}
      onClose={onClose}
      title={info.name}
      subtitle={t("fileManager.propertiesView.properties")}
    >
      <View>
        <Row label={t("fileManager.propertiesView.path")} value={info.path} />
        <Row
          label={t("fileManager.propertiesView.type")}
          value={
            info.type === "link" && info.targetType
              ? t("fileManager.propertiesView.linkToA", {
                  value: info.targetType === "directory" ? "folder" : "file",
                })
              : TYPE_LABEL[info.type]
          }
        />
        {info.type === "link" ? (
          <Row
            label={t("fileManager.propertiesView.pointsTo")}
            value={info.linkTarget ?? "Unknown"}
          />
        ) : null}
        <Row
          label={t("fileManager.propertiesView.size")}
          value={
            folder ? (
              folderSize === "loading" ? (
                "Counting..."
              ) : typeof folderSize === "number" ? (
                formatFileSize(folderSize)
              ) : backend.kind === "sftp" ? (
                <Button
                  size="sm"
                  variant="muted"
                  onPress={() => void countSize()}
                >
                  {t("fileManager.propertiesView.countFolderSize")}
                </Button>
              ) : (
                t("fileManager.propertiesView.notShownForFolders")
              )
            ) : (
              `${formatFileSize(info.size)} (${info.size.toLocaleString("en-US")} bytes)`
            )
          }
        />
        <Row
          label={t("fileManager.propertiesView.permissions")}
          value={
            mode.octal ? (
              <View className="flex-row items-center gap-3">
                <Text selectable className="text-xs text-foreground">
                  {`${mode.octal} | ${mode.symbolic}`}
                </Text>
                <Button
                  size="sm"
                  variant="muted"
                  onPress={() => onPermissions(info)}
                >
                  {t("fileManager.propertiesView.change")}
                </Button>
              </View>
            ) : (
              "Unknown"
            )
          }
        />
        <Row
          label={t("fileManager.propertiesView.owner")}
          value={
            info.owner ?? (info.uid != null ? String(info.uid) : "Unknown")
          }
        />
        <Row
          label={t("fileManager.propertiesView.group")}
          value={
            info.group ?? (info.gid != null ? String(info.gid) : "Unknown")
          }
        />
        <Row
          label={t("fileManager.propertiesView.modified")}
          value={formatDateTime(info.mtime)}
        />
        {info.atime ? (
          <Row
            label={t("fileManager.propertiesView.opened")}
            value={formatDateTime(info.atime)}
          />
        ) : null}
        {error ? (
          <Text className="pt-3 text-xs text-destructive-text">{error}</Text>
        ) : null}
      </View>
    </InlineView>
  );
}
