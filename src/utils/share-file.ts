import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Writes `content` to a temp file, opens the share sheet for it, then deletes
 * it, also when sharing fails, so no export stays in the cache.
 */
export async function shareTempFile(
  name: string,
  content: string,
  options: { mimeType: string; dialogTitle: string },
): Promise<void> {
  const file = new File(Paths.cache, name);
  try {
    file.create({ overwrite: true });
    file.write(content);
    await Sharing.shareAsync(file.uri, options);
  } finally {
    try {
      file.delete();
    } catch {
      // Already gone.
    }
  }
}
