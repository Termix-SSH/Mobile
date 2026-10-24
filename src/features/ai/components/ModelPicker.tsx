import { useState } from "react";
import { View } from "react-native";
import { Button, Input, Label, Sheet, SheetBody, SheetRow, Text } from "@/ui";
import type { AiProvider } from "../types";

interface ModelPickerProps {
  providers: AiProvider[];
  selectedProviderId: number | null;
  selectedModel: string | null;
  onProviderChange: (id: number) => void;
  onModelChange: (model: string | null) => void;
  disabled?: boolean;
}

export function ModelPicker({
  providers,
  selectedProviderId,
  selectedModel,
  onProviderChange,
  onModelChange,
  disabled,
}: ModelPickerProps) {
  const [visible, setVisible] = useState(false);
  const enabled = providers.filter((provider) => provider.enabled);
  const provider = enabled.find((item) => item.id === selectedProviderId);
  const configuredModels = Object.keys(provider?.modelOverrides ?? {});
  const models = configuredModels.length
    ? [
        ...new Set([
          ...configuredModels,
          ...(provider?.defaultModel ? [provider.defaultModel] : []),
          ...(selectedModel ? [selectedModel] : []),
        ]),
      ]
    : [];

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start"
        accessibilityLabel="Choose provider and model"
        disabled={disabled}
        onPress={() => setVisible(true)}
      >
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {provider?.label || "Select provider"} ·{" "}
          {selectedModel || "Select model"}
        </Text>
      </Button>
      <Sheet
        scroll
        visible={visible}
        onClose={() => setVisible(false)}
        title="Provider and model"
        footer={<Button onPress={() => setVisible(false)}>Done</Button>}
      >
        <SheetBody>
          <Label>Provider</Label>
          {enabled.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No enabled AI providers. Configure a provider in the web admin
              settings.
            </Text>
          ) : null}
          {enabled.map((item) => (
            <SheetRow
              key={item.id}
              label={item.label || item.providerType}
              selected={item.id === selectedProviderId}
              onPress={() => onProviderChange(item.id)}
            />
          ))}
          {provider ? (
            <View className="gap-3">
              <Label>Model</Label>
              {models.length ? (
                models.map((model) => (
                  <SheetRow
                    key={model}
                    label={model}
                    selected={model === selectedModel}
                    onPress={() => onModelChange(model)}
                  />
                ))
              ) : (
                <Input
                  accessibilityLabel="Model name"
                  placeholder={provider.defaultModel || "Model name"}
                  value={selectedModel ?? ""}
                  onChangeText={(value) => onModelChange(value || null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            </View>
          ) : null}
        </SheetBody>
      </Sheet>
    </>
  );
}
