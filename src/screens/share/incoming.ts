import { Directory, File, Paths } from "expo-file-system";
import type { ResolvedSharePayload } from "expo-sharing";
import { safeName } from "@/features/file-manager/transfers/device";

export interface SharedFile {
  /** A file:// uri in the app's cache. */
  path: string;
  name: string;
  size: number | null;
}

function shareDir(): Directory {
  const dir = new Directory(Paths.cache, "termix-share", `${Date.now()}`);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

/** A file name for a shared item, from its name, its uri, or its type. */
export function nameForPayload(payload: ResolvedSharePayload, index: number) {
  const fromUri = payload.contentUri
    ? decodeURIComponent(payload.contentUri.split("/").pop() ?? "").split(
        "?",
      )[0]
    : "";
  const raw = payload.originalName || fromUri;
  if (raw && raw.includes(".")) return safeName(raw);
  const type = payload.contentMimeType ?? payload.mimeType ?? "";
  const ext = EXT[type] ?? (payload.contentType === "text" ? "txt" : "bin");
  return safeName(`${raw || `shared-${index + 1}`}.${ext}`);
}

/**
 * Copies what another app shared into the cache as plain files, so uploads
 * read them like any picked file. Text becomes a .txt file.
 */
export async function toSharedFiles(
  payloads: ResolvedSharePayload[],
): Promise<SharedFile[]> {
  const dir = shareDir();
  const out: SharedFile[] = [];
  const taken = new Set<string>();
  for (const [i, payload] of payloads.entries()) {
    let name = nameForPayload(payload, i);
    while (taken.has(name)) name = `${i + 1}-${name}`;
    taken.add(name);
    const target = new File(dir, name);
    if (payload.contentType === "text" || !payload.contentUri) {
      if (!payload.value) continue;
      target.write(payload.value);
    } else if (payload.contentType === "website") {
      target.write(payload.contentUri);
    } else {
      // Content and app group uris are copied natively, never read into JS.
      await new File(payload.contentUri).copy(target, { overwrite: true });
    }
    out.push({
      path: target.uri,
      name,
      size: target.exists ? target.size : null,
    });
  }
  return out;
}
