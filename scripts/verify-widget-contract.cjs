/* eslint-env node */
/* global __dirname */

/**
 * Guards the home-screen widget payload contract.
 *
 * The snapshot the app publishes is decoded by three independent
 * implementations — TypeScript, Swift and Kotlin. Nothing in the compiler
 * chain catches a field renamed on one side only; the widget would just quietly
 * render blanks on one platform. This script fails loudly instead.
 *
 * Run with `npm run verify:widget-contract`.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const widgetModule = path.join(projectRoot, "modules", "termix-widgets");

function read(...segments) {
  return fs.readFileSync(path.join(...segments), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const typescript = read(projectRoot, "app", "widgets", "types.ts");
const swift = read(widgetModule, "ios", "widget", "WidgetModels.swift");
const kotlin = read(
  widgetModule,
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "termixwidgets",
  "WidgetSnapshot.kt",
);

// --- Payload version must be identical on all three sides.

function single(source, pattern, description) {
  const match = source.match(pattern);
  assert(match, `Could not find ${description}`);
  return match[1];
}

const versions = {
  TypeScript: single(
    typescript,
    /SNAPSHOT_VERSION\s*=\s*(\d+)/,
    "SNAPSHOT_VERSION in app/widgets/types.ts",
  ),
  Swift: single(
    swift,
    /supportedVersion\s*=\s*(\d+)/,
    "supportedVersion in WidgetModels.swift",
  ),
  Kotlin: single(
    kotlin,
    /SUPPORTED_VERSION\s*=\s*(\d+)/,
    "SUPPORTED_VERSION in WidgetSnapshot.kt",
  ),
};

const distinctVersions = new Set(Object.values(versions));
assert(
  distinctVersions.size === 1,
  `Snapshot version disagrees across decoders: ${JSON.stringify(versions)}. ` +
    "Bump it in all three when the payload shape changes.",
);

// --- Every field must exist on all three sides, spelled the same way.

/** Fields of a TypeScript interface, ignoring comments and optional markers. */
function tsFields(name) {
  const body = single(
    typescript,
    new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`),
    `interface ${name} in types.ts`,
  );
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\w+\??:/.test(line))
    .map((line) => line.split(/\??:/)[0])
    .sort();
}

function swiftFields(name) {
  const body = single(
    swift,
    new RegExp(`struct ${name}[^{]*\\{([\\s\\S]*?)\\n\\}`),
    `struct ${name} in WidgetModels.swift`,
  );
  return [...body.matchAll(/^ {2}let (\w+):/gm)].map((m) => m[1]).sort();
}

function kotlinFields(name) {
  const body = single(
    kotlin,
    new RegExp(`data class ${name}\\(([\\s\\S]*?)\\n\\)`),
    `data class ${name} in WidgetSnapshot.kt`,
  );
  return [...body.matchAll(/val (\w+):/g)].map((m) => m[1]).sort();
}

const shapes = [
  { ts: "WidgetSnapshot", native: "WidgetSnapshot" },
  { ts: "WidgetSummary", native: "HostSummary" },
  { ts: "WidgetHostEntry", native: "HostEntry" },
  { ts: "WidgetSnippetEntry", native: "SnippetEntry" },
];

for (const shape of shapes) {
  const expected = tsFields(shape.ts);
  const fromSwift = swiftFields(shape.native);
  const fromKotlin = kotlinFields(shape.native);

  assert(
    expected.join(",") === fromSwift.join(","),
    `${shape.ts} differs between TypeScript and Swift:\n` +
      `  ts:    ${expected.join(", ")}\n  swift: ${fromSwift.join(", ")}`,
  );
  assert(
    expected.join(",") === fromKotlin.join(","),
    `${shape.ts} differs between TypeScript and Kotlin:\n` +
      `  ts:     ${expected.join(", ")}\n  kotlin: ${fromKotlin.join(", ")}`,
  );

  // Kotlin parses by string key, so a matching property name is not enough.
  for (const field of expected) {
    assert(
      kotlin.includes(`"${field}"`) || field === "url",
      `WidgetSnapshot.kt never reads the "${field}" key when parsing ${shape.native}`,
    );
  }
}

// --- The shared storage key must match on both native sides.

const storageKey = "termix.widget.snapshot.v1";
const iosModule = read(widgetModule, "ios", "TermixWidgetsModule.swift");
const iosStore = read(widgetModule, "ios", "widget", "SharedStore.swift");
const androidStore = read(
  widgetModule,
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "termixwidgets",
  "SnapshotStore.kt",
);

for (const [name, source] of [
  ["TermixWidgetsModule.swift", iosModule],
  ["SharedStore.swift", iosStore],
  ["SnapshotStore.kt", androidStore],
]) {
  assert(
    source.includes(storageKey),
    `${name} must read/write the shared snapshot key "${storageKey}"`,
  );
}

// --- The iOS widget target only builds if the plugin is registered.

const appJson = require(path.join(projectRoot, "app.json"));
assert(
  (appJson.expo?.plugins ?? []).some((plugin) =>
    (Array.isArray(plugin) ? plugin[0] : plugin).includes(
      "withTermixWidgets.js",
    ),
  ),
  "app.json must include ./plugins/withTermixWidgets.js",
);

console.log(
  `Widget snapshot contract v${versions.TypeScript} matches across TypeScript, Swift and Kotlin.`,
);
