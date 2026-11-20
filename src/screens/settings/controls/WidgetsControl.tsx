import { useEffect, useState } from "react";
import { View } from "react-native";
import { useCapability } from "@/core/features";
import { FakeSwitch, SettingRow } from "@/ui";
import {
  DEFAULT_WIDGET_PREFERENCES,
  loadWidgetPreferences,
  publishPowerWidget,
  publishSignedOutSnapshot,
  republishWithPreferences,
  saveWidgetPreferences,
  type WidgetPreferences,
} from "@/widgets";
import { t } from "@/i18n";

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
    if (next.enabled) {
      await republishWithPreferences();
      await publishPowerWidget();
    } else await publishSignedOutSnapshot();
  };

  return (
    <View>
      <SettingRow
        label={t("settings.controls.widgetsControl.homeScreenWidgets")}
        description={t(
          "settings.controls.widgetsControl.showYourHostsSnippetsAnd",
        )}
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
            label={t("settings.controls.widgetsControl.showAddresses")}
            description={t(
              "settings.controls.widgetsControl.showUserHostUnderEach",
            )}
          >
            <FakeSwitch
              checked={prefs.showAddresses}
              onChange={(value) => update({ showAddresses: value })}
            />
          </SettingRow>
          <SettingRow
            label={t("settings.controls.widgetsControl.includeOfflineHosts")}
            description={t(
              "settings.controls.widgetsControl.offShowsOnlyServersThat",
            )}
          >
            <FakeSwitch
              checked={prefs.includeOffline}
              onChange={(value) => update({ includeOffline: value })}
            />
          </SettingRow>
          <SettingRow
            label={t("settings.controls.widgetsControl.pinnedHostsOnly")}
            description={t(
              "settings.controls.widgetsControl.showOnlyTheHostsYou",
            )}
            last={!hasSnippetWidget}
          >
            <FakeSwitch
              checked={prefs.pinnedOnly}
              onChange={(value) => update({ pinnedOnly: value })}
            />
          </SettingRow>
          {hasSnippetWidget ? (
            <SettingRow
              label={t("settings.controls.widgetsControl.snippetsWidget")}
              description={t(
                "settings.controls.widgetsControl.showSavedCommandsOnThe",
              )}
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
              label={t("settings.controls.widgetsControl.showCommandPreview")}
              description={t(
                "settings.controls.widgetsControl.showTheFirstLineOf",
              )}
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
