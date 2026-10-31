export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length === 1) return "";
  return parts[parts.length - 1].toLowerCase();
}

export function isTextFile(filename: string): boolean {
  // Dotfiles with no extension (e.g. .bashrc, .zshrc, .profile) are always text
  if (filename.startsWith(".") && !filename.slice(1).includes(".")) return true;

  const ext = getFileExtension(filename);

  // No extension at all - treat as text (e.g. Makefile, Dockerfile, LICENSE)
  if (!ext) return true;

  const binaryExtensions = [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "ico",
    "webp",
    "svg",
    "mp4",
    "avi",
    "mov",
    "wmv",
    "flv",
    "mkv",
    "webm",
    "mp3",
    "wav",
    "ogg",
    "flac",
    "aac",
    "m4a",
    "zip",
    "tar",
    "gz",
    "bz2",
    "xz",
    "7z",
    "rar",
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "exe",
    "bin",
    "so",
    "dylib",
    "dll",
    "class",
    "pyc",
    "db",
    "sqlite",
    "sqlite3",
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
  ];
  return !binaryExtensions.includes(ext);
}

export function isArchiveFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  const archiveExtensions = ["zip", "tar", "gz", "bz2", "xz", "7z", "rar"];
  return archiveExtensions.includes(ext);
}

export function isImageFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  const imageExtensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "svg",
    "webp",
    "ico",
  ];
  return imageExtensions.includes(ext);
}

export function isVideoFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  const videoExtensions = ["mp4", "avi", "mov", "wmv", "flv", "mkv", "webm"];
  return videoExtensions.includes(ext);
}

export function isPdfFile(filename: string): boolean {
  return getFileExtension(filename) === "pdf";
}

/** A short date for a list row: "5m ago", "3d ago", then "Mar 4". */
export function formatDate(
  value: number | string | null | undefined,
  now = new Date(),
): string {
  if (value == null || value === "") return "";
  // Numbers are seconds since the epoch, strings are ISO dates.
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (isNaN(date.getTime())) return typeof value === "string" ? value : "";

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs >= 0) {
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
  }

  return date.getFullYear() !== now.getFullYear()
    ? DATE_WITH_YEAR.format(date)
    : DATE_SHORT.format(date);
}

// Made once: building a formatter per row is what made long lists slow.
const DATE_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const DATE_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const NAME_ORDER = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** A full date and time for the properties view. */
export function formatDateTime(seconds: number | null | undefined): string {
  if (!seconds) return "Unknown";
  return new Date(seconds * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type SortBy = "name" | "size" | "modified";

/** Folders first (links to folders count), then by the chosen field. */
export function sortEntries<
  T extends {
    name: string;
    type: string;
    size: number;
    mtime: number | null;
    targetType?: string | null;
  },
>(files: T[], sortBy: SortBy = "name", order: "asc" | "desc" = "asc"): T[] {
  const items = files.map((file) => ({
    file,
    dir:
      file.type === "directory" ||
      (file.type === "link" && file.targetType === "directory"),
  }));
  const sign = order === "asc" ? 1 : -1;
  items.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    let compare = 0;
    if (sortBy === "size") compare = (a.file.size || 0) - (b.file.size || 0);
    else if (sortBy === "modified")
      compare = (a.file.mtime ?? 0) - (b.file.mtime ?? 0);
    if (compare === 0) compare = NAME_ORDER.compare(a.file.name, b.file.name);
    return sign * compare;
  });
  return items.map((item) => item.file);
}

/** Octal like 755, and the ls style string like rwxr-xr-x. */
export function modeText(mode: number | null | undefined): {
  octal: string;
  symbolic: string;
} {
  if (mode == null) return { octal: "", symbolic: "" };
  const bits = "rwxrwxrwx";
  let symbolic = "";
  for (let i = 0; i < 9; i++) {
    symbolic += mode & (1 << (8 - i)) ? bits[i] : "-";
  }
  return { octal: (mode & 0o7777).toString(8).padStart(3, "0"), symbolic };
}

export function getFileIconColor(filename: string, type: string): string {
  if (type === "directory") return "#3B82F6";
  if (type === "link") return "#8B5CF6";

  const ext = getFileExtension(filename);

  if (["js", "jsx", "ts", "tsx"].includes(ext)) return "#F59E0B";
  if (["py"].includes(ext)) return "#3B82F6";
  if (["java", "class"].includes(ext)) return "#EF4444";
  if (["c", "cpp", "h", "hpp"].includes(ext)) return "#06B6D4";
  if (["go"].includes(ext)) return "#06B6D4";
  if (["rs"].includes(ext)) return "#F97316";

  if (["html", "htm"].includes(ext)) return "#F97316";
  if (["css", "scss", "sass", "less"].includes(ext)) return "#3B82F6";
  if (["json", "xml"].includes(ext)) return "#F59E0B";

  if (["yml", "yaml", "toml", "ini", "conf", "cfg"].includes(ext))
    return "#8B5CF6";
  if (["env", "gitignore", "dockerignore"].includes(ext)) return "#6B7280";

  if (["md", "txt"].includes(ext)) return "#10B981";
  if (["pdf"].includes(ext)) return "#EF4444";
  if (["doc", "docx"].includes(ext)) return "#3B82F6";

  if (isArchiveFile(filename)) return "#8B5CF6";

  if (isImageFile(filename)) return "#EC4899";

  if (isVideoFile(filename)) return "#F59E0B";

  if (["sh", "bash", "zsh", "fish"].includes(ext)) return "#10B981";

  return "#9CA3AF";
}
