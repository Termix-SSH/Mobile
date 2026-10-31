import { render, screen, waitFor } from "@testing-library/react-native";
import { DockerCard } from "@/features/docker/DockerCard";
import { MetricsCard } from "@/features/host-metrics/MetricsCard";
import { ServicesCard } from "@/features/services/ServicesCard";

let mockTarget: any = { phase: "connecting" };
const mockClient: any = {
  api: {
    docker: {
      getDockerSummary: jest.fn(async () => [
        { hostId: 99, running: 3, stopped: 1, unhealthy: 1, total: 5 },
      ]),
    },
    metrics: {
      getMetricsSummary: jest.fn(async () => [
        { hostId: 99, cpu: 12.4, memory: 95, disk: null, lastChecked: "" },
      ]),
    },
    services: {
      getServicesStatus: jest.fn(async () => ({
        init: "systemd",
        failed: 2,
        canEdit: true,
        readOnly: false,
      })),
    },
  },
};

jest.mock("@/core/exec", () => ({
  useCardTarget: () => mockTarget,
  usePoll: (task: (s: AbortSignal) => void, o: { enabled?: boolean }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      if (o.enabled !== false) void task(new AbortController().signal);
    }, [task, o.enabled]);
  },
}));
jest.mock("@/core/accounts", () => ({
  useClient: () => mockClient,
  accounts: {
    find: () => ({ id: "s", kind: "server" }),
    active: () => ({ id: "s" }),
  },
}));
jest.mock("@/core/data/repositories", () => ({
  repositoriesFor: () => ({
    metricSamples: { append: async () => {}, range: async () => [] },
  }),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
}));

const host = { id: 1, name: "web", ip: "10.0.0.1" } as any;
const props = { host, accountId: "s", active: true };

beforeEach(() => {
  mockTarget = { phase: "relay", host: { ...host, id: 99 } };
});

test("the docker card reads the server's cached counts for its host", async () => {
  await render(<DockerCard {...props} />);
  await waitFor(() => expect(screen.getByText("unhealthy")).toBeTruthy());
  expect(screen.getByText("3")).toBeTruthy();
});

test("the metrics card shows the last server sample", async () => {
  await render(<MetricsCard {...props} />);
  await waitFor(() => expect(screen.getByText("12%")).toBeTruthy());
  expect(screen.getByText("95%")).toBeTruthy();
  expect(screen.getByText("-")).toBeTruthy();
});

test("the services card shows failed units", async () => {
  await render(<ServicesCard {...props} />);
  await waitFor(() => expect(screen.getByText("2 failed")).toBeTruthy());
});

test("a blocked target shows its reason", async () => {
  mockTarget = {
    phase: "failed",
    failure: {
      stage: "unavailable",
      message: "Docker is off on this server",
      hint: "",
    },
  };
  await render(<DockerCard {...props} />);
  expect(screen.getByText("Docker is off on this server")).toBeTruthy();
});
