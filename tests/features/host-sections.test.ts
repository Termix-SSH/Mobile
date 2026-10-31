import { protocolSection } from "@/features/remote-desktop/host-sections";
import { hostTunnelsEditor } from "@/features/tunnels/HostTunnelsSection";
import { macError, wakeHostSection } from "@/features/wake-on-lan/host-section";
import { filesHostSection } from "@/features/file-manager/host-section";
import type { SSHHost, SSHHostData } from "@/types";

const payload = () =>
  ({ ip: "h", port: 22, username: "u", authType: "password" }) as SSHHostData;

test("RDP values round trip and a bad port is refused", () => {
  const { editor } = protocolSection("rdp");
  const value = editor.read({
    rdpUser: "admin",
    rdpPassword: "pw",
    rdpDomain: "CORP",
    rdpPort: 3390,
  } as SSHHost);
  expect(value).toEqual({
    user: "admin",
    password: "pw",
    domain: "CORP",
    port: "3390",
  });
  const out = payload();
  editor.write(value, out);
  expect(out).toMatchObject({
    rdpUser: "admin",
    rdpPassword: "pw",
    rdpDomain: "CORP",
    rdpPort: 3390,
  });
  expect(editor.validate?.({ ...value, port: "99999" })).toMatch(/1 to 65535/);
  expect(protocolSection("rdp").editor.read(null).user).toBe("Administrator");
});

test("VNC and Telnet keep their own fields", () => {
  const out = payload();
  protocolSection("vnc").editor.write(
    { user: "", password: "v", domain: "", port: "" },
    out,
  );
  protocolSection("telnet").editor.write(
    { user: "t", password: "", domain: "", port: "2323" },
    out,
  );
  expect(out).toMatchObject({
    vncPassword: "v",
    vncPort: 5900,
    telnetUser: "t",
    telnetPort: 2323,
  });
});

test("tunnels need real ports, dynamic ones need no endpoint port", () => {
  const ok = {
    tunnels: [{ mode: "dynamic", sourcePort: 1080, endpointPort: 0 }],
  };
  expect(hostTunnelsEditor.validate?.(ok)).toBeNull();
  const bad = {
    tunnels: [{ mode: "local", sourcePort: 8080, endpointPort: 0 }],
  };
  expect(hostTunnelsEditor.validate?.(bad)).toMatch(/Tunnel 1/);
  const out = payload();
  hostTunnelsEditor.write(ok, out);
  expect(out.tunnelConnections).toEqual(ok.tunnels);
});

test("a MAC address must look like one", () => {
  expect(macError("")).toBeNull();
  expect(macError("00:1a:2b:3c:4d:5e")).toBeNull();
  expect(macError("00-1A-2B-3C-4D-5E")).toBeNull();
  expect(macError("nope")).toMatch(/MAC/);
  const out = payload();
  wakeHostSection.editor.write({ macAddress: " 00:1a:2b:3c:4d:5e " }, out);
  expect(out.macAddress).toBe("00:1a:2b:3c:4d:5e");
});

test("the file manager start folder falls back to /", () => {
  const out = payload();
  filesHostSection.editor.write({ defaultPath: "  " }, out);
  expect(out.defaultPath).toBe("/");
  expect(filesHostSection.editor.read(null)).toEqual({ defaultPath: "/" });
});
