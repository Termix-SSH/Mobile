import { useEffect, useState } from "react";
import { View } from "react-native";
import { Lock } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { PinPad, PIN_LENGTH, Sheet, SheetBody, Text } from "@/ui";

/**
 * Asks for a PIN on the number pad. `onSubmit` returns true when the PIN was
 * accepted, false to shake and clear it. Biometrics are optional.
 */
export function PinSheet({
  visible,
  title,
  description,
  onSubmit,
  onBiometric,
  onClose,
  waitMs = 0,
}: {
  visible: boolean;
  title: string;
  description?: string;
  onSubmit: (pin: string) => Promise<boolean>;
  onBiometric?: () => void;
  onClose: () => void;
  /** Time left before a PIN can be tried again. */
  waitMs?: number;
}) {
  const color = useThemeColor();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPin("");
      setError(false);
    }
  }, [visible]);

  // A new question gets a clean pad.
  useEffect(() => {
    setPin("");
  }, [title]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    let live = true;
    onSubmit(pin).then((ok) => {
      if (!live || ok) return;
      setError(true);
      setTimeout(() => {
        setPin("");
        setError(false);
      }, 500);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      description={
        waitMs > 0 ? `Wait ${Math.ceil(waitMs / 1000)} seconds` : description
      }
      icon={<Lock size={15} color={color("accent-brand")} />}
    >
      <SheetBody>
        <View className="items-center py-4">
          <PinPad
            value={pin}
            onChange={setPin}
            error={error}
            disabled={waitMs > 0}
            onBiometric={onBiometric}
          />
          <Text className="mt-4 text-meta text-muted-foreground">
            {PIN_LENGTH} digits
          </Text>
        </View>
      </SheetBody>
    </Sheet>
  );
}
