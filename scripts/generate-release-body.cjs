const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`generate-release-body: ${message}`);
  process.exit(1);
}

function changelogSection(changelog, version) {
  const lines = changelog.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  return (
    lines
      .slice(start + 1, end)
      .join("\n")
      .trim() || null
  );
}

function buildTable(version) {
  const base = `https://github.com/Termix-SSH/Mobile/releases/download/release-${version}-tag`;
  return [
    "| Platform | Download |",
    "|----------|----------|",
    `| **Android** | [APK](${base}/termix_android.apk) |`,
    `| **iOS** | [IPA](${base}/termix_ios.ipa) |`,
  ].join("\n");
}

function buildBody(changelog, version) {
  const notes = changelogSection(changelog, version);
  if (!notes) return null;

  // The summary is everything before the first ### list
  const listStart = notes.search(/^### /m);
  const summary = (listStart === -1 ? notes : notes.slice(0, listStart)).trim();
  const lists = listStart === -1 ? "" : notes.slice(listStart).trim();

  const body = [summary, "", buildTable(version)];
  if (lists) body.push("", lists);
  return body.join("\n").trim() + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  const root = path.resolve(__dirname, "..");
  const version =
    flag("version") ||
    JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo
      .version;
  const changelogPath = path.resolve(
    flag("changelog") || path.join(root, "CHANGELOG.md"),
  );

  if (!fs.existsSync(changelogPath)) {
    fail(`changelog not found: ${changelogPath}`);
  }

  const body = buildBody(fs.readFileSync(changelogPath, "utf8"), version);
  if (!body) fail(`CHANGELOG.md has no notes for ${version}`);
  process.stdout.write(body);
}

if (require.main === module) {
  main();
}

module.exports = { buildBody };
