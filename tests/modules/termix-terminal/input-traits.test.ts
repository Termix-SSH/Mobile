import fs from "node:fs";
import path from "node:path";

// The keyboard setup lives in native code that Jest can't run, so these read it.
const terminal = path.join(__dirname, "../../../modules/termix-terminal");
const kotlin = fs.readFileSync(
  path.join(
    terminal,
    "android/src/main/java/expo/modules/termixterminal/GhosttyTerminalView.kt",
  ),
  "utf8",
);
const swift = fs.readFileSync(
  path.join(
    terminal,
    "ios/vendor/GhosttyTerminal/Platform/UIKit/UITerminalView+UITextInput.swift",
  ),
  "utf8",
);

function body(source: string, start: RegExp): string {
  const at = source.search(start);
  expect(at).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) {
      return source.slice(open, i + 1);
    }
  }
  throw new Error("no closing brace");
}

describe("terminal keyboard on Android", () => {
  const input = body(kotlin, /override fun onCreateInputConnection\(/);

  it("never asks for a capital first letter (#93)", () => {
    expect(input).toMatch(/outAttrs\.inputType = InputType\.TYPE_CLASS_TEXT/);
    expect(input).not.toMatch(/TYPE_TEXT_FLAG_CAP_/);
    expect(input).not.toMatch(/TYPE_TEXT_FLAG_AUTO_CORRECT/);
    expect(input).toMatch(/TYPE_TEXT_FLAG_NO_SUGGESTIONS/);
    expect(input).toMatch(/outAttrs\.initialCapsMode = 0/);
  });
});

describe("terminal keyboard on iOS", () => {
  it("turns off capitals and autocorrect (#93)", () => {
    expect(
      body(
        swift,
        /open var autocapitalizationType: UITextAutocapitalizationType/,
      ),
    ).toMatch(/get \{ \.none \}/);
    expect(
      body(swift, /open var autocorrectionType: UITextAutocorrectionType/),
    ).toMatch(/get \{ \.no \}/);
  });
});
