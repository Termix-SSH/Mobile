import { useCallback } from "react";
import { View, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Shield, Copy, ExternalLink } from "lucide-react-native";
import { Sheet, SheetBody, Button, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { showToast } from "@/utils/toast";
import { t } from "@/i18n";

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
      showToast.success(t("dialogs.tailscaleCheckDialog.urlCopied"));
    } catch {
      showToast.error(t("dialogs.tailscaleCheckDialog.failedToCopy"));
    }
  }, [url]);

  const handleOpenBrowser = useCallback(() => {
    if (url) {
      Linking.openURL(url).catch(() =>
        showToast.error(t("dialogs.tailscaleCheckDialog.couldNotOpenBrowser")),
      );
    }
  }, [url]);

  return (
    <Sheet
      scroll
      visible={visible}
      onClose={onCancel}
      icon={<Shield size={18} color={color("accent-brand")} />}
      title={title || t("dialogs.tailscaleCheckDialog.tailscaleSshCheck")}
      description={
        message ||
        t("dialogs.tailscaleCheckDialog.completeTheTailscaleSshCheck")
      }
      footer={
        <View className="flex-1 flex-row flex-wrap gap-2">
          <Button variant="muted" onPress={onCancel} className="flex-1">
            {t("dialogs.tailscaleCheckDialog.cancel")}
          </Button>
          <Button
            variant="muted"
            onPress={handleCopy}
            disabled={!url}
            icon={<Copy size={13} color={color("accent-brand")} />}
            className="flex-1"
          >
            {t("dialogs.tailscaleCheckDialog.copyUrl")}
          </Button>
          <Button
            variant="default"
            onPress={handleOpenBrowser}
            disabled={!url}
            icon={<ExternalLink size={13} color={color("accent-foreground")} />}
            className="flex-1"
          >
            {t("dialogs.tailscaleCheckDialog.openBrowser")}
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
