import path from "node:path";
import { transformSync } from "@babel/core";

function consoleCalls(envName: string): string[] {
  const out = transformSync(
    "console.log(1); console.warn(2); console.info(3);",
    {
      filename: "x.js",
      envName,
      babelrc: false,
      configFile: path.join(__dirname, "../../babel.config.js"),
      caller: { name: "metro", platform: "ios" } as never,
    },
  )!.code!;
  return out.match(/console\.\w+/g) ?? [];
}

test("release builds keep only warnings and errors on the console", () => {
  expect(consoleCalls("production")).toEqual(["console.warn"]);
  expect(consoleCalls("development")).toHaveLength(3);
});
