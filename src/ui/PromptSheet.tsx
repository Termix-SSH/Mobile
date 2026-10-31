import { useEffect, useState } from "react";
import { View } from "react-native";
import { Sheet, SheetBody } from "./Sheet";
import { Button } from "./Button";
import { Input } from "./Input";

/** Asks for one line of text, like core's pane prompt. */
export function PromptSheet({
  visible,
  title,
  description,
  placeholder,
  defaultValue = "",
  confirmLabel = "Save",
  secureTextEntry,
  loading,
  validate,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  secureTextEntry?: boolean;
  loading?: boolean;
  /** Return false to keep the button off for this value. */
  validate?: (value: string) => boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (visible) setValue(defaultValue);
  }, [visible, defaultValue]);

  const valid = validate ? validate(value) : value.trim().length > 0;
  const submit = () => {
    if (valid && !loading) onSubmit(value);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <View className="flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!valid}
            loading={loading}
            onPress={submit}
          >
            {confirmLabel}
          </Button>
        </View>
      }
    >
      <SheetBody>
        <Input
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          secureTextEntry={secureTextEntry}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </SheetBody>
    </Sheet>
  );
}
