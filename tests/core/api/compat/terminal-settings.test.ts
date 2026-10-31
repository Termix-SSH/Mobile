import {
  pluginSettingsFromTerminalConfig,
  terminalConfigFromPluginSettings,
} from "@/core/api/compat/terminal-settings";
import {
  buildPluginHostSettings,
  flattenPluginSettings,
} from "@/core/api/compat/api-compat";

describe("terminalConfigFromPluginSettings", () => {
  test("look values at the plugin default are left to the phone", () => {
    const config = terminalConfigFromPluginSettings({
      theme: "termix",
      cursorStyle: "bar",
      fontSize: 14,
      scrollback: 10000,
      bellStyle: "none",
    });
    expect(config).toEqual({});
  });

  test("look values the host set come through typed", () => {
    const config = terminalConfigFromPluginSettings({
      theme: "dracula",
      cursorStyle: "block",
      scrollback: "5000",
      bellStyle: "nope",
      customThemeColors: '{"background":"#000"}',
    });
    expect(config).toEqual({
      theme: "dracula",
      cursorStyle: "block",
      scrollback: 5000,
      customThemeColors: { background: "#000" },
    });
  });

  test("old theme names mean the app theme", () => {
    expect(terminalConfigFromPluginSettings({ theme: "Termix Dark" })).toEqual(
      {},
    );
  });

  test("behavior always comes from the host, except a default link choice", () => {
    const config = terminalConfigFromPluginSettings({
      autoTmux: true,
      sudoPasswordAutoFill: false,
      passwordPromptAutoFill: true,
      backspaceMode: "control-h",
      linkClickBehavior: "default",
      enableCommandHistory: "yes",
    });
    expect(config).toEqual({
      autoTmux: true,
      sudoPasswordAutoFill: false,
      passwordPromptAutoFill: true,
      backspaceMode: "control-h",
    });
  });

  test("the startup snippet takes an id or a syncId", () => {
    expect(
      terminalConfigFromPluginSettings(undefined, { startupSnippetId: 7 }),
    ).toEqual({ startupSnippetId: 7 });
    expect(
      terminalConfigFromPluginSettings(undefined, { startupSnippetId: "s-1" }),
    ).toEqual({ startupSnippetId: "s-1" });
    expect(
      terminalConfigFromPluginSettings(undefined, { startupSnippetId: null }),
    ).toEqual({});
  });
});

describe("pluginSettingsFromTerminalConfig", () => {
  test("writes only the keys the form set", () => {
    const out = pluginSettingsFromTerminalConfig({
      theme: "nord",
      autoTmux: true,
    });
    expect(out.terminal).toEqual({ theme: "nord", autoTmux: true });
    expect(out.snippets).toEqual({});
  });

  test("a look value cleared in the form goes back to the plugin default", () => {
    const out = pluginSettingsFromTerminalConfig({
      theme: undefined,
      scrollback: undefined,
    });
    expect(out.terminal).toEqual({ theme: "termix", scrollback: 10000 });
  });

  test("a cleared startup snippet is written as null", () => {
    expect(
      pluginSettingsFromTerminalConfig({ startupSnippetId: null }).snippets,
    ).toEqual({ startupSnippetId: null });
  });
});

test("flattened hosts carry terminalConfig and a save writes it back", () => {
  const host: any = flattenPluginSettings({
    id: 1,
    pluginSettings: {
      "ssh-terminal": { enableTerminal: true, theme: "nord", autoTmux: true },
      snippets: { startupSnippetId: 3 },
    },
  });
  expect(host.terminalConfig).toEqual({
    theme: "nord",
    autoTmux: true,
    startupSnippetId: 3,
  });
  const settings = buildPluginHostSettings(host);
  expect(settings["ssh-terminal"]).toEqual({
    theme: "nord",
    autoTmux: true,
    enableTerminal: true,
  });
  expect(settings.snippets).toEqual({ startupSnippetId: 3 });
});

test("a host with no terminal values gets no terminalConfig", () => {
  const host: any = flattenPluginSettings({
    id: 1,
    pluginSettings: { "ssh-terminal": { enableTerminal: true } },
  });
  expect(host.terminalConfig).toBeUndefined();
  expect(buildPluginHostSettings(host).snippets).toBeUndefined();
});
