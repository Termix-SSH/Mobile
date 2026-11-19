import { useState, useEffect, useCallback } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ShieldCheck, Clipboard as ClipboardIcon } from "lucide-react-native";
import { Sheet, SheetBody, Input, Button } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { t as tr } from "@/i18n";

interface TOTPDialogProps {
  visible: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  prompt?: string;
  isPasswordPrompt?: boolean;
}

export function TOTPDialog({
  visible,
  onSubmit,
  onCancel,
  prompt,
  isPasswordPrompt = false,
}: TOTPDialogProps) {
  const color = useThemeColor();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCode("");
      setBusy(false);
    }
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      onSubmit(code.trim());
    } finally {
      setBusy(false);
    }
  }, [code, onSubmit]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setCode(isPasswordPrompt ? text : text.replace(/\D/g, "").slice(0, 6));
      }
    } catch {}
  }, [isPasswordPrompt]);

  const title =
    prompt ||
    (isPasswordPrompt
      ? tr("dialogs.tOTPDialog.passwordRequired")
      : tr("dialogs.tOTPDialog.twoFactorAuthentication"));
  const description = isPasswordPrompt
    ? tr("dialogs.tOTPDialog.enterYourPasswordToContinue")
    : tr("dialogs.tOTPDialog.enterThe6DigitCode");

  return (
    <Sheet
      scroll
      visible={visible}
      onClose={onCancel}
      icon={<ShieldCheck size={18} color={color("accent-brand")} />}
      title={title}
      description={description}
      footer={
        <View className="flex-1 flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={onCancel}>
            {tr("dialogs.tOTPDialog.cancel")}
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onPress={handleSubmit}
            loading={busy}
            disabled={
              !code.trim() || (!isPasswordPrompt && code.trim().length < 6)
            }
          >
            {isPasswordPrompt
              ? tr("dialogs.tOTPDialog.submit")
              : tr("dialogs.tOTPDialog.verify")}
          </Button>
        </View>
      }
    >
      <SheetBody>
        <Input
          value={code}
          onChangeText={(t) =>
            setCode(isPasswordPrompt ? t : t.replace(/[^0-9]/g, "").slice(0, 6))
          }
          placeholder={
            isPasswordPrompt ? tr("dialogs.tOTPDialog.password") : "000000"
          }
          keyboardType={isPasswordPrompt ? "default" : "number-pad"}
          secureTextEntry={isPasswordPrompt}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={isPasswordPrompt ? undefined : 6}
          onSubmitEditing={handleSubmit}
          trailing={
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel={tr("dialogs.tOTPDialog.pasteCode")}
              onPress={handlePaste}
              className="h-8 w-8"
            >
              <ClipboardIcon size={16} color={color("accent-brand")} />
            </Button>
          }
        />
      </SheetBody>
    </Sheet>
  );
}
