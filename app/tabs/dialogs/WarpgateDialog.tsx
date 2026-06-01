import { useState, useEffect, useCallback } from "react";
import { View, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Shield, Copy, Check, ExternalLink } from "lucide-react-native";
import { Dialog, Button, Text, Input } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { showToast } from "@/app/utils/toast";

interface WarpgateDialogProps {
  visible: boolean;
  url: string;
  securityKey: string;
  onContinue: () => void;
  onCancel: () => void;
}

export function WarpgateDialog({
  visible,
  url,
  securityKey,
  onContinue,
  onCancel,
}: WarpgateDialogProps) {
  const color = useThemeColor();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      showToast("URL copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy", "error");
    }
  }, [url]);

  const handleOpenBrowser = useCallback(() => {
    if (url) Linking.openURL(url).catch(() => showToast("Could not open browser", "error"));
  }, [url]);

  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      icon={<Shield size={18} color={color("accent-brand")} />}
      title="Warpgate Authentication"
      description="Authenticate via the Warpgate portal, then tap Continue."
      footer={
        <View className="flex-row flex-wrap gap-2 flex-1">
          <Button variant="outline" onPress={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="outline"
            onPress={handleOpenBrowser}
            icon={<ExternalLink size={13} color={color("accent-brand")} />}
            className="flex-1 border-accent-brand/40"
            textClassName="text-accent-brand"
          >
            Open Browser
          </Button>
          <Button variant="accent" onPress={onContinue} className="flex-1">
            Continue
          </Button>
        </View>
      }
    >
      {/* Security key — displayed prominently */}
      <View className="mb-4">
        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
          Security Key
        </Text>
        <View className="bg-accent-brand/5 border border-accent-brand/30 px-4 py-3 items-center">
          <Text
            className="text-2xl text-accent-brand"
            weight="bold"
            style={{ letterSpacing: 4, fontFamily: "monospace" }}
          >
            {securityKey}
          </Text>
        </View>
      </View>

      {/* Auth URL */}
      <View>
        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
          Auth URL
        </Text>
        <Input
          value={url}
          editable={false}
          autoCapitalize="none"
          trailing={
            <Button
              variant={copied ? "accent" : "ghost"}
              size="icon"
              onPress={handleCopy}
              className="h-8 w-8"
            >
              {copied ? (
                <Check size={14} color={color("accent-brand")} />
              ) : (
                <Copy size={14} color={color("muted-foreground")} />
              )}
            </Button>
          }
          style={{ fontSize: 11 }}
        />
      </View>
    </Dialog>
  );
}
