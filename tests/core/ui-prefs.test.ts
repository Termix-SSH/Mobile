import {
  getUiPrefs,
  loadUiPrefs,
  resetUiPrefs,
  setUiPrefs,
  textScale,
} from "@/core/ui-prefs";
import { plainStore } from "@/core/storage/kv";
import { resetStorage } from "../helpers/http";

beforeEach(async () => {
  await resetStorage();
  resetUiPrefs();
});

describe("ui prefs", () => {
  it("starts with the defaults", async () => {
    await loadUiPrefs();
    expect(getUiPrefs()).toEqual({
      textSize: "default",
      density: "comfortable",
    });
  });

  it("saves a change and loads it back", async () => {
    await setUiPrefs({ textSize: "large" });
    resetUiPrefs();
    await loadUiPrefs();
    expect(getUiPrefs().textSize).toBe("large");
    expect(getUiPrefs().density).toBe("comfortable");
  });

  it("ignores values it does not know", async () => {
    await plainStore.setJson("ui.prefs", { textSize: "huge", density: 4 });
    await loadUiPrefs();
    expect(getUiPrefs()).toEqual({
      textSize: "default",
      density: "comfortable",
    });
  });

  it("maps sizes to scales", () => {
    expect(textScale("small")).toBeLessThan(1);
    expect(textScale("default")).toBe(1);
    expect(textScale("large")).toBeGreaterThan(1);
  });
});
