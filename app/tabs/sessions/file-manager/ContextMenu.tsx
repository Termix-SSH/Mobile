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
        <View className="flex-1 justify-end bg-black/50">
          <TouchableWithoutFeedback onPress={() => {}}>
            <View className="rounded-t-2xl border-x-2 border-t-2 border-border bg-muted px-4 pb-6 pt-4">
              <View className="mb-3 flex-row items-center justify-between">
                <Text
                  className="text-base font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {fileName}
                </Text>
                <TouchableOpacity
                  className="rounded-md border-2 border-border bg-background p-1"
                  onPress={onClose}
                >
                  <X size={16} color="white" />
                </TouchableOpacity>
              </View>

              <View className="gap-2">
                {onView && fileType === "file" && (
                  <TouchableOpacity
                    onPress={() => handleAction(onView)}
                    className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                    activeOpacity={0.7}
                  >
                    <Eye size={20} color="white" />
                    <Text className="font-medium text-foreground">View</Text>
                  </TouchableOpacity>
                )}

                {onEdit && fileType === "file" && (
                  <TouchableOpacity
                    onPress={() => handleAction(onEdit)}
                    className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                    activeOpacity={0.7}
                  >
                    <Edit size={20} color="white" />
                    <Text className="font-medium text-foreground">Edit</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => handleAction(onRename)}
                  className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                  activeOpacity={0.7}
                >
                  <FileText size={20} color="white" />
                  <Text className="font-medium text-foreground">Rename</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAction(onCopy)}
                  className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                  activeOpacity={0.7}
                >
                  <Copy size={20} color="white" />
                  <Text className="font-medium text-foreground">Copy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAction(onCut)}
                  className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                  activeOpacity={0.7}
                >
                  <Scissors size={20} color="white" />
                  <Text className="font-medium text-foreground">Cut</Text>
                </TouchableOpacity>

                {onDownload && fileType === "file" && (
                  <TouchableOpacity
                    onPress={() => handleAction(onDownload)}
                    className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                    activeOpacity={0.7}
                  >
                    <Download size={20} color="white" />
                    <Text className="font-medium text-foreground">
                      Download
                    </Text>
                  </TouchableOpacity>
                )}

                {onPermissions && (
                  <TouchableOpacity
                    onPress={() => handleAction(onPermissions)}
                    className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                    activeOpacity={0.7}
                  >
                    <Lock size={20} color="white" />
                    <Text className="font-medium text-foreground">
                      Permissions
                    </Text>
                  </TouchableOpacity>
                )}

                {onCompress && (
                  <TouchableOpacity
                    onPress={() => handleAction(onCompress)}
                    className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                    activeOpacity={0.7}
                  >
                    <Archive size={20} color="white" />
                    <Text className="font-medium text-foreground">
                      Compress
                    </Text>
                  </TouchableOpacity>
                )}

                {onExtract && isArchive && (
                  <TouchableOpacity
                    onPress={() => handleAction(onExtract)}
                    className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                    activeOpacity={0.7}
                  >
                    <PackageOpen size={20} color="white" />
                    <Text className="font-medium text-foreground">Extract</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => handleAction(onDelete)}
                  className="flex-row items-center gap-3 rounded-md border border-border bg-card p-3"
                  activeOpacity={0.7}
                >
                  <Trash2 size={20} color="white" />
                  <Text className="font-medium text-foreground">Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
