import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import {
  updateFileSettings,
  useFileSettings,
  type FileSettings as Settings,
} from "@/features/file-manager/settings";
import { ChoiceRow, FakeSwitch, SettingRow, Section as UiSection } from "@/ui";

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
      title="Files"
      subtitle="File manager on this phone"
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Section title="Browsing">
          {toggle(
            "showHidden",
            "Show hidden files",
            "Files and folders that start with a dot",
          )}
          {toggle(
            "confirmBeforeTrash",
            "Ask before moving to the trash",
            "Deleting for good always asks",
          )}
          <ChoiceRow
            label="Transfers at once"
            description="Downloads and uploads that run together"
            value={String(s.transferConcurrency)}
            options={num([1, 2, 3, 4])}
            onChange={(v) => set({ transferConcurrency: Number(v) })}
            last
          />
        </Section>
        <Section title="Editor">
          <ChoiceRow
            label="Text size"
            value={String(s.editorFontSize)}
            options={num([10, 11, 12, 13, 14, 16, 18, 20])}
            onChange={(v) => set({ editorFontSize: Number(v) })}
          />
          {toggle("editorWrap", "Wrap long lines", undefined, true)}
        </Section>
        <Section title="Files beside the terminal">
          {toggle(
            "companionAutoOpen",
            "Open with new terminals",
            "On a tablet, show the files panel when a terminal opens",
          )}
          <ChoiceRow
            label="Side"
            description="Where the panel sits on a tablet"
            value={s.companionSide}
            options={[
              { value: "right", label: "Right" },
              { value: "left", label: "Left" },
            ]}
            onChange={(v) => set({ companionSide: v })}
          />
          {toggle(
            "companionFollowTerminal",
            "Follow the terminal",
            "Open the folder the terminal is in as you cd",
          )}
          <ChoiceRow
            label="How often to check"
            value={String(s.companionSyncInterval)}
            options={num([1, 2, 3, 5, 10, 30], " s")}
            onChange={(v) => set({ companionSyncInterval: Number(v) })}
          />
          <ChoiceRow
            label="Folder history"
            description="Folders kept per host"
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
