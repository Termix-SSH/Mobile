import { useRef, useState } from "react";
import { Pressable } from "react-native";
import {
  AArrowDown,
  AArrowUp,
  Save,
  Search,
  WrapText,
} from "lucide-react-native";
import { InlineView, useConfirm } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { toUserMessage } from "@/core/errors";
import { toast } from "@/utils/toast";
import { EditorView, type EditorHandle } from "./editor/EditorView";
import { updateFileSettings, useFileSettings } from "./settings";

function HeaderButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-10 w-10 items-center justify-center active:bg-muted ${disabled ? "opacity-40" : ""}`}
    >
      {children}
    </Pressable>
  );
}

/** The code editor for one remote file, saved back over the same connection. */
export function FileViewer({
  open,
  name,
  path,
  text,
  readOnly,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  path: string;
  text: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const colors = useUiColors();
  const confirm = useConfirm();
  const settings = useFileSettings();
  const editor = useRef<EditorHandle>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (readOnly || saving || !editor.current) return;
    setSaving(true);
    try {
      const current = await editor.current.getText();
      await onSave(current);
      editor.current.markSaved();
      setDirty(false);
      toast.success(`Saved ${name}`);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save the file"));
    } finally {
      setSaving(false);
    }
  };

  const beforeClose = async () => {
    if (!dirty) return true;
    return confirm({
      title: "Discard changes?",
      description: `${name} has changes that are not saved.`,
      confirmLabel: "Discard",
      destructive: true,
    });
  };

  const size = settings.editorFontSize;
  return (
    <InlineView
      open={open}
      onClose={onClose}
      onBeforeClose={beforeClose}
      title={`${dirty ? "* " : ""}${name}`}
      subtitle={readOnly ? `${path} | read only` : path}
      bare
      scroll={false}
      actions={
        <>
          <HeaderButton
            label="Find"
            onPress={() => editor.current?.openSearch()}
          >
            <Search size={17} color={colors.text} />
          </HeaderButton>
          <HeaderButton
            label="Smaller text"
            onPress={() => updateFileSettings({ editorFontSize: size - 1 })}
          >
            <AArrowDown size={17} color={colors.text} />
          </HeaderButton>
          <HeaderButton
            label="Bigger text"
            onPress={() => updateFileSettings({ editorFontSize: size + 1 })}
          >
            <AArrowUp size={17} color={colors.text} />
          </HeaderButton>
          <HeaderButton
            label={settings.editorWrap ? "Turn off line wrap" : "Wrap lines"}
            onPress={() =>
              updateFileSettings({ editorWrap: !settings.editorWrap })
            }
          >
            <WrapText
              size={17}
              color={settings.editorWrap ? colors.brand : colors.text}
            />
          </HeaderButton>
          {!readOnly ? (
            <HeaderButton
              label="Save"
              onPress={() => void save()}
              disabled={!dirty || saving}
            >
              <Save size={17} color={dirty ? colors.brand : colors.textMuted} />
            </HeaderButton>
          ) : null}
        </>
      }
    >
      <EditorView
        ref={editor}
        text={text}
        name={name}
        path={path}
        readOnly={readOnly}
        fontSize={size}
        wrap={settings.editorWrap}
        onDirty={setDirty}
        onSave={() => void save()}
      />
    </InlineView>
  );
}
