import { fireEvent, render, screen } from "@testing-library/react-native";
import { parseServerPlugins } from "@/core/api/compat/server-features";
import {
  hasPluginSettings,
  parseFieldInput,
  PluginSettingsView,
} from "@/screens/plugins/PluginSettingsView";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
  useUiColors: () => ({}),
}));
jest.mock("@/utils/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/core/plugins/strings", () => ({
  loadPluginStrings: async () => ({
    settings: {
      enabled: { label: "Send reports" },
      includePlatform: { label: "Include platform" },
      shareFeatureUsage: { label: "Share my feature use" },
    },
  }),
}));

const [entry] = parseServerPlugins([
  {
    id: "stats",
    name: "Usage Statistics",
    enabled: true,
    state: "active",
    contributes: {
      settings: {
        admin: [
          { key: "status", type: "custom", component: "status" },
          {
            key: "enabled",
            type: "boolean",
            labelKey: "settings.enabled.label",
          },
          {
            key: "includePlatform",
            type: "boolean",
            labelKey: "settings.includePlatform.label",
            requires: "enabled",
          },
          { key: "instanceId", type: "string", hidden: true },
        ],
        user: [
          {
            key: "shareFeatureUsage",
            type: "boolean",
            labelKey: "settings.shareFeatureUsage.label",
          },
        ],
      },
    },
  },
])!;

function client(admin: Record<string, unknown> | Error) {
  const update = jest.fn(async (_id: string, scope: string, values: object) =>
    scope === "admin"
      ? { ...(admin as object), ...values }
      : { shareFeatureUsage: true, ...values },
  );
  return {
    update,
    client: {
      api: {
        pluginSettings: {
          get: jest.fn(async (_id: string, scope: string) => {
            if (scope === "user") return { shareFeatureUsage: true };
            if (admin instanceof Error) throw admin;
            return admin;
          }),
          update,
        },
      },
    } as any,
  };
}

test("manifest admin and user settings are read from the plugin list", () => {
  expect(entry.adminSettings?.map((f) => f.key)).toEqual([
    "status",
    "enabled",
    "includePlatform",
    "instanceId",
  ]);
  expect(entry.userSettings?.map((f) => f.key)).toEqual(["shareFeatureUsage"]);
  expect(hasPluginSettings(entry)).toBe(true);
  expect(hasPluginSettings({ id: "x", active: true })).toBe(false);
});

test("an admin sees both scopes and a switch saves only its own key", async () => {
  const { client: c, update } = client({
    enabled: true,
    includePlatform: true,
  });
  await render(<PluginSettingsView client={c} entry={entry} />);
  expect(await screen.findByText("For everyone on the server")).toBeTruthy();
  expect(screen.getByText("Just for you")).toBeTruthy();
  expect(screen.getByText("Include platform")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Share my feature use"));
  expect(update).toHaveBeenCalledWith("stats", "user", {
    shareFeatureUsage: false,
  });
  // The custom status field has no phone version.
  expect(
    screen.getByText("More settings for this are in the Termix web app."),
  ).toBeTruthy();
});

test("fields that need a switch hide while it is off", async () => {
  const { client: c } = client({ enabled: false, includePlatform: true });
  await render(<PluginSettingsView client={c} entry={entry} />);
  expect(await screen.findByText("Send reports")).toBeTruthy();
  expect(screen.queryByText("Include platform")).toBeNull();
});

test("someone who can't manage plugins only sees their own settings", async () => {
  const { client: c } = client(new Error("403"));
  await render(<PluginSettingsView client={c} entry={entry} />);
  expect(await screen.findByText("Just for you")).toBeTruthy();
  expect(screen.queryByText("For everyone on the server")).toBeNull();
  expect(screen.queryByText("Send reports")).toBeNull();
});

test("numbers are checked against the field's range", () => {
  const field = { key: "days", type: "number" as const, min: 1, max: 30 };
  expect(parseFieldInput(field, "7")).toEqual({ value: 7 });
  expect(parseFieldInput(field, "")).toEqual({ value: null });
  expect(parseFieldInput(field, "abc")).toHaveProperty("error");
  expect(parseFieldInput(field, "0")).toHaveProperty("error");
  expect(parseFieldInput(field, "31")).toHaveProperty("error");
});
