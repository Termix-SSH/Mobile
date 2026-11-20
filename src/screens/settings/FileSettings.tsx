import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import {
  updateFileSettings,
  useFileSettings,
  type FileSettings as Settings,
} from "@/features/file-manager/settings";
import { ChoiceRow, FakeSwitch, SettingRow, Section as UiSection } from "@/ui";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <UiSection title={title}>{children}</UiSection>;
}

const num = (values: number[], unit = "") =>
  values.map((v) => ({ value: String(v), label: `${v}${unit}` }));

export default function FileSettings() {
  const router = useRouter();
  const s = useFileSettings();
  const set = (patch: Partial<Settings>) => void updateFileSettings(patch);
  const toggle = (
    key: keyof Settings,
    label: string,
    description?: string,
    last?: boolean,
  ) => (
    <SettingRow label={label} description={description} last={last}>
      <FakeSwitch
        checked={s[key] as boolean}
        onChange={(v) => set({ [key]: v } as Partial<Settings>)}
        accessibilityLabel={label}
      />
    </SettingRow>
  );

  return (
    <Screen
      title={t("settings.fileSettings.files")}
      subtitle={t("settings.fileSettings.fileManagerOnThis", { deviceWord })}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Section title={t("settings.fileSettings.browsing")}>
          {toggle(
            "showHidden",
            t("settings.fileSettings.showHiddenFiles"),
            t("settings.fileSettings.filesAndFoldersThatStart"),
          )}
          {toggle(
            "confirmBeforeTrash",
            t("settings.fileSettings.askBeforeMovingToThe"),
            t("settings.fileSettings.deletingForGoodAlwaysAsks"),
          )}
          <ChoiceRow
            label={t("settings.fileSettings.transfersAtOnce")}
            description={t("settings.fileSettings.downloadsAndUploadsThatRun")}
            value={String(s.transferConcurrency)}
            options={num([1, 2, 3, 4])}
            onChange={(v) => set({ transferConcurrency: Number(v) })}
            last
          />
        </Section>
        <Section title={t("settings.fileSettings.editor")}>
          <ChoiceRow
            label={t("settings.fileSettings.textSize")}
            value={String(s.editorFontSize)}
            options={num([10, 11, 12, 13, 14, 16, 18, 20])}
            onChange={(v) => set({ editorFontSize: Number(v) })}
          />
          {toggle(
            "editorWrap",
            t("settings.fileSettings.wrapLongLines"),
            undefined,
            true,
          )}
        </Section>
        <Section title={t("settings.fileSettings.filesBesideTheTerminal")}>
          {toggle(
            "companionAutoOpen",
            t("settings.fileSettings.openWithNewTerminals"),
            t("settings.fileSettings.onATabletShowThe"),
          )}
          <ChoiceRow
            label={t("settings.fileSettings.side")}
            description={t("settings.fileSettings.whereThePanelSitsOn")}
            value={s.companionSide}
            options={[
              { value: "right", label: t("settings.fileSettings.right") },
              { value: "left", label: t("settings.fileSettings.left") },
            ]}
            onChange={(v) => set({ companionSide: v })}
          />
          {toggle(
            "companionFollowTerminal",
            t("settings.fileSettings.followTheTerminal"),
            t("settings.fileSettings.openTheFolderTheTerminal"),
          )}
          <ChoiceRow
            label={t("settings.fileSettings.howOftenToCheck")}
            value={String(s.companionSyncInterval)}
            options={num([1, 2, 3, 5, 10, 30], " s")}
            onChange={(v) => set({ companionSyncInterval: Number(v) })}
          />
          <ChoiceRow
            label={t("settings.fileSettings.folderHistory")}
            description={t("settings.fileSettings.foldersKeptPerHost")}
            value={String(s.companionHistorySize)}
            options={num([5, 10, 20, 50, 100])}
            onChange={(v) => set({ companionHistorySize: Number(v) })}
            last
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}
