import { useState, useEffect, useCallback } from "react";
import { View, Platform } from "react-native";
import { KeyRound } from "lucide-react-native";
import { Dialog, Input, Button, Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface PassphraseDialogProps {
  visible: boolean;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
  hostInfo: {
    name?: string;
    ip: string;
    port: number;
    username: string;
  };
}

export function PassphraseDialog({
  visible,
  onSubmit,
  onCancel,
  hostInfo,
}: PassphraseDialogProps) {
  const color = useThemeColor();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPassphrase("");
      setBusy(false);
    }
  }, [visible]);

  const handleSubmit = useCallback(() => {
    if (!passphrase.trim()) return;
    setBusy(true);
    try {
      onSubmit(passphrase);
    } finally {
      setBusy(false);
    }
  }, [passphrase, onSubmit]);

  const hostLabel = hostInfo.name
    ? `${hostInfo.name} · ${hostInfo.username}@${hostInfo.ip}:${hostInfo.port}`
    : `${hostInfo.username}@${hostInfo.ip}:${hostInfo.port}`;

  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      icon={<KeyRound size={18} color={color("accent-brand")} />}
      title="Passphrase Required"
      description="Enter the passphrase for your SSH key."
      footer={
        <View className="flex-row gap-2 flex-1">
          <Button variant="outline" className="flex-1" onPress={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            onPress={handleSubmit}
            loading={busy}
            disabled={!passphrase.trim()}
          >
            Connect
          </Button>
        </View>
      }
    >
      <Text
        className="text-xs text-muted-foreground mb-3"
        style={{ fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}
      >
        {hostLabel}
      </Text>
      <Input
        value={passphrase}
        onChangeText={setPassphrase}
        placeholder="Key passphrase"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        autoFocus
        onSubmitEditing={handleSubmit}
      />
    </Dialog>
  );
}
