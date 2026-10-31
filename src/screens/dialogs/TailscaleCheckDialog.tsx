import { useCallback } from "react";
import { View, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Shield, Copy, ExternalLink } from "lucide-react-native";
import { Sheet, SheetBody, Button, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { showToast } from "@/utils/toast";

interface TailscaleCheckDialogProps {
  visible: boolean;
  url: string;
  message: string;
  title?: string;
  onCancel: () => void;
}

export function TailscaleCheckDialog({
  visible,
  url,
  message,
  title,
  onCancel,
}: TailscaleCheckDialogProps) {
  const color = useThemeColor();

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(url);
      showToast.success("URL copied");
    } catch {
      showToast.error("Failed to copy");
    }
  }, [url]);

  const handleOpenBrowser = useCallback(() => {
    if (url) {
      Linking.openURL(url).catch(() =>
        showToast.error("Could not open browser"),
      );
    }
  }, [url]);

  return (
    <Sheet
      scroll
      visible={visible}
      onClose={onCancel}
      icon={<Shield size={18} color={color("accent-brand")} />}
      title={title || "Tailscale SSH check"}
      description={
        message ||
        "Complete the Tailscale SSH check in your browser to continue."
      }
      footer={
        <View className="flex-1 flex-row flex-wrap gap-2">
          <Button variant="muted" onPress={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="muted"
            onPress={handleCopy}
            disabled={!url}
            icon={<Copy size={13} color={color("accent-brand")} />}
            className="flex-1"
          >
            Copy URL
          </Button>
          <Button
            variant="default"
            onPress={handleOpenBrowser}
            disabled={!url}
            icon={<ExternalLink size={13} color={color("accent-foreground")} />}
            className="flex-1"
          >
            Open Browser
          </Button>
        </View>
      }
    >
      <SheetBody>
        <Text selectable className="text-xs text-muted-foreground">
          {url}
        </Text>
      </SheetBody>
    </Sheet>
  );
}
