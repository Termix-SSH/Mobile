import { render, screen } from "@testing-library/react-native";

import { GpuWidget } from "@/features/host-metrics/widgets/GpuWidget";
import { LoginStatsWidget } from "@/features/host-metrics/widgets/LoginStatsWidget";
import { TemperatureWidget } from "@/features/host-metrics/widgets/TemperatureWidget";
import type { ServerMetrics } from "@/types";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => ({
    brand: "#f59145",
    warning: "#f3ca3e",
    destructive: "#ff6467",
  }),
}));

const base: ServerMetrics = {
  cpu: { percent: 0, cores: 1, load: null },
  memory: { percent: 0, usedGiB: 0, totalGiB: 0 },
  disk: { percent: 0, usedHuman: null, totalHuman: null },
  lastChecked: "",
};

test("login rows show the ip the server sends", async () => {
  await render(
    <LoginStatsWidget
      metrics={{
        ...base,
        loginStats: {
          recentLogins: [
            { user: "root", ip: "10.0.0.5", time: "Oct 25", status: "success" },
          ],
          failedLogins: [
            { user: "admin", ip: "1.2.3.4", time: "Oct 24", status: "failed" },
          ],
          totalLogins: 9,
          uniqueIPs: 2,
        },
      }}
    />,
  );
  expect(screen.getByText("10.0.0.5 | Oct 25")).toBeTruthy();
  expect(screen.getByText("1.2.3.4 | Oct 24")).toBeTruthy();
  expect(screen.getByText("9")).toBeTruthy();
});

test("temperature lists sensors hottest first", async () => {
  await render(
    <TemperatureWidget
      metrics={{
        ...base,
        temperature: {
          source: "sysfs",
          highestCelsius: 71,
          sensors: [
            { label: "nvme", celsius: 40 },
            { label: "Package id 0", celsius: 71 },
          ],
        },
      }}
    />,
  );
  const labels = screen.getAllByText(/nvme|Package id 0/).map((n) => {
    const kids = n.props.children;
    return Array.isArray(kids) ? kids.join("") : kids;
  });
  expect(labels).toEqual(["Package id 0", "nvme"]);
});

test("temperature hides when the host has no sensors", async () => {
  await render(
    <TemperatureWidget
      metrics={{ ...base, temperature: { source: "none", sensors: [] } }}
    />,
  );
  expect(screen.toJSON()).toBeNull();
});

test("gpu shows each card with memory and power", async () => {
  await render(
    <GpuWidget
      metrics={{
        ...base,
        gpu: {
          source: "nvidia-smi",
          processes: [],
          gpus: [
            {
              index: 0,
              uuid: "GPU-1",
              name: "RTX 4090",
              driverVersion: "550",
              utilizationPercent: 63,
              memoryUsedMiB: 2048,
              memoryTotalMiB: 24576,
              memoryPercent: 8,
              temperatureCelsius: 55,
              powerDrawWatts: 210,
              powerLimitWatts: 450,
              fanPercent: 40,
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("RTX 4090")).toBeTruthy();
  expect(screen.getByText("2.0 / 24.0 GiB")).toBeTruthy();
  expect(screen.getByText("210 / 450 W")).toBeTruthy();
});
