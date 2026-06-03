import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Dialog, Button, Text } from "@/app/components/ui";

type Bit = "r" | "w" | "x";
const CLASSES = ["owner", "group", "other"] as const;
const BITS: Bit[] = ["r", "w", "x"];
const BIT_VALUE: Record<Bit, number> = { r: 4, w: 2, x: 1 };

/** Parse a permissions string (octal "755" or symbolic "rwxr-xr-x") to 3 digits. */
function parsePermissions(perms?: string): [number, number, number] {
  if (!perms) return [7, 5, 5];
  const octal = perms.match(/([0-7])([0-7])([0-7])\s*$/);
  if (octal) {
    return [Number(octal[1]), Number(octal[2]), Number(octal[3])];
  }
  // Symbolic: take the last 9 chars (rwxrwxrwx), ignoring the type char.
  const sym = perms.replace(/[^rwx-]/g, "");
  const tail = sym.slice(-9);
  if (tail.length === 9) {
    const calc = (g: string) =>
      (g[0] === "r" ? 4 : 0) + (g[1] === "w" ? 2 : 0) + (g[2] === "x" ? 1 : 0);
    return [calc(tail.slice(0, 3)), calc(tail.slice(3, 6)), calc(tail.slice(6, 9))];
  }
  return [7, 5, 5];
}

/**
 * chmod editor. Shows owner/group/other read/write/execute toggles plus the
 * resulting octal, and calls onApply with the 3-digit octal string.
 */
export function PermissionsDialog({
  visible,
  fileName,
  permissions,
  onClose,
  onApply,
}: {
  visible: boolean;
  fileName: string;
  permissions?: string;
  onClose: () => void;
  onApply: (octal: string) => void;
}) {
  const [digits, setDigits] = useState<[number, number, number]>([7, 5, 5]);

  useEffect(() => {
    if (visible) setDigits(parsePermissions(permissions));
  }, [visible, permissions]);

  const has = (idx: number, bit: Bit) => (digits[idx] & BIT_VALUE[bit]) !== 0;
  const toggle = (idx: number, bit: Bit) => {
    setDigits((prev) => {
      const next: [number, number, number] = [...prev] as any;
      next[idx] = next[idx] ^ BIT_VALUE[bit];
      return next;
    });
  };

  const octal = digits.join("");

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Permissions"
      description={fileName}
      footer={
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            onPress={() => onApply(octal)}
          >{`Apply (${octal})`}</Button>
        </View>
      }
    >
      <View className="gap-2.5">
        {CLASSES.map((cls, idx) => (
          <View key={cls} className="flex-row items-center gap-2">
            <Text className="text-xs text-muted-foreground w-14 capitalize">
              {cls}
            </Text>
            <View className="flex-row gap-1.5 flex-1">
              {BITS.map((bit) => {
                const active = has(idx, bit);
                return (
                  <Pressable
                    key={bit}
                    onPress={() => toggle(idx, bit)}
                    className={`flex-1 py-2 items-center border ${
                      active
                        ? "bg-accent-brand/10 border-accent-brand/40"
                        : "border-border active:bg-muted/40"
                    }`}
                  >
                    <Text
                      weight="bold"
                      className={`text-xs uppercase ${active ? "text-accent-brand" : "text-muted-foreground"}`}
                    >
                      {bit}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Dialog>
  );
}
