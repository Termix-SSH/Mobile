import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../../..", "modules/termix-fold");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("no native module means no folds", () => {
  jest.isolateModules(() => {
    jest.doMock("expo-modules-core", () => ({
      ...jest.requireActual("expo-modules-core"),
      requireOptionalNativeModule: () => null,
    }));
    const { getFolds, addFoldListener } = require("@/modules/termix-fold");
    expect(getFolds()).toEqual([]);
    expect(addFoldListener(() => {})).toBeNull();
  });
});

test("fold events reach the listener", () => {
  jest.isolateModules(() => {
    let emit: (e: { folds?: unknown[] }) => void = () => {};
    jest.doMock("expo-modules-core", () => ({
      ...jest.requireActual("expo-modules-core"),
      requireOptionalNativeModule: () => ({
        getFolds: () => [{ x: 1, y: 0, width: 0, height: 2, active: false }],
        addListener: (_: string, cb: typeof emit) => {
          emit = cb;
          return { remove() {} };
        },
      }),
    }));
    const { getFolds, addFoldListener } = require("@/modules/termix-fold");
    expect(getFolds()).toHaveLength(1);
    const seen: unknown[] = [];
    addFoldListener((f: unknown[]) => seen.push(f));
    emit({});
    expect(seen).toEqual([[]]);
  });
});

test("both platforms register the same module and event", () => {
  const config = JSON.parse(read("expo-module.config.json"));
  expect(config.apple.modules).toEqual(["FoldModule"]);
  expect(config.android.modules).toEqual([
    "expo.modules.termixfold.FoldModule",
  ]);
  const swift = read("ios/FoldModule.swift");
  const kotlin = read(
    "android/src/main/java/expo/modules/termixfold/FoldModule.kt",
  );
  for (const src of [swift, kotlin]) {
    expect(src).toContain('Name("TermixFold")');
    expect(src).toContain('"onFoldChange"');
    expect(src).toContain('"getFolds"');
  }
});

test("the fold code only builds with the iOS 27.1 SDK", () => {
  expect(read("ios/TermixFold.podspec")).toContain("TERMIX_DUO_SDK");
  expect(read("ios/FoldModule.swift")).toContain("#if TERMIX_DUO_SDK");
});
