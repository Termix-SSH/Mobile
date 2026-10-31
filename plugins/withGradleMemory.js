const { withGradleProperties } = require("@expo/config-plugins");
const { setProperties } = require("./withFdroid");

// R8 and dex merging run out of the default 2 GB heap on release builds.
const MEMORY = {
  "org.gradle.jvmargs":
    "-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError",
};

const withGradleMemory = (config) =>
  withGradleProperties(config, (c) => {
    c.modResults = setProperties(c.modResults, MEMORY);
    return c;
  });

module.exports = withGradleMemory;
module.exports.MEMORY = MEMORY;
