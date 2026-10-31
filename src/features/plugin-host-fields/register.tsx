import { useEffect, useState } from "react";
import { View } from "react-native";
import { Puzzle } from "lucide-react-native";
import { ChoiceRow, FakeSwitch, Field, Input, SettingRow, Text } from "@/ui";
import { useClient } from "@/core/accounts";
import { features, type FeatureRegistry } from "@/core/features/registry";
import type {
  FeatureContext,
  FeatureDef,
  HostEditorSectionDef,
  HostFormTabProps,
  HostFormValues,
} from "@/core/features/types";
import {
  humanize,
  lookupString,
  type HostSettingField,
} from "@/core/plugins/host-settings";
import { loadPluginStrings } from "@/core/plugins/strings";
import {
  changedPluginFields,
  planPluginFields,
  pluginFieldError,
  readPluginFields,
  type PluginFieldsPlan,
} from "./fields";

const BEFORE = "__before";

function usePluginStrings(accountId: string, plan: PluginFieldsPlan) {
  const client = useClient(accountId);
  const [strings, setStrings] = useState<Record<string, unknown>>();
  const version = plan.plugin.frame?.assetVersion ?? plan.plugin.version;
  useEffect(() => {
    if (!client) return;
    let live = true;
    loadPluginStrings(client, plan.plugin.id, version ?? undefined).then(
      (value) => live && setStrings(value),
    );
    return () => {
      live = false;
    };
  }, [client, plan.plugin.id, version]);
  return strings;
}

function labelOf(
  strings: Record<string, unknown> | undefined,
  field: HostSettingField,
) {
  return lookupString(strings, field.labelKey) ?? humanize(field.key);
}

function sectionComponent(plan: PluginFieldsPlan, accountId: string) {
  function PluginFields({ value, onChange }: HostFormTabProps) {
    const strings = usePluginStrings(accountId, plan);
    const on = plan.enableKey ? value[plan.enableKey] === true : true;
    const text = (key?: string) => lookupString(strings, key);
    const shown = plan.fields.filter(
      (f) => !f.requires || value[f.requires] === true,
    );
    return (
      <View className="gap-3">
        {plan.enableKey ? (
          <SettingRow
            label={
              text(plan.settings.enableLabelKey) ??
              `Turn on ${plan.plugin.name ?? plan.plugin.id}`
            }
            description={text(plan.settings.enableDescriptionKey)}
            last={!on || shown.length === 0}
          >
            <FakeSwitch
              checked={on}
              onChange={(v) => onChange({ [plan.enableKey!]: v })}
            />
          </SettingRow>
        ) : null}
        {on
          ? shown.map((field, i) => {
              const label = labelOf(strings, field);
              const description = text(field.descriptionKey);
              const current = value[field.key];
              if (field.type === "boolean") {
                return (
                  <SettingRow
                    key={field.key}
                    label={label}
                    description={description}
                    last={i === shown.length - 1}
                  >
                    <FakeSwitch
                      checked={current === true}
                      onChange={(v) => onChange({ [field.key]: v })}
                    />
                  </SettingRow>
                );
              }
              if (field.type === "select") {
                return (
                  <ChoiceRow
                    key={field.key}
                    label={label}
                    description={description}
                    value={String(current ?? "")}
                    options={(field.options ?? []).map((o) => ({
                      value: o.value,
                      label: text(o.labelKey) ?? humanize(o.value),
                    }))}
                    onChange={(v) => onChange({ [field.key]: v })}
                    last={i === shown.length - 1}
                  />
                );
              }
              return (
                <Field key={field.key} label={label} hint={description}>
                  <Input
                    value={
                      current === undefined || current === null
                        ? ""
                        : String(current)
                    }
                    onChangeText={(v) => onChange({ [field.key]: v })}
                    placeholder={text(field.placeholderKey)}
                    secureTextEntry={field.type === "secret"}
                    keyboardType={
                      field.type === "number" ? "numeric" : "default"
                    }
                    multiline={field.type === "textarea"}
                    style={
                      field.type === "textarea" ? { minHeight: 80 } : undefined
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
              );
            })
          : null}
        {on && plan.webOnly ? (
          <Text className="text-meta text-muted-foreground">
            More settings for this are in the Termix web app.
          </Text>
        ) : null}
      </View>
    );
  }
  PluginFields.displayName = `PluginFields(${plan.plugin.id})`;
  return PluginFields;
}

const components = new Map<string, ReturnType<typeof sectionComponent>>();

function sectionFor(
  plan: PluginFieldsPlan,
  accountId: string,
): HostEditorSectionDef {
  const key = `${accountId}:${plan.plugin.id}:${plan.plugin.version ?? ""}`;
  let component = components.get(key);
  if (!component) {
    component = sectionComponent(plan, accountId);
    components.set(key, component);
  }
  const ssh = plan.settings.editorGroup === "ssh";
  return {
    id: `plugin:${plan.plugin.id}`,
    label: plan.plugin.name ?? humanize(plan.plugin.id),
    icon: Puzzle,
    group: ssh ? "ssh" : "feature",
    order: 100 + (plan.settings.editorOrder ?? 50),
    toggle: plan.toggle,
    editor: {
      read: (host) => {
        const values = readPluginFields(plan, host);
        return { ...values, [BEFORE]: values };
      },
      write: (value, payload) => {
        const before = (value[BEFORE] ?? {}) as HostFormValues;
        const changed = changedPluginFields(plan, before, value);
        if (Object.keys(changed).length === 0) return;
        payload.pluginSettingsPatch = {
          ...payload.pluginSettingsPatch,
          [plan.plugin.id]: changed,
        };
      },
      validate: (value) =>
        pluginFieldError(plan, value, (f) => humanize(f.key)),
      component,
    },
  };
}

/** Plugins a native feature already draws a section for, and its switches. */
function nativeCoverage(registry: FeatureRegistry) {
  const covered = new Set<string>();
  const toggles = new Set<string>();
  for (const def of registry.all()) {
    if (def.source !== "native") continue;
    for (const toggle of def.hostToggles ?? []) toggles.add(toggle.key);
    if (Array.isArray(def.hostEditorSections) && def.hostEditorSections.length)
      for (const id of def.plugins ?? []) covered.add(id);
  }
  return { covered, toggles };
}

export function pluginHostFieldsFeature(
  registry: FeatureRegistry = features,
): FeatureDef {
  return {
    id: "plugin-host-fields",
    title: "Plugin host settings",
    source: "native",
    availableOn: ["server"],
    hostEditorSections: (ctx: FeatureContext) => {
      if (!ctx.client) return [];
      const { covered, toggles } = nativeCoverage(registry);
      return planPluginFields(ctx.client.serverPlugins, covered, toggles).map(
        (plan) => sectionFor(plan, ctx.account.id),
      );
    },
  };
}
