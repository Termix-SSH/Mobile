import axios from "axios";

export interface AppRelease {
  version: string;
  tagName: string;
  publishedAt: string;
}

/** Newest app release on GitHub. Needs no Termix server. */
export async function getLatestGitHubRelease(): Promise<AppRelease | null> {
  try {
    const response = await axios.get(
      "https://api.github.com/repos/Termix-SSH/Mobile/releases/latest",
      { timeout: 5000 },
    );
    const release = response.data;
    const tagName = release.tag_name;
    const versionMatch = tagName.match(
      /^(?:v|release-)(\d+\.\d+\.\d+)(?:-tag)?$/,
    );
    if (!versionMatch) return null;
    return {
      version: versionMatch[1],
      tagName,
      publishedAt: release.published_at,
    };
  } catch {
    return null;
  }
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  if (
    latestParts.length !== 3 ||
    currentParts.length !== 3 ||
    [...latestParts, ...currentParts].some(Number.isNaN)
  ) {
    return false;
  }
  for (let i = 0; i < latestParts.length; i += 1) {
    if (latestParts[i] !== currentParts[i]) {
      return latestParts[i] > currentParts[i];
    }
  }
  return false;
}
