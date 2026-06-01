import { useState, useEffect } from "react";
import {
  Modal,
  View,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Save, RotateCcw, FileText } from "lucide-react-native";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import { useOrientation } from "@/app/utils/orientation";

interface FileViewerProps {
  visible: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

const MONOSPACE_FONT = Platform.select({
  ios: "Courier New",
  android: "monospace",
  default: "monospace",
});

export function FileViewer({
  visible,
  onClose,
  fileName,
  filePath,
  initialContent,
  onSave,
  readOnly = false,
}: FileViewerProps) {
  const insets = useSafeAreaInsets();
  const { isLandscape } = useOrientation();
  const color = useThemeColor();
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
  }, [initialContent, visible]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== initialContent);
  };

  const handleSave = async () => {
    if (!hasChanges || readOnly) return;
    try {
      setIsSaving(true);
      await onSave(content);
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (!hasChanges) return;
    Alert.alert("Revert Changes", "Discard your changes?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revert",
        style: "destructive",
        onPress: () => {
          setContent(initialContent);
          setHasChanges(false);
        },
      },
    ]);
  };

  const handleClose = () => {
    if (hasChanges && !readOnly) {
      Alert.alert("Unsaved Changes", "Save before closing?", [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
        {
          text: "Save",
          onPress: async () => {
            await handleSave();
            onClose();
          },
        },
      ]);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      key={isLandscape ? "landscape" : "portrait"}
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: color("background") }}
      >
        <View className="flex-1 bg-background">
          {/* Header */}
          <View
            className="bg-card border-b border-border flex-row items-center gap-3"
            style={{
              paddingTop: isLandscape ? Math.max(insets.top, 8) : insets.top + 12,
              paddingBottom: isLandscape ? 8 : 12,
              paddingLeft: Math.max(insets.left, 16),
              paddingRight: Math.max(insets.right, 16),
            }}
          >
            <FileText size={18} color={color("muted-foreground")} />
            <View className="flex-1 min-w-0">
              <Text weight="medium" className="text-sm text-foreground" numberOfLines={1}>
                {fileName}
              </Text>
              <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                {filePath}
              </Text>
            </View>

            <View className="flex-row items-center gap-1.5">
              {!readOnly && hasChanges ? (
                <>
                  <Pressable
                    onPress={handleRevert}
                    hitSlop={6}
                    className="p-2 rounded border border-border active:bg-muted/40"
                  >
                    <RotateCcw size={16} color={color("muted-foreground")} />
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={isSaving}
                    hitSlop={6}
                    className="p-2 rounded border border-accent-brand/40 bg-accent-brand/10 active:bg-accent-brand/20"
                    style={{ opacity: isSaving ? 0.7 : 1 }}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={color("accent-brand")} />
                    ) : (
                      <Save size={16} color={color("accent-brand")} />
                    )}
                  </Pressable>
                </>
              ) : null}
              <Pressable
                onPress={handleClose}
                hitSlop={6}
                className="p-2 rounded border border-border active:bg-muted/40"
              >
                <X size={16} color={color("foreground")} />
              </Pressable>
            </View>
          </View>

          {readOnly ? (
            <View className="px-4 py-1.5 bg-muted/30 border-b border-border/50">
              <Text className="text-[11px] text-muted-foreground">Read-only</Text>
            </View>
          ) : null}

          <TextInput
            className="flex-1 text-foreground bg-background"
            value={content}
            onChangeText={handleContentChange}
            multiline
            editable={!readOnly}
            scrollEnabled
            style={{
              fontFamily: MONOSPACE_FONT,
              fontSize: 13,
              lineHeight: 20,
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 16),
              paddingLeft: Math.max(insets.left, 16),
              paddingRight: Math.max(insets.right, 16),
              textAlignVertical: "top",
              color: color("foreground"),
            }}
            placeholder={readOnly ? "File content…" : "Enter file content…"}
            placeholderTextColor={color("muted-foreground", 0.5)}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
