import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import { Search } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Screen } from "@/components/Screen";
import { Input, SettingsLinkRow, Text } from "@/ui";
import {
  searchSettings,
  useSettingsGroups,
  type SettingsItemDef,
} from "./schema";

function ItemRow({ item }: { item: SettingsItemDef }) {
  const router = useRouter();
  if (item.Control) return <item.Control />;
  return (
    <SettingsLinkRow
      label={item.label}
      description={item.description}
      icon={item.icon}
      destructive={item.destructive}
      onPress={() => router.push(item.href as never)}
      last
    />
  );
}

/** Settings, built from the schema in `./schema` and the feature registry. */
export default function Settings() {
  const color = useThemeColor();
  const params = useLocalSearchParams<{ q?: string }>();
  const groups = useSettingsGroups();
  const [query, setQuery] = useState(params.q ?? "");
  const appVersion = Constants.expoConfig?.version ?? "";

  const hits = useMemo(() => searchSettings(groups, query), [groups, query]);
  const searching = query.trim().length > 0;

  return (
    <Screen title="Settings">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 40 }}
      >
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search settings"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          leading={<Search size={15} color={color("muted-foreground")} />}
          accessibilityLabel="Search settings"
        />

        {searching ? (
          hits.length ? (
            <View className="border border-border bg-card px-3">
              {hits.map((hit, i) => (
                <View
                  key={hit.item.id}
                  className={i > 0 ? "border-t border-border/40" : ""}
                >
                  <Text className="pt-2 text-2xs uppercase text-muted-foreground">
                    {hit.sectionTitle}
                  </Text>
                  <ItemRow item={hit.item} />
                </View>
              ))}
            </View>
          ) : (
            <Text className="py-6 text-center text-xs text-muted-foreground">
              No settings match.
            </Text>
          )
        ) : (
          groups.map(({ section, items }) => {
            const Icon = section.icon;
            return (
              <View key={section.id} className="gap-2">
                <View className="flex-row items-center gap-2">
                  <Icon size={14} color={color("muted-foreground")} />
                  <Text
                    weight="bold"
                    className="text-meta uppercase text-muted-foreground"
                  >
                    {section.title}
                  </Text>
                </View>
                <View className="border border-border bg-card px-3">
                  {items.map((item, i) => (
                    <View
                      key={item.id}
                      className={i > 0 ? "border-t border-border/40" : ""}
                    >
                      <ItemRow item={item} />
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}

        <Text className="text-center text-meta text-muted-foreground">
          {appVersion ? `Termix Mobile v${appVersion}` : "Termix Mobile"}
        </Text>
      </ScrollView>
    </Screen>
  );
}
