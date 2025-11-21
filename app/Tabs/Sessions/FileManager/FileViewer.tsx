import { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { X, Save, RotateCcw } from "lucide-react-native";

interface FileViewerProps {
  visible: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

export function FileViewer({
  visible,
  onClose,
  fileName,
  filePath,
  initialContent,
  onSave,
  readOnly = false,
}: FileViewerProps) {
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
      Alert.alert("Success", "File saved successfully");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (!hasChanges) return;

    Alert.alert(
      "Revert Changes",
      "Are you sure you want to discard your changes?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revert",
          style: "destructive",
          onPress: () => {
            setContent(initialContent);
            setHasChanges(false);
          },
        },
      ]
    );
  };

  const handleClose = () => {
    if (hasChanges && !readOnly) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Do you want to save before closing?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: onClose,
          },
          {
            text: "Save",
            onPress: async () => {
              await handleSave();
              onClose();
            },
          },
        ]
      );
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-dark-bg">
        {/* Header */}
        <View className="bg-dark-bg-header border-b-2 border-dark-border px-4 py-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-white font-semibold text-base" numberOfLines={1}>
                {fileName}
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                {filePath}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              {!readOnly && hasChanges && (
                <>
                  <TouchableOpacity
                    onPress={handleRevert}
                    className="p-2 bg-dark-bg-button rounded border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <RotateCcw size={18} color="#F59E0B" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSave}
                    className="p-2 bg-blue-500 rounded border border-blue-600"
                    activeOpacity={0.7}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Save size={18} color="white" />
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                onPress={handleClose}
                className="p-2 bg-dark-bg-button rounded border border-dark-border"
                activeOpacity={0.7}
              >
                <X size={18} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {hasChanges && !readOnly && (
            <View className="mt-2 px-2 py-1 bg-yellow-900/30 border border-yellow-700 rounded">
              <Text className="text-yellow-500 text-xs">Unsaved changes</Text>
            </View>
          )}

          {readOnly && (
            <View className="mt-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded">
              <Text className="text-gray-400 text-xs">Read-only mode</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <ScrollView className="flex-1 p-4">
          <TextInput
            className="text-white font-mono text-sm bg-dark-bg-darker border border-dark-border rounded p-3"
            value={content}
            onChangeText={handleContentChange}
            multiline
            editable={!readOnly}
            scrollEnabled={false}
            style={{
              minHeight: 400,
              textAlignVertical: "top",
            }}
            placeholder={readOnly ? "File content..." : "Enter file content..."}
            placeholderTextColor="#6B7280"
          />
        </ScrollView>

        {/* Bottom buttons (mobile-friendly) */}
        {!readOnly && hasChanges && (
          <View className="bg-dark-bg-header border-t-2 border-dark-border p-4">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleRevert}
                className="flex-1 flex-row items-center justify-center px-4 py-3 bg-dark-bg-button rounded border border-dark-border"
                activeOpacity={0.7}
              >
                <RotateCcw size={18} color="#F59E0B" />
                <Text className="text-white font-medium ml-2">Revert</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                className="flex-1 flex-row items-center justify-center px-4 py-3 bg-blue-500 rounded border border-blue-600"
                activeOpacity={0.7}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Save size={18} color="white" />
                    <Text className="text-white font-medium ml-2">Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
