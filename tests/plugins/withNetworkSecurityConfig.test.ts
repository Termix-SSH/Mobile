import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../..");
const pluginFile = path.join(root, "plugins", "withNetworkSecurityConfig.js");
const { NETWORK_SECURITY_CONFIG: xml } = require(pluginFile);

test("app.json includes the network security plugin", () => {
  const appJson = JSON.parse(
    fs.readFileSync(path.join(root, "app.json"), "utf8"),
  );
  expect(appJson.expo.plugins).toContain(
    "./plugins/withNetworkSecurityConfig.js",
  );
});

test("the base config trusts system and user CAs", () => {
  expect(typeof xml).toBe("string");
  const base = xml.match(/<base-config[\s\S]*?<\/base-config>/)?.[0];
  expect(base).toContain('<certificates src="system" />');
  expect(base).toContain('<certificates src="user" />');
});

test("the local domain config keeps system and user CAs", () => {
  const domain = xml.match(/<domain-config[\s\S]*?<\/domain-config>/)?.[0];
  expect(domain).toContain('<certificates src="system" />');
  expect(domain).toContain('<certificates src="user" />');
});

test("the manifest points at the generated config", () => {
  const source = fs.readFileSync(pluginFile, "utf8");
  expect(source).toContain('"android:networkSecurityConfig"');
  expect(source).toContain('"@xml/network_security_config"');
});
