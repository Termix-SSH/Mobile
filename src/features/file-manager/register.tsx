import { forwardRef, useCallback } from "react";
import { Folder, FolderSearch } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { useSessionAccountId } from "@/core/accounts/session";
import { sessionHandles } from "@/core/sessions/handles";
import { isSshHost } from "@/utils/hosts";
import { CompanionFiles, FILES_TAB_TYPE } from "./CompanionFiles";
import { FileManager, type FileManagerHandle } from "./FileManager";
import { getFileSettings, updateFileSettings } from "./settings";
import { filesHostSection } from "./host-section";
import { t } from "@/i18n";

const FilesTab = forwardRef<FileManagerHandle, SessionTabProps>(
  ({ session, isVisible, onClose }, ref) => {
    const accountId = useSessionAccountId() ?? "local";
    const linked = session.linkedSessionId;
    const getHandle = useCallback(() => sessionHandles.get(linked), [linked]);
    if (linked) {
      return (
        <CompanionFiles
          session={{ ...session, accountId }}
          getHandle={getHandle}
          isVisible={isVisible}
          layout="tab"
          close={onClose}
        />
      );
    }
    return (
      <FileManager
        ref={ref}
        host={session.host}
        type={session.type}
        isVisible={isVisible}
        origin={session.origin}
        onClose={onClose}
      />
    );
  },
);
FilesTab.displayName = "FilesTab";

const filesOn = (host: Parameters<typeof isSshHost>[0]) =>
  isSshHost(host) && !!host.enableFileManager;

export const fileManagerFeature: FeatureDef = {
  id: "file-manager",
  plugins: ["file-manager"],
  title: t("fileManager.register.fileManager"),
  source: "native",
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: FILES_TAB_TYPE,
      icon: Folder,
      titleSuffix: () => "Files",
      shortLabel: () => "Files",
      // The phone's own SFTP, or the server's File Manager plugin.
      needsOneOf: [["sftp"], ["server"]],
      relayRequires: { plugin: "file-manager" },
      serverTabTypes: ["files", "sftp"],
      activityType: () => "file_manager",
      toServerTabType: () => "files",
      capabilities: ["keyboard-cover"],
      component: FilesTab,
    },
  ],
  companions: [
    {
      id: "files",
      title: t("fileManager.register.files"),
      icon: FolderSearch,
      order: 10,
      forTabTypes: ["terminal"],
      isAvailable: (host) => filesOn(host) && host.showFilesPanel !== false,
      component: CompanionFiles,
      phoneTabType: FILES_TAB_TYPE,
      layout: () => {
        const s = getFileSettings();
        return {
          side: s.companionSide,
          size: s.companionSize,
          autoOpen: s.companionAutoOpen,
        };
      },
      onResize: (size) => void updateFileSettings({ companionSize: size }),
    },
  ],
  hostActions: [
    {
      id: "file-manager.open",
      label: t("fileManager.register.fileManager"),
      icon: FolderSearch,
      group: "connect",
      order: 20,
      isAvailable: (host) => filesOn(host),
      run: (_host, ctx) => ctx.openSession(FILES_TAB_TYPE),
    },
  ],
  tools: [
    {
      id: "files",
      label: t("fileManager.register.files"),
      description: t("fileManager.register.browseEditAndMoveFiles"),
      icon: FolderSearch,
      order: 10,
      tabType: FILES_TAB_TYPE,
      isAvailable: (host) => filesOn(host),
    },
  ],
  hostToggles: [
    {
      key: "enableFileManager",
      label: t("fileManager.register.fileManager"),
      group: "feature",
      order: 20,
      defaultOn: true,
    },
  ],
  hostEditorSections: [filesHostSection],
  hostBadges: [
    {
      label: t("fileManager.register.files2"),
      order: 30,
      show: (host, ssh) => ssh && !!host.enableFileManager,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "fileManager",
      label: t("fileManager.register.fileManager"),
      order: 20,
      matches: (host) => !!host.enableFileManager,
    },
  ],
  settingsLinks: [
    {
      id: "files",
      label: t("fileManager.register.files"),
      icon: Folder,
      order: 45,
      href: "/tabs/settings/FileSettings",
      section: "terminal",
      description: t("fileManager.register.fileManagerAndTransfers"),
      keywords: ["sftp", "files", "transfer", "download"],
    },
  ],
};
