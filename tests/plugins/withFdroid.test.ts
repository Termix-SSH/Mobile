const { unsignRelease } = require("../../plugins/withFdroid");

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
