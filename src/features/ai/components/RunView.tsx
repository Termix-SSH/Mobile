import { ActivityIndicator, ScrollView, View } from "react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { AccordionSection } from "@/ui/Accordion";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { Markdown } from "../Markdown";
import type { RunState } from "../run";

export interface RunViewProps {
  run: RunState;
  canResend: boolean;
  onResend: () => void;
}

function toolText(value: unknown): string {
  return typeof value === "string"
    ? value
    : (JSON.stringify(value, null, 2) ?? String(value));
}

export function RunView({ run, canResend, onResend }: RunViewProps) {
  const color = useThemeColor();
  return (
    <View className="min-w-0 gap-3">
      {run.reasoning ? (
        <AccordionSection label="Thinking">
          <View className="pt-3">
            <Markdown source={run.reasoning} muted />
          </View>
        </AccordionSection>
      ) : null}
      {run.tools.map((tool) => (
        <Card key={tool.id} className="gap-2 p-3">
          <View className="flex-row items-center gap-2">
            <Text weight="medium" className="min-w-0 flex-1 text-xs">
              {tool.name}
            </Text>
            {!tool.done && !tool.interrupted ? (
              <ActivityIndicator
                size="small"
                color={color("muted-foreground")}
                accessibilityLabel={`${tool.name} running`}
              />
            ) : null}
            <Text className="text-xs text-muted-foreground">
              {tool.interrupted
                ? "interrupted"
                : tool.done
                  ? "done"
                  : "running"}
            </Text>
          </View>
          <AccordionSection label="Arguments and result">
            <View className="gap-2 pt-3">
              <Text weight="medium" className="text-xs text-muted-foreground">
                Arguments
              </Text>
              <ScrollView horizontal className="max-w-full">
                <Text selectable className="text-xs text-muted-foreground">
                  {toolText(tool.arguments)}
                </Text>
              </ScrollView>
              {"result" in tool ? (
                <>
                  <Text
                    weight="medium"
                    className="text-xs text-muted-foreground"
                  >
                    Result
                  </Text>
                  <ScrollView horizontal className="max-w-full">
                    <Text selectable className="text-xs text-muted-foreground">
                      {toolText(tool.result)}
                    </Text>
                  </ScrollView>
                </>
              ) : null}
            </View>
          </AccordionSection>
        </Card>
      ))}
      {run.text ? <Markdown source={run.text} /> : null}
      <View accessibilityLiveRegion="polite" className="gap-2">
        {!run.finished ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color={color("accent-brand")} />
            <Text className="text-xs text-muted-foreground">Streaming</Text>
          </View>
        ) : null}
        {run.error ? (
          <Text
            selectable
            accessibilityRole="alert"
            className="text-xs text-destructive"
          >
            {run.error}
          </Text>
        ) : null}
        {run.finishReason === "cancelled" ? (
          <Text className="text-xs text-muted-foreground">Stopped</Text>
        ) : null}
        {run.finishReason === "background" ? (
          <Text className="text-xs text-muted-foreground">
            Interrupted when the app went to the background
          </Text>
        ) : null}
        {canResend ? (
          <Button variant="muted" className="self-start" onPress={onResend}>
            Send again
          </Button>
        ) : null}
      </View>
    </View>
  );
}
