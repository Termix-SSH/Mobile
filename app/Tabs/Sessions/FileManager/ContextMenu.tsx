import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
import {
  Eye,
  Edit,
  Copy,
  Scissors,
  Trash2,
  FileText,
  Download,
  Lock,
  Archive,
  PackageOpen,
  X,
} from "lucide-react-native";

interface ContextMenuProps {
  visible: boolean;
  onClose: () => void;
  fileName: string;
  fileType: "file" | "directory" | "link";
  onView?: () => void;
  onEdit?: () => void;
  onRename: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  onPermissions?: () => void;
  onCompress?: () => void;
  onExtract?: () => void;
  isArchive?: boolean;
}

export function ContextMenu({
  visible,
  onClose,
  fileName,
  fileType,
  onView,
  onEdit,
  onRename,
  onCopy,
  onCut,
  onDelete,
  onDownload,
  onPermissions,
  onCompress,
  onExtract,
  isArchive = false,
}: ContextMenuProps) {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/50 justify-end">
          <TouchableWithoutFeedback onPress={() => {}}>
            <View className="bg-dark-bg-button rounded-t-2xl border-t-2 border-x-2 border-dark-border px-4 pt-4 pb-6">
              <View className="flex-row items-center justify-between mb-3">
                <Text
                  className="text-white font-semibold text-base"
                  numberOfLines={1}
                >
                  {fileName}
                </Text>
                <TouchableOpacity
                  className="bg-dark-bg rounded-md p-1 border-2 border-dark-border"
                  onPress={onClose}
                >
                  <X size={16} color="white" />
                </TouchableOpacity>
              </View>

              <View className="gap-2">
                {onView && fileType === "file" && (
                  <TouchableOpacity
                    onPress={() => handleAction(onView)}
                    className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <Eye size={20} color="white" />
                    <Text className="text-white font-medium">View</Text>
                  </TouchableOpacity>
                )}

                {onEdit && fileType === "file" && (
                  <TouchableOpacity
                    onPress={() => handleAction(onEdit)}
                    className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <Edit size={20} color="white" />
                    <Text className="text-white font-medium">Edit</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => handleAction(onRename)}
                  className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                  activeOpacity={0.7}
                >
                  <FileText size={20} color="white" />
                  <Text className="text-white font-medium">Rename</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAction(onCopy)}
                  className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                  activeOpacity={0.7}
                >
                  <Copy size={20} color="white" />
                  <Text className="text-white font-medium">Copy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAction(onCut)}
                  className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                  activeOpacity={0.7}
                >
                  <Scissors size={20} color="white" />
                  <Text className="text-white font-medium">Cut</Text>
                </TouchableOpacity>

                {onDownload && fileType === "file" && (
                  <TouchableOpacity
                    onPress={() => handleAction(onDownload)}
                    className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <Download size={20} color="white" />
                    <Text className="text-white font-medium">Download</Text>
                  </TouchableOpacity>
                )}

                {onPermissions && (
                  <TouchableOpacity
                    onPress={() => handleAction(onPermissions)}
                    className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <Lock size={20} color="white" />
                    <Text className="text-white font-medium">Permissions</Text>
                  </TouchableOpacity>
                )}

                {onCompress && (
                  <TouchableOpacity
                    onPress={() => handleAction(onCompress)}
                    className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <Archive size={20} color="white" />
                    <Text className="text-white font-medium">Compress</Text>
                  </TouchableOpacity>
                )}

                {onExtract && isArchive && (
                  <TouchableOpacity
                    onPress={() => handleAction(onExtract)}
                    className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                    activeOpacity={0.7}
                  >
                    <PackageOpen size={20} color="white" />
                    <Text className="text-white font-medium">Extract</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => handleAction(onDelete)}
                  className="flex-row items-center gap-3 p-3 rounded-md bg-dark-bg-darker border border-dark-border"
                  activeOpacity={0.7}
                >
                  <Trash2 size={20} color="white" />
                  <Text className="text-white font-medium">Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
