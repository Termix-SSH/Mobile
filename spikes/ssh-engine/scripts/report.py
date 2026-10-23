"""Merges spike results (*.jsonl and sizes/*.json) into one Markdown report."""
import glob
import json
import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "results"
rows = {}
platforms = set()
for path in glob.glob(os.path.join(root, "**", "*.jsonl"), recursive=True):
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        plat = r["platform"].split("-")[0] if r["platform"] != "host" else "rust"
        platforms.add(plat)
        rows.setdefault(r["scenario"], {})[(r["engine"], plat)] = r

order = sorted(platforms, key=lambda p: ["rust", "jvm", "android", "ios"].index(p) if p in ["rust", "jvm", "android", "ios"] else 9)
engines = ["russh", "libssh2"]


def cell(r):
    if r is None:
        return " "
    d = r.get("detail") or {}
    if not isinstance(d, dict):
        d = {}
    extra = []
    for k in ["down_mbps", "up_mbps", "peak_growth_mb", "detect_s", "hop_ms", "rounds", "alive", "responds", "reconnect"]:
        if k in d and d[k] is not None:
            v = d[k]
            extra.append(f"{k}={v:.1f}" if isinstance(v, float) else f"{k}={v}")
    mark = "ok" if r["ok"] else "FAIL"
    return mark + (" (" + ", ".join(extra) + ")" if extra else "")


out = ["## Scenarios", ""]
head = ["scenario"] + [f"{e} {p}" for e in engines for p in order]
out.append("| " + " | ".join(head) + " |")
out.append("|" + "---|" * len(head))
for name in sorted(rows, key=lambda n: (n.startswith("algo."), n)):
    if name == "version":
        continue
    cells = [cell(rows[name].get((e, p))) for e in engines for p in order]
    out.append(f"| {name} | " + " | ".join(cells) + " |")

failures = []
for name, by in rows.items():
    for (e, p), r in by.items():
        if not r["ok"]:
            d = r.get("detail") or {}
            err = d.get("error") if isinstance(d, dict) else d
            failures.append(f"- {e} {p} {name}: {str(err)[:200]}")
if failures:
    out += ["", "## Failures", ""] + sorted(failures)

sizes = []
for path in sorted(glob.glob(os.path.join(root, "**", "sizes*.json"), recursive=True)):
    try:
        sizes.append(json.load(open(path)))
    except json.JSONDecodeError:
        pass
if sizes:
    out += ["", "## Sizes and build times", "", "| what | value |", "|---|---|"]
    for s in sizes:
        for k, v in s.items():
            out.append(f"| {k} | {v} |")

print("\n".join(out))
