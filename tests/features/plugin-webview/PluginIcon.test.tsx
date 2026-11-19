import { Blocks, Fingerprint, Trash2 } from "lucide-react-native";
import { pluginIcon } from "@/features/plugin-webview/PluginIcon";

describe("pluginIcon", () => {
  it("finds icons by name, old names included", () => {
    expect(pluginIcon("Fingerprint")).toBe(Fingerprint);
    expect(pluginIcon("Trash2")).toBe(Trash2);
  });

  it("falls back to a block", () => {
    expect(pluginIcon(undefined)).toBe(Blocks);
    expect(pluginIcon("NoSuchIcon")).toBe(Blocks);
    expect(pluginIcon("createLucideIcon")).toBe(Blocks);
  });
});
