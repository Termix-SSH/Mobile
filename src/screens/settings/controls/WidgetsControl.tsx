import { useEffect, useState } from "react";
import { View } from "react-native";
import { useCapability } from "@/core/features";
import { FakeSwitch, SettingRow } from "@/ui";
import {
  DEFAULT_WIDGET_PREFERENCES,
  loadWidgetPreferences,
  publishSignedOutSnapshot,
  republishWithPreferences,
  saveWidgetPreferences,
  type WidgetPreferences,
} from "@/widgets";

/** Home screen widget switches. No-ops on builds without widget support. */
export function WidgetsControl() {
  const hasSnippetWidget = useCapability("widgets.snippets");
  const [prefs, setPrefs] = useState<WidgetPreferences>(
    DEFAULT_WIDGET_PREFERENCES,
  );

  useEffect(() => {
    loadWidgetPreferences()
      .then(setPrefs)
      .catch(() => {});
  }, []);

  const update = async (patch: Partial<WidgetPreferences>) => {
    const next = await saveWidgetPreferences(patch);
    setPrefs(next);
    // Show the change on the home screen right away.
    if (next.enabled) await republishWithPreferences();
    else await publishSignedOutSnapshot();
  };

  return (
    <View>
      <SettingRow
        label="Home screen widgets"
        description="Show your hosts and snippets on the home screen"
        last={!prefs.enabled}
      >
        <FakeSwitch
          checked={prefs.enabled}
          onChange={(value) => update({ enabled: value })}
        />
      </SettingRow>
      {prefs.enabled ? (
        <>
          <SettingRow
            label="Show addresses"
            description="Show user@host under each server name"
          >
            <FakeSwitch
              checked={prefs.showAddresses}
              onChange={(value) => update({ showAddresses: value })}
            />
          </SettingRow>
          <SettingRow
            label="Include offline hosts"
            description="Off shows only servers that are online"
          >
            <FakeSwitch
              checked={prefs.includeOffline}
              onChange={(value) => update({ includeOffline: value })}
            />
          </SettingRow>
          <SettingRow
            label="Pinned hosts only"
            description="Show only the hosts you pinned"
            last={!hasSnippetWidget}
          >
            <FakeSwitch
              checked={prefs.pinnedOnly}
              onChange={(value) => update({ pinnedOnly: value })}
            />
          </SettingRow>
          {hasSnippetWidget ? (
            <SettingRow
              label="Snippets widget"
              description="Show saved commands on the home screen"
              last={!prefs.includeSnippets}
            >
              <FakeSwitch
                checked={prefs.includeSnippets}
                onChange={(value) => update({ includeSnippets: value })}
              />
            </SettingRow>
          ) : null}
          {prefs.includeSnippets && hasSnippetWidget ? (
            <SettingRow
              label="Show command preview"
              description="Show the first line of each command"
              last
            >
              <FakeSwitch
                checked={prefs.showSnippetPreview}
                onChange={(value) => update({ showSnippetPreview: value })}
              />
            </SettingRow>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
