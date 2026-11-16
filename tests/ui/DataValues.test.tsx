import { render, screen } from "@testing-library/react-native";
import { DataValues } from "@/ui/DataValues";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => (token: string) => `token:${token}`,
}));

describe("DataValues", () => {
  it("draws nothing without values", async () => {
    await render(<DataValues values={null} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("draws bars with their percent and tones them by value", async () => {
    await render(
      <DataValues
        values={[
          {
            shape: "bars",
            items: [
              { label: "CPU", value: 0.42 },
              { label: "RAM", value: 0.95 },
            ],
          },
        ]}
      />,
    );
    expect(screen.getAllByTestId("data-bar")).toHaveLength(2);
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("95%")).toBeTruthy();
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).toContain("token:accent-brand");
    expect(tree).toContain("token:destructive");
  });

  it("draws stats, badges, dots and text", async () => {
    await render(
      <DataValues
        layout="stack"
        values={[
          { shape: "stat", items: [{ label: "Up", value: 3, unit: "d" }] },
          { shape: "badge", label: "Failing", tone: "bad" },
          { shape: "dot", tone: "good", label: "Reachable" },
          { shape: "text", text: "Synced" },
        ]}
      />,
    );
    expect(screen.getByText("3 d")).toBeTruthy();
    expect(screen.getByText("Failing")).toBeTruthy();
    expect(screen.getByLabelText("Reachable")).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
  });
});
