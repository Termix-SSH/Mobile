import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Device } from "../devices";
import { jwt } from "./jwt";

const API = "https://api.appstoreconnect.apple.com/v1";
const EDITABLE = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
]);

export interface AscConfig {
  keyId: string;
  issuerId: string;
  privateKey: string;
  appId: string;
  locale: string;
  dryRun: boolean;
}

interface Resource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface UploadOperation {
  method: string;
  url: string;
  length: number;
  offset: number;
  requestHeaders: { name: string; value: string }[];
}

function client(cfg: AscConfig) {
  let token = "";
  let tokenAt = 0;
  const auth = () => {
    const now = Math.floor(Date.now() / 1000);
    if (!token || now - tokenAt > 900) {
      token = jwt(
        "ES256",
        cfg.privateKey,
        {
          iss: cfg.issuerId,
          iat: now,
          exp: now + 1200,
          aud: "appstoreconnect-v1",
        },
        { kid: cfg.keyId },
      );
      tokenAt = now;
    }
    return token;
  };
  return async function call<T = { data: Resource | Resource[] }>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${auth()}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    }
    return (res.status === 204 ? {} : await res.json()) as T;
  };
}

type Call = ReturnType<typeof client>;

async function list(call: Call, path: string): Promise<Resource[]> {
  const out: Resource[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: { data: Resource[]; links?: { next?: string } } = await call(
      "GET",
      next,
    );
    out.push(...page.data);
    next = page.links?.next;
  }
  return out;
}

async function editableLocalization(call: Call, cfg: AscConfig) {
  const versions = await list(
    call,
    `/apps/${cfg.appId}/appStoreVersions?filter[platform]=IOS&limit=10`,
  );
  const version = versions.find((v) =>
    EDITABLE.has(
      String(v.attributes.appVersionState ?? v.attributes.appStoreState),
    ),
  );
  if (!version) {
    throw new Error(
      "No iOS version is open for edits. Create the next version in App Store Connect first.",
    );
  }
  const locs = await list(
    call,
    `/appStoreVersions/${version.id}/appStoreVersionLocalizations`,
  );
  const loc = locs.find((l) => l.attributes.locale === cfg.locale);
  if (!loc) throw new Error(`Version has no ${cfg.locale} localization`);
  console.log(`  version ${version.attributes.versionString} (${cfg.locale})`);
  return loc.id;
}

/** Sends one file through the upload operations Apple hands back. */
async function sendParts(file: string, ops: UploadOperation[]) {
  const data = readFileSync(file);
  for (const op of ops) {
    const res = await fetch(op.url, {
      method: op.method,
      headers: Object.fromEntries(
        op.requestHeaders.map((h) => [h.name, h.value]),
      ),
      body: data.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`upload part failed: ${res.status}`);
  }
}

const md5 = (file: string) =>
  createHash("md5").update(readFileSync(file)).digest("hex");

interface Kind {
  setType: "appScreenshotSets" | "appPreviewSets";
  itemType: "appScreenshots" | "appPreviews";
  typeField: "screenshotDisplayType" | "previewType";
  setsPath: string;
  extra: Record<string, unknown>;
}

const SCREENSHOTS: Kind = {
  setType: "appScreenshotSets",
  itemType: "appScreenshots",
  typeField: "screenshotDisplayType",
  setsPath: "appScreenshotSets",
  extra: {},
};

const PREVIEWS: Kind = {
  setType: "appPreviewSets",
  itemType: "appPreviews",
  typeField: "previewType",
  setsPath: "appPreviewSets",
  extra: { mimeType: "video/mp4" },
};

/** Replaces one set's files with `files`, in order. */
async function replaceSet(
  call: Call,
  cfg: AscConfig,
  locId: string,
  kind: Kind,
  displayType: string,
  files: string[],
) {
  const sets = await list(
    call,
    `/appStoreVersionLocalizations/${locId}/${kind.setsPath}`,
  );
  let set = sets.find((s) => s.attributes[kind.typeField] === displayType);
  console.log(`  ${displayType}: ${files.length} file(s)`);
  if (cfg.dryRun) return;
  if (!set) {
    const made = await call<{ data: Resource }>("POST", `/${kind.setType}`, {
      data: {
        type: kind.setType,
        attributes: { [kind.typeField]: displayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: locId },
          },
        },
      },
    });
    set = made.data;
  }
  for (const old of await list(
    call,
    `/${kind.setType}/${set.id}/${kind.itemType}`,
  )) {
    await call("DELETE", `/${kind.itemType}/${old.id}`);
  }
  const ids: string[] = [];
  for (const file of files) {
    const made = await call<{ data: Resource }>("POST", `/${kind.itemType}`, {
      data: {
        type: kind.itemType,
        attributes: {
          fileName: basename(file),
          fileSize: statSync(file).size,
          ...kind.extra,
        },
        relationships: {
          [kind.setType.slice(0, -1)]: {
            data: { type: kind.setType, id: set.id },
          },
        },
      },
    });
    await sendParts(
      file,
      made.data.attributes.uploadOperations as UploadOperation[],
    );
    await call("PATCH", `/${kind.itemType}/${made.data.id}`, {
      data: {
        type: kind.itemType,
        id: made.data.id,
        attributes: { uploaded: true, sourceFileChecksum: md5(file) },
      },
    });
    ids.push(made.data.id);
    console.log(`    ${basename(file)}`);
  }
  await call(
    "PATCH",
    `/${kind.setType}/${set.id}/relationships/${kind.itemType}`,
    {
      data: ids.map((id) => ({ type: kind.itemType, id })),
    },
  );
}

export async function uploadIos(
  cfg: AscConfig,
  devices: Device[],
  finalDir: string,
) {
  const call = client(cfg);
  const locId = await editableLocalization(call, cfg);
  for (const device of devices) {
    const dir = join(finalDir, "ios", device.id);
    if (!existsSync(dir)) continue;
    console.log(device.label);
    const pngs = readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => join(dir, f));
    if (device.asc?.screenshot && pngs.length) {
      await replaceSet(
        call,
        cfg,
        locId,
        SCREENSHOTS,
        device.asc.screenshot,
        pngs,
      );
    } else if (pngs.length) {
      console.log("  skipped screenshots: no App Store display type set");
    }
    const preview = join(dir, "preview.mp4");
    if (device.asc?.preview && existsSync(preview)) {
      await replaceSet(call, cfg, locId, PREVIEWS, device.asc.preview, [
        preview,
      ]);
    } else if (existsSync(preview)) {
      console.log("  skipped preview: no App Store preview type set");
    }
  }
}
