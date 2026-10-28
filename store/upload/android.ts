import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Output } from "../devices";
import { jwt } from "./jwt";

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD =
  "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";

export interface PlayConfig {
  /** The service account JSON key. */
  serviceAccount: { client_email: string; private_key: string };
  packageName: string;
  language: string;
  dryRun: boolean;
}

async function token(cfg: PlayConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt("RS256", cfg.serviceAccount.private_key, {
    iss: cfg.serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google sign in failed: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Replaces the Play listing images for each device in one edit. */
export async function uploadAndroid(
  cfg: PlayConfig,
  devices: Output[],
  finalDir: string,
) {
  const work = devices
    .filter((d) => d.play)
    .map((d) => {
      const dir = join(finalDir, "android", d.id);
      const files = existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => f.endsWith(".png"))
            .sort()
            .map((f) => join(dir, f))
        : [];
      return { device: d, files };
    })
    .filter((w) => w.files.length);
  for (const w of work) {
    console.log(`${w.device.label}: ${w.files.length} to ${w.device.play}`);
  }
  if (cfg.dryRun || !work.length) return;

  const auth = `Bearer ${await token(cfg)}`;
  const call = async (
    method: string,
    url: string,
    body?: BodyInit,
    type?: string,
  ) => {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        ...(type ? { "Content-Type": type } : {}),
      },
      body,
    });
    if (!res.ok)
      throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? {} : res.json();
  };
  const app = `${API}/applications/${cfg.packageName}`;
  const edit = (await call("POST", `${app}/edits`)) as { id: string };
  const listing = `/edits/${edit.id}/listings/${cfg.language}`;
  try {
    for (const { device, files } of work) {
      await call("DELETE", `${app}${listing}/${device.play}`);
      for (const file of files) {
        await call(
          "POST",
          `${UPLOAD}/applications/${cfg.packageName}${listing}/${device.play}?uploadType=media`,
          readFileSync(file),
          "image/png",
        );
        console.log(`  ${basename(file)}`);
      }
    }
    await call("POST", `${app}/edits/${edit.id}:commit`);
    console.log("Play listing updated");
  } catch (error) {
    await call("DELETE", `${app}/edits/${edit.id}`).catch(() => {});
    throw error;
  }
}
