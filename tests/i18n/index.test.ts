import fs from "fs";
import path from "path";
import en from "@/i18n/locales/en.json";
import languages from "@/i18n/locales/languages.json";
import {
  matchLanguage,
  resolveLanguage,
  saveLanguage,
  savedLanguage,
  t,
} from "@/i18n";
import { BUNDLES } from "@/i18n/bundles";

const ROOT = path.join(__dirname, "..", "..");

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string"
      ? [key]
      : flatKeys(v as Record<string, unknown>, key);
  });
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("matchLanguage", () => {
  test.each([
    ["de-DE", "de"],
    ["de-AT", "de"],
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt-PT"],
    ["pt", "pt-PT"],
    ["zh-Hans-CN", "zh-CN"],
    ["zh-Hant-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["nb-NO", "no"],
    ["es-MX", "es-ES"],
    ["sv", "sv-SE"],
    ["en-GB", "en"],
  ])("%s is %s", (tag, code) => {
    expect(matchLanguage(tag)).toBe(code);
  });

  test("an unknown language has no match", () => {
    expect(matchLanguage("xx-YY")).toBeUndefined();
  });
});

test("the saved choice wins over the device, and system follows it", () => {
  expect(savedLanguage()).toBe("system");
  saveLanguage("fr");
  expect(savedLanguage()).toBe("fr");
  expect(resolveLanguage()).toBe("fr");
  saveLanguage("not-a-language");
  expect(savedLanguage()).toBe("system");
  saveLanguage("system");
});

test("every language has a bundle", () => {
  for (const l of languages) {
    expect(BUNDLES[l.code]).toBeDefined();
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          "src",
          "i18n",
          "locales",
          "translated",
          `${l.file}.json`,
        ),
      ),
    ).toBe(true);
  }
});

test("plurals and placeholders resolve in English", () => {
  expect(t("common.hostCount", { count: 1 })).toBe("1 host");
  expect(t("common.hostCount", { count: 3 })).toBe("3 hosts");
});

test("every key the app uses is in en.json", () => {
  const keys = new Set(flatKeys(en as Record<string, unknown>));
  const plural = new Set(
    [...keys]
      .filter((k) => /_(one|other)$/.test(k))
      .map((k) => k.replace(/_(one|other)$/, "")),
  );
  const missing: string[] = [];
  const files = [
    ...sourceFiles(path.join(ROOT, "src")),
    ...sourceFiles(path.join(ROOT, "app")),
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes('from "@/i18n"')) continue;
    for (const m of src.matchAll(/\btr?\(\s*"([a-zA-Z0-9_.]+)"/g)) {
      if (!keys.has(m[1]) && !plural.has(m[1])) {
        missing.push(`${path.relative(ROOT, file)}: ${m[1]}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

test("English text has no HTML entities left over from JSX", () => {
  const values = (obj: Record<string, unknown>): string[] =>
    Object.values(obj).flatMap((v) =>
      typeof v === "string" ? [v] : values(v as Record<string, unknown>),
    );
  const bad = values(en).filter((v) => /&(#\d+|[a-z]+);/i.test(v));
  expect(bad).toEqual([]);
});
