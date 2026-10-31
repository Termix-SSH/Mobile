const BY_EXT: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  py: "python",
  pyw: "python",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  vue: "html",
  css: "css",
  scss: "css",
  less: "css",
  md: "markdown",
  markdown: "markdown",
  xml: "xml",
  svg: "xml",
  plist: "xml",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  rs: "rust",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  java: "java",
  kt: "java",
  php: "php",
  go: "go",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ksh: "shell",
  fish: "shell",
  toml: "toml",
  ini: "properties",
  conf: "properties",
  cfg: "properties",
  env: "properties",
  properties: "properties",
  service: "properties",
  timer: "properties",
  lua: "lua",
  rb: "ruby",
  ps1: "powershell",
};

const BY_NAME: Record<string, string> = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "shell",
  ".bashrc": "shell",
  ".bash_profile": "shell",
  ".profile": "shell",
  ".zshrc": "shell",
  ".env": "properties",
  "nginx.conf": "nginx",
  gemfile: "ruby",
};

/** The editor language for a file name, or "" for plain text. */
export function languageFor(name: string, path = ""): string {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  if (lower.startsWith("dockerfile")) return "dockerfile";
  if (/\/nginx\//.test(path) && lower.endsWith(".conf")) return "nginx";
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? (BY_EXT[lower.slice(dot + 1)] ?? "") : "";
}
