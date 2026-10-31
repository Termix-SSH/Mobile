import fs from "node:fs";
import path from "node:path";

// The widget snapshot is decoded by TypeScript, Swift and Kotlin. Nothing in the
// compilers catches a field renamed on one side only, so this does.
const root = path.join(__dirname, "../..");
const widgetModule = path.join(root, "modules", "termix-widgets");
const kotlinDir = [
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "termixwidgets",
];
const read = (...segments: string[]) =>
  fs.readFileSync(path.join(...segments), "utf8");

const typescript = read(root, "src", "widgets", "types.ts");
const swift = read(widgetModule, "ios", "widget", "WidgetModels.swift");
const kotlin = read(widgetModule, ...kotlinDir, "WidgetSnapshot.kt");

function single(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  expect(match).not.toBeNull();
  return match![1];
}

test("the payload version is the same on all three sides", () => {
  const versions = new Set([
    single(typescript, /SNAPSHOT_VERSION\s*=\s*(\d+)/),
    single(swift, /supportedVersion\s*=\s*(\d+)/),
    single(kotlin, /SUPPORTED_VERSION\s*=\s*(\d+)/),
  ]);
  expect(versions.size).toBe(1);
});

function tsFields(name: string) {
  return single(
    typescript,
    new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\w+\??:/.test(line))
    .map((line) => line.split(/\??:/)[0])
    .sort();
}

function swiftFields(name: string) {
  const body = single(
    swift,
    new RegExp(`struct ${name}[^{]*\\{([\\s\\S]*?)\\n\\}`),
  );
  return [...body.matchAll(/^ {2}let (\w+):/gm)].map((m) => m[1]).sort();
}

function kotlinFields(name: string) {
  const body = single(
    kotlin,
    new RegExp(`data class ${name}\\(([\\s\\S]*?)\\n\\)`),
  );
  return [...body.matchAll(/val (\w+):/g)].map((m) => m[1]).sort();
}

test.each([
  ["WidgetSnapshot", "WidgetSnapshot"],
  ["WidgetPalette", "WidgetPalette"],
  ["WidgetSummary", "HostSummary"],
  ["WidgetHostEntry", "HostEntry"],
  ["WidgetSnippetEntry", "SnippetEntry"],
])("%s has the same fields in Swift and Kotlin", (ts, native) => {
  const expected = tsFields(ts);
  expect(swiftFields(native)).toEqual(expected);
  expect(kotlinFields(native)).toEqual(expected);
  // Kotlin parses by string key, so a matching property name is not enough.
  for (const field of expected) {
    if (field !== "url") expect(kotlin).toContain(`"${field}"`);
  }
});

test("both native sides use the shared snapshot key", () => {
  const key = "termix.widget.snapshot.v1";
  expect(read(widgetModule, "ios", "TermixWidgetsModule.swift")).toContain(key);
  expect(read(widgetModule, "ios", "widget", "SharedStore.swift")).toContain(
    key,
  );
  expect(read(widgetModule, ...kotlinDir, "SnapshotStore.kt")).toContain(key);
});

test("app.json registers the widget config plugin", () => {
  const appJson = JSON.parse(read(root, "app.json"));
  const names = (appJson.expo?.plugins ?? []).map((p: unknown) =>
    Array.isArray(p) ? p[0] : p,
  );
  expect(names).toContain("./plugins/withTermixWidgets.js");
});
