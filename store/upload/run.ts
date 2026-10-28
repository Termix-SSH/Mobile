/**
 * Sends out/final to App Store Connect and Google Play.
 *
 *   npm run upload -- --platform ios --dry-run
 *
 * iOS env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (key text) or ASC_KEY_PATH,
 *          ASC_APP_ID (defaults to the Termix app).
 * Android env: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (key JSON text or a path).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { outputsFor, type Platform } from "../devices";
import { uploadAndroid } from "./android";
import { uploadIos } from "./ios";

const STORE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    platform: { type: "string", default: "both" },
    final: { type: "string", default: "out/final" },
    device: { type: "string" },
    locale: { type: "string", default: "en-US" },
    "dry-run": { type: "boolean", default: false },
  },
});

const finalDir = resolve(STORE, values.final!);
const platform = values.platform as Platform | "both";
const only = values.device?.split(",").filter(Boolean);
const dryRun = values["dry-run"]!;

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Text from an env var that holds either the value or a file path. */
function textOrFile(value: string): string {
  return existsSync(value) ? readFileSync(value, "utf8") : value;
}

if (platform !== "android") {
  console.log("App Store Connect");
  await uploadIos(
    {
      keyId: need("ASC_KEY_ID"),
      issuerId: need("ASC_ISSUER_ID"),
      privateKey: textOrFile(process.env.ASC_KEY_PATH ?? need("ASC_KEY_P8")),
      appId: process.env.ASC_APP_ID || "6752672071",
      locale: values.locale!,
      dryRun,
    },
    outputsFor("ios", only),
    finalDir,
  );
}

if (platform !== "ios") {
  console.log("\nGoogle Play");
  await uploadAndroid(
    {
      serviceAccount: JSON.parse(
        textOrFile(need("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")),
      ),
      packageName: process.env.PLAY_PACKAGE || "com.karmaa.termix",
      language: values.locale!,
      dryRun,
    },
    outputsFor("android", only),
    finalDir,
  );
}
