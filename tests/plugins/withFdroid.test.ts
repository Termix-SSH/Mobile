const { setProperties, unsignRelease } = require("../../plugins/withFdroid");

const gradle = `android {
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled true
        }
    }
}`;

test("the release build type loses the debug signing line", () => {
  const out: string = unsignRelease(gradle);
  expect(out).toContain("minifyEnabled true");
  const release = out.slice(out.indexOf("release {"));
  expect(release).not.toContain("signingConfig");
});

test("the debug build type keeps its signing line", () => {
  const out: string = unsignRelease(gradle);
  const debug = out.slice(out.indexOf("debug {"), out.indexOf("release {"));
  expect(debug).toContain("signingConfig signingConfigs.debug");
});

test("gradle properties are replaced, not repeated", () => {
  const out = setProperties(
    [
      { type: "property", key: "org.gradle.jvmargs", value: "-Xmx512m" },
      { type: "property", key: "other", value: "1" },
    ],
    { "org.gradle.jvmargs": "-Xmx4g" },
  );
  expect(out.filter((p: any) => p.key === "org.gradle.jvmargs")).toEqual([
    { type: "property", key: "org.gradle.jvmargs", value: "-Xmx4g" },
  ]);
  expect(out.some((p: any) => p.key === "other")).toBe(true);
});

test("the F-Droid build gets room for Metaspace", () => {
  const { GRADLE_PROPERTIES } = require("../../plugins/withFdroid");
  expect(GRADLE_PROPERTIES["org.gradle.jvmargs"]).toContain("MaxMetaspaceSize");
  expect(GRADLE_PROPERTIES["kotlin.daemon.jvmargs"]).toContain(
    "MaxMetaspaceSize",
  );
});
