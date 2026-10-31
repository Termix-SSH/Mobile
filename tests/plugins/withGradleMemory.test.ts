const { MEMORY } = require("../../plugins/withGradleMemory");
const { setProperties } = require("../../plugins/withFdroid");

test("release builds get a bigger gradle heap than the 2 GB default", () => {
  const out = setProperties(
    [{ type: "property", key: "org.gradle.jvmargs", value: "-Xmx2048m" }],
    MEMORY,
  );
  const args = out.filter(
    (p: { key: string }) => p.key === "org.gradle.jvmargs",
  );
  expect(args).toHaveLength(1);
  expect(args[0].value).toContain("-Xmx6g");
});
