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

export function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function getParentPath(path: string): string {
  if (path === "/" || !path) return "/";
  const parts = path.split("/").filter((p) => p);
  parts.pop();
  return "/" + parts.join("/");
}

export function joinPath(...parts: string[]): string {
  const joined = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter((part) => part)
    .join("/");
  return "/" + joined;
}

export function isTextFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  const textExtensions = [
    "txt",
    "md",
    "json",
    "xml",
    "html",
    "css",
    "js",
    "ts",
    "tsx",
    "jsx",
    "py",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "php",
    "rb",
    "go",
    "rs",
    "sh",
    "bash",
    "zsh",
    "fish",
    "yml",
    "yaml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "log",
    "env",
    "gitignore",
    "dockerignore",
    "editorconfig",
    "prettierrc",
  ];
  return textExtensions.includes(ext);
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

export function formatDate(dateString: string | undefined): string {
  if (!dateString) return "";

  try {
    const now = new Date();
    let date: Date;

    const parts = dateString.trim().split(/\s+/);
    if (parts.length === 3) {
      const [month, day, yearOrTime] = parts;

      if (yearOrTime.includes(":")) {
        const dateStr = `${month} ${day}, ${now.getFullYear()} ${yearOrTime}:00`;
        date = new Date(dateStr);

        if (date > now) {
          const lastYearStr = `${month} ${day}, ${now.getFullYear() - 1} ${yearOrTime}:00`;
          date = new Date(lastYearStr);
        }
      } else {
        date = new Date(`${month} ${day}, ${yearOrTime}`);
      }
    } else {
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) {
      return dateString;
    }

    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateString;
  }
}

export function sortFiles(
  files: any[],
  sortBy: "name" | "size" | "modified" = "name",
  sortOrder: "asc" | "desc" = "asc",
): any[] {
  const sorted = [...files].sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;

    let compareValue = 0;

    switch (sortBy) {
      case "name":
        compareValue = a.name.localeCompare(b.name);
        break;
      case "size":
        compareValue = (a.size || 0) - (b.size || 0);
        break;
      case "modified":
        compareValue =
          new Date(a.modified || 0).getTime() -
          new Date(b.modified || 0).getTime();
        break;
    }

    return sortOrder === "asc" ? compareValue : -compareValue;
  });

  return sorted;
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

export function breadcrumbsFromPath(path: string): string[] {
  if (!path || path === "/") return ["/"];

  const parts = path.split("/").filter((p) => p.trim() !== "");

  const breadcrumbs: string[] = ["/"];

  parts.forEach((part, index) => {
    const cumulativeParts = parts.slice(0, index + 1);
    const breadcrumbPath = "/" + cumulativeParts.join("/");
    breadcrumbs.push(breadcrumbPath);
  });

  return breadcrumbs;
}

export function getBreadcrumbLabel(path: string): string {
  if (path === "/") return "/";
  const parts = path.split("/").filter((p) => p);
  return parts[parts.length - 1] || "/";
}
