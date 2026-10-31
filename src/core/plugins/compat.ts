import semver from "semver";
import { PLUGIN_HOST_API } from "./host-api";

/**
 * Whether the app can show a plugin, from its `engine.api` range:
 * - `ok`: fine, or the server did not say.
 * - `update-app`: the plugin needs a newer plugin API than the app has.
 * - `update-plugin`: the plugin was made for an older API major.
 */
export type ApiFit = "ok" | "update-app" | "update-plugin";

/**
 * A web view plugin runs on the app's copy of the SDK, so its range must take
 * that version. The app's own screens only call plugin routes, so for them
 * only a different major counts.
 */
export function apiFit(
  range: string | undefined,
  how: "webview" | "native",
  appApi: string = PLUGIN_HOST_API,
): ApiFit {
  if (!range || semver.validRange(range) === null) return "ok";
  if (semver.satisfies(appApi, range)) return "ok";
  const min = semver.minVersion(range);
  if (!min) return "ok";
  const app = semver.parse(appApi);
  if (!app) return "ok";
  if (how === "webview") {
    return semver.gt(min, app) ? "update-app" : "update-plugin";
  }
  if (min.major > app.major) return "update-app";
  if (min.major < app.major) return "update-plugin";
  return "ok";
}

/** The plain words for a fit that is not ok. */
export function fitMessage(
  fit: ApiFit,
  name: string,
): { title: string; hint: string } | null {
  if (fit === "update-app") {
    return {
      title: "Update the app",
      hint: `${name} on your server needs a newer version of Termix on this phone.`,
    };
  }
  if (fit === "update-plugin") {
    return {
      title: "Update the plugin",
      hint: `${name} on your server is too old for this app. Ask an admin to update it in Plugins.`,
    };
  }
  return null;
}

export { PLUGIN_HOST_API };
