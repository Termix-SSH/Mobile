import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getConsent, loadConsent, setConsent } from "@/core/analytics/consent";
import { readUsage, recordFeature } from "@/core/analytics/usage";
import { AnalyticsHost } from "@/screens/analytics/ConsentPrompt";
import {
  UsagePreviewControl,
  UsageResetIdControl,
  UsageStatsControl,
} from "@/screens/settings/controls/AnalyticsControls";
import { ConfirmProvider } from "@/ui";
import { resetAnalytics } from "../../core/analytics/helpers";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: class {
    capture = jest.fn();
    flush = async () => {};
    optOut = async () => {};
    shutdown = async () => {};
  },
}));
jest.mock("@/core/accounts", () => ({
  accounts: { list: () => [{ id: "local", kind: "local" }] },
}));
jest.mock("@/core/data/repositories", () => ({
  repositoriesFor: () => ({ hosts: { list: async () => [] } }),
}));

beforeEach(resetAnalytics);
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("AnalyticsHost", () => {
  it("asks the question when unanswered", async () => {
    await render(<AnalyticsHost hold={false} />);
    expect(
      await screen.findByText("Share anonymous usage statistics?"),
    ).toBeTruthy();
  });

  it("waits while the welcome screen is up", async () => {
    await render(<AnalyticsHost hold />);
    await act(async () => {
      await loadConsent();
    });
    expect(screen.queryByText("Share anonymous usage statistics?")).toBeNull();
  });

  it("saves yes", async () => {
    await render(<AnalyticsHost hold={false} />);
    const share = await screen.findByText("Share");
    await act(async () => {
      fireEvent.press(share);
    });
    expect(getConsent()).toBe("on");
  });

  it("saves no and counts nothing", async () => {
    await render(<AnalyticsHost hold={false} />);
    const no = await screen.findByText("No thanks");
    await act(async () => {
      fireEvent.press(no);
    });
    expect(getConsent()).toBe("off");
    await recordFeature("terminal");
    expect((await readUsage()).features).toEqual({});
  });

  it("closes once answered", async () => {
    await render(<AnalyticsHost hold={false} />);
    const no = await screen.findByText("No thanks");
    await act(async () => {
      fireEvent.press(no);
    });
    expect(screen.queryByText("Share anonymous usage statistics?")).toBeNull();
  });

  it("keeps an answer given while the saved one is still loading", async () => {
    const loading = loadConsent();
    await setConsent("on");
    await loading;
    expect(getConsent()).toBe("on");
  });

  it("does not ask again once answered", async () => {
    await setConsent("off");
    await render(<AnalyticsHost hold={false} />);
    await act(async () => {
      await loadConsent();
    });
    expect(screen.queryByText("Share anonymous usage statistics?")).toBeNull();
  });
});

describe("settings controls", () => {
  const wrap = (node: React.ReactElement) =>
    render(<ConfirmProvider>{node}</ConfirmProvider>);

  it("the switch turns reports on and off", async () => {
    await wrap(<UsageStatsControl />);
    const sw = screen.getByRole("switch");
    await act(async () => {
      fireEvent.press(sw);
    });
    expect(getConsent()).toBe("on");
    await act(async () => {
      fireEvent.press(screen.getByRole("switch"));
    });
    expect(getConsent()).toBe("off");
  });

  it("previews the next report", async () => {
    await setConsent("on");
    await wrap(<UsagePreviewControl />);
    fireEvent.press(screen.getByText("Preview"));
    expect(await screen.findByText(/app_heartbeat/)).toBeTruthy();
    expect(
      screen.getByText("This is exactly what would be sent right now."),
    ).toBeTruthy();
  });

  it("has a reset row", async () => {
    await wrap(<UsageResetIdControl />);
    expect(screen.getByText("Reset")).toBeTruthy();
  });
});
