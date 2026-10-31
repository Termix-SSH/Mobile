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
  title: "File Manager",
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
      toServerTabType: () => "files",
      capabilities: ["keyboard-cover"],
      component: FilesTab,
    },
  ],
  companions: [
    {
      id: "files",
      title: "Files",
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
      label: "File Manager",
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
      label: "Files",
      description: "Browse, edit and move files",
      icon: FolderSearch,
      order: 10,
      tabType: FILES_TAB_TYPE,
      isAvailable: (host) => filesOn(host),
    },
  ],
  hostToggles: [
    {
      key: "enableFileManager",
      label: "File Manager",
      group: "feature",
      order: 20,
      defaultOn: true,
    },
  ],
  hostEditorSections: [filesHostSection],
  hostBadges: [
    {
      label: "FILES",
      order: 30,
      show: (host, ssh) => ssh && !!host.enableFileManager,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "fileManager",
      label: "File Manager",
      order: 20,
      matches: (host) => !!host.enableFileManager,
    },
  ],
  settingsLinks: [
    {
      id: "files",
      label: "Files",
      icon: Folder,
      order: 45,
      href: "/tabs/settings/FileSettings",
      section: "terminal",
      description: "File manager and transfers",
      keywords: ["sftp", "files", "transfer", "download"],
    },
  ],
};
