import { createContext, useContext } from "react";
import { View } from "react-native";
import { Label } from "./Card";
import { Text } from "./Text";

const FieldLabel = createContext<string | null>(null);

/** The label of the Field around a control, for its screen reader name. */
export function useFieldLabel(): string | null {
  return useContext(FieldLabel);
}

/** A form field: small label, the control, then an optional hint or error. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <FieldLabel.Provider value={label}>{children}</FieldLabel.Provider>
      {error ? (
        <Text
          className="text-meta text-destructive-text"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-meta text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}

/** Fields side by side; each child gets an equal share unless it sets flex. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-2.5">{children}</View>;
}

/** Digits only, for port and number inputs. */
export function digits(value: string): string {
  return value.replace(/\D/g, "");
}
