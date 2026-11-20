import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import type { ServerPlugin } from "@/core/api/compat/server-features";
import type { PluginSettingsScope } from "@/core/api/modules/pluginSettings";
import { toUserMessage } from "@/core/errors";
import {
  SIMPLE_FIELD_TYPES,
  humanize,
  lookupString,
  type HostSettingField,
} from "@/core/plugins/host-settings";
import { loadPluginStrings } from "@/core/plugins/strings";
import {
  ChoiceRow,
  FakeSwitch,
  Field,
  Input,
  Section,
  SettingRow,
  Text,
} from "@/ui";
import { toast } from "@/utils/toast";
import { t } from "@/i18n";

type Values = Record<string, unknown>;

/** Fields the phone draws, and whether some only work on the web. */
export function settingsPlan(fields: HostSettingField[] | undefined) {
  const visible = (fields ?? []).filter((f) => !f.hidden);
  const shown = visible.filter((f) => SIMPLE_FIELD_TYPES.has(f.type));
  return { shown, webOnly: shown.length < visible.length };
}

/** Whether the app can draw any of a plugin's own settings. */
export function hasPluginSettings(entry: ServerPlugin | null): boolean {
  return (
    !!entry?.active &&
    (settingsPlan(entry.adminSettings).shown.length > 0 ||
      settingsPlan(entry.userSettings).shown.length > 0)
  );
}

/** Typed text back into the field's type, or an error for a bad number. */
export function parseFieldInput(
  field: HostSettingField,
  raw: string,
): { value: unknown } | { error: string } {
  if (field.type !== "number") return { value: raw };
  if (raw.trim() === "") return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n))
    return { error: t("plugins.pluginSettings.notANumber") };
  if (field.min !== undefined && n < field.min)
    return { error: t("plugins.pluginSettings.atLeast", { min: field.min }) };
  if (field.max !== undefined && n > field.max)
    return { error: t("plugins.pluginSettings.atMost", { max: field.max }) };
  return { value: n };
}

function TextField({
  field,
  label,
  hint,
  placeholder,
  value,
  onSave,
}: {
  field: HostSettingField;
  label: string;
  hint?: string;
  placeholder?: string;
  value: unknown;
  onSave: (value: unknown) => void;
}) {
  const initial = value === undefined || value === null ? "" : String(value);
  // The parent keys this on the saved value, so a new value starts over.
  const [text, setText] = useState(initial);
  const commit = () => {
    if (text === initial) return;
    const parsed = parseFieldInput(field, text);
    if ("error" in parsed) {
      toast.error(parsed.error);
      setText(initial);
      return;
    }
    onSave(parsed.value);
  };
  return (
    <Field label={label} hint={hint}>
      <Input
        value={text}
        onChangeText={setText}
        onEndEditing={commit}
        placeholder={placeholder}
        secureTextEntry={field.type === "secret"}
        keyboardType={field.type === "number" ? "numeric" : "default"}
        multiline={field.type === "textarea"}
        style={field.type === "textarea" ? { minHeight: 80 } : undefined}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Field>
  );
}

function ScopeSection({
  title,
  fields,
  values,
  strings,
  onSave,
}: {
  title: string;
  fields: HostSettingField[];
  values: Values;
  strings: Record<string, unknown> | undefined;
  onSave: (key: string, value: unknown) => void;
}) {
  const text = (key?: string) => lookupString(strings, key);
  const shown = fields.filter(
    (f) => !f.requires || values[f.requires] === true,
  );
  if (shown.length === 0) return null;
  return (
    <Section title={title}>
      {shown.map((field, i) => {
        const label = text(field.labelKey) ?? humanize(field.key);
        const description = text(field.descriptionKey);
        const current = values[field.key] ?? field.default;
        const last = i === shown.length - 1;
        if (field.type === "boolean") {
          return (
            <SettingRow
              key={field.key}
              label={label}
              description={description}
              last={last}
            >
              <FakeSwitch
                checked={current === true}
                onChange={(v) => onSave(field.key, v)}
                accessibilityLabel={label}
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
              onChange={(v) => onSave(field.key, v)}
              last={last}
            />
          );
        }
        return (
          <TextField
            key={`${field.key}:${String(current ?? "")}`}
            field={field}
            label={label}
            hint={description}
            placeholder={text(field.placeholderKey)}
            value={current}
            onSave={(v) => onSave(field.key, v)}
          />
        );
      })}
    </Section>
  );
}

/**
 * A plugin's own settings from its manifest, for plugins with no page in
 * the app. Server wide ones show only to people who may change them.
 */
export function PluginSettingsView({
  client,
  entry,
}: {
  client: AccountClient;
  entry: ServerPlugin;
}) {
  const admin = settingsPlan(entry.adminSettings);
  const user = settingsPlan(entry.userSettings);
  const [strings, setStrings] = useState<Record<string, unknown>>();
  const [values, setValues] = useState<{
    admin: Values | null;
    user: Values | null;
  } | null>(null);

  useEffect(() => {
    let live = true;
    loadPluginStrings(client, entry.id, entry.version).then(
      (s) => live && setStrings(s),
    );
    const load = (scope: PluginSettingsScope, wanted: boolean) =>
      wanted
        ? client.api.pluginSettings.get(entry.id, scope).catch(() => null)
        : Promise.resolve(null);
    // Server wide settings need the right to manage plugins; others get null.
    Promise.all([
      load("admin", admin.shown.length > 0),
      load("user", user.shown.length > 0),
    ]).then(([a, u]) => live && setValues({ admin: a, user: u }));
    return () => {
      live = false;
    };
  }, [client, entry.id, entry.version, admin.shown.length, user.shown.length]);

  const save = useCallback(
    async (scope: PluginSettingsScope, key: string, value: unknown) => {
      setValues((prev) =>
        prev ? { ...prev, [scope]: { ...prev[scope], [key]: value } } : prev,
      );
      try {
        const saved = await client.api.pluginSettings.update(entry.id, scope, {
          [key]: value,
        });
        setValues((prev) => (prev ? { ...prev, [scope]: saved } : prev));
      } catch (error) {
        toast.error(
          toUserMessage(error, t("plugins.pluginSettings.couldNotSave")),
        );
        const fresh = await client.api.pluginSettings
          .get(entry.id, scope)
          .catch(() => null);
        if (fresh)
          setValues((prev) => (prev ? { ...prev, [scope]: fresh } : prev));
      }
    },
    [client, entry.id],
  );

  if (!values) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-sm text-muted-foreground">
          {t("plugins.pluginSettings.loading")}
        </Text>
      </View>
    );
  }

  const webOnly =
    (values.admin && admin.webOnly) || (values.user && user.webOnly);
  if (!values.admin && !values.user) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-sm text-muted-foreground">
          {t("plugins.pluginSettings.nothingYouCanChange")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 40 }}
    >
      {values.admin ? (
        <ScopeSection
          title={t("plugins.pluginSettings.forEveryone")}
          fields={admin.shown}
          values={values.admin}
          strings={strings}
          onSave={(key, value) => void save("admin", key, value)}
        />
      ) : null}
      {values.user ? (
        <ScopeSection
          title={t("plugins.pluginSettings.justForYou")}
          fields={user.shown}
          values={values.user}
          strings={strings}
          onSave={(key, value) => void save("user", key, value)}
        />
      ) : null}
      {webOnly ? (
        <Text className="text-meta text-muted-foreground">
          {t("pluginHostFields.register.moreSettingsForThisAre")}
        </Text>
      ) : null}
    </ScrollView>
  );
}
