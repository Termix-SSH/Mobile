import { hostRowMetrics } from "@/features/host-metrics/register";
import type { SSHHost } from "@/types";

const host = (extra: Partial<SSHHost> = {}) =>
  ({
    id: 1,
    name: "web",
    ip: "10.0.0.1",
    enableTerminal: true,
    ...extra,
  }) as unknown as SSHHost;

describe("host row metrics as data", () => {
  it("gives CPU and RAM bars as shares", () => {
    expect(hostRowMetrics(host(), { cpu: 42, ram: 75 })).toEqual({
      shape: "bars",
      items: [
        { label: "CPU", value: 0.42 },
        { label: "RAM", value: 0.75 },
      ],
    });
  });

  it("leaves out unknown or zero readings, and gives nothing without any", () => {
    expect(hostRowMetrics(host(), { cpu: 0, ram: 30 })).toEqual({
      shape: "bars",
      items: [{ label: "RAM", value: 0.3 }],
    });
    expect(hostRowMetrics(host(), { cpu: null, ram: null })).toBeNull();
    expect(hostRowMetrics(host(), undefined)).toBeNull();
  });

  it("gives nothing for a host with metrics turned off", () => {
    expect(
      hostRowMetrics(
        host({
          pluginSettings: { "host-metrics": { metricsEnabled: false } },
        } as Partial<SSHHost>),
        { cpu: 50, ram: 50 },
      ),
    ).toBeNull();
  });
});
