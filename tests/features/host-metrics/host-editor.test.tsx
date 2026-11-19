import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DEFAULT_STATS_CONFIG } from "@/constants/stats-config";
import { localRepositories } from "@/core/data/local";
import { FeatureRegistry } from "@/core/features/registry";
import type { HostFormValues } from "@/core/features/types";
import {
  hostMetricsFeature,
  metricsAllowed,
} from "@/features/host-metrics/register";
import {
  formFromHost,
  payloadFromForm,
  visibleSections,
} from "@/screens/hosts/editor/model";
import { testStores } from "../../helpers/db";

const local = {
  account: { id: "local", kind: "local" } as const,
  client: null,
};
const registry = new FeatureRegistry();
registry.register(hostMetricsFeature);
const [section] = registry.hostEditorSections(local);

test("the metrics switch is local only, under SSH, and defaults on", () => {
  expect(section).toMatchObject({ id: "host-metrics", group: "ssh" });
  expect(section.editor.read(null)).toEqual(DEFAULT_STATS_CONFIG);
  expect(
    registry.hostEditorSections({
      account: { id: "server", kind: "server" } as any,
      client: null,
    }),
  ).toEqual([]);
  expect(visibleSections([section], { enableSsh: false, toggles: {} })).toEqual(
    [],
  );
});

test.each([false, true])(
  "the switch toggles metrics from %s and keeps the other settings after saving",
  async (metricsEnabled) => {
    const { stores } = testStores();
    const repos = localRepositories("local", stores);
    const config = {
      enabledWidgets: ["cpu", "memory"],
      metricsEnabled,
      metricsInterval: 15,
      statusCheckEnabled: false,
      statusCheckInterval: 60,
    };
    const host = await repos.hosts.create({
      name: "test",
      ip: "192.0.2.1",
      port: 22,
      username: "test",
      authType: "password",
      enableSsh: true,
      statsConfig: JSON.stringify(config),
    });
    let edited = section.editor.read(host);
    const Editor = section.editor.component;
    function Form() {
      const [value, setValue] = useState(edited);
      return (
        <Editor
          host={host}
          value={value}
          context={{ isEdit: true, otherHosts: [], toggles: {} }}
          onChange={(patch: HostFormValues) => {
            edited = { ...value, ...patch };
            setValue(edited);
          }}
        />
      );
    }
    await render(<Form />);
    expect(screen.getByRole("switch", { name: "Enable metrics" })).toHaveProp(
      "accessibilityState",
      { checked: metricsEnabled, disabled: false },
    );
    await fireEvent.press(
      screen.getByRole("switch", { name: "Enable metrics" }),
    );

    const payload = payloadFromForm({
      form: formFromHost(host, []),
      host,
      toggles: [],
      sections: [section],
      sectionValues: { [section.id]: edited },
      filledDefaults: {},
      savedSudo: "",
    });
    const saved = await repos.hosts.update(host.id, payload);
    expect(JSON.parse(saved.statsConfig!)).toEqual({
      ...config,
      metricsEnabled: !metricsEnabled,
    });
    expect(metricsAllowed(saved)).toBe(!metricsEnabled);
    expect(hostMetricsFeature.tools![0].isAvailable!(saved)).toBe(
      !metricsEnabled,
    );
    expect(section.editor.read(saved).metricsEnabled).toBe(!metricsEnabled);
    stores.close("local");
  },
);
