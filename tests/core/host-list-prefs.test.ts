import {
  DEFAULT_HOST_LIST_PREFS,
  getHostListPrefs,
  loadHostListPrefs,
  resetHostListPrefs,
  setHostListPrefs,
} from "@/core/host-list-prefs";
import { plainStore } from "@/core/storage/kv";
import { resetStorage } from "../helpers/http";

beforeEach(async () => {
  await resetStorage();
  resetHostListPrefs();
});

describe("host list prefs", () => {
  it("starts with the defaults", async () => {
    await loadHostListPrefs();
    expect(getHostListPrefs()).toEqual(DEFAULT_HOST_LIST_PREFS);
  });

  it("saves a change and loads it back", async () => {
    await setHostListPrefs({ showAddress: false, statusColors: true });
    resetHostListPrefs();
    await loadHostListPrefs();
    expect(getHostListPrefs()).toEqual({
      ...DEFAULT_HOST_LIST_PREFS,
      showAddress: false,
      statusColors: true,
    });
  });

  it("ignores values that are not booleans", async () => {
    await plainStore.setJson("hosts.listPrefs", {
      showTags: "no",
      showPort: false,
      other: true,
    });
    await loadHostListPrefs();
    expect(getHostListPrefs()).toEqual({
      ...DEFAULT_HOST_LIST_PREFS,
      showPort: false,
    });
  });
});
