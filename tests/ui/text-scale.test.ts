import { classSize, scaledTextStyle } from "@/ui/text-scale";

describe("text scale", () => {
  it("reads the size class", () => {
    expect(classSize("text-row text-foreground")).toEqual([13, 17]);
    expect(classSize("text-[11px] text-muted-foreground")).toEqual([11, 15]);
    expect(classSize("flex-1")).toBeNull();
    expect(classSize(undefined)).toBeNull();
  });

  it("uses the last size class", () => {
    expect(classSize("text-sm text-xs")).toEqual([12, 16]);
  });

  it("scales font and line height", () => {
    const large = scaledTextStyle("text-row", 1.15)!;
    expect(large.fontSize).toBeCloseTo(15, 0);
    expect(large.lineHeight).toBeCloseTo(19.5, 0);
    const small = scaledTextStyle("text-row", 0.9)!;
    expect(small.fontSize).toBeLessThan(13);
    expect(small.lineHeight).toBeLessThan(17);
  });

  it("leaves text alone at the default size or with no size class", () => {
    expect(scaledTextStyle("text-row", 1)).toBeNull();
    expect(scaledTextStyle("flex-1", 1.15)).toBeNull();
  });
});
