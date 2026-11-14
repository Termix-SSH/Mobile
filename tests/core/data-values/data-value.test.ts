import { parseDataValue } from "@/core/data-values/data-value";

describe("parseDataValue (copy of core's)", () => {
  it("keeps good values and clamps bars", () => {
    expect(
      parseDataValue([
        { shape: "bars", items: [{ label: "CPU", value: 3 }] },
        { shape: "dot", tone: "warn", label: "slow" },
      ]),
    ).toEqual([
      { shape: "bars", items: [{ label: "CPU", value: 1 }] },
      { shape: "dot", tone: "warn", label: "slow" },
    ]);
  });

  it("drops unknown shapes, bad tones and shapes the place doesn't draw", () => {
    expect(parseDataValue({ shape: "html" })).toBeNull();
    expect(
      parseDataValue({ shape: "dot", tone: "pink", label: "" }),
    ).toBeNull();
    expect(
      parseDataValue(
        [
          { shape: "text", text: "a" },
          { shape: "badge", label: "b" },
        ],
        ["badge"],
      ),
    ).toEqual([{ shape: "badge", label: "b" }]);
  });
});
