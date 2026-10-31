import {
  envOf,
  readHostTerminal,
  writeHostTerminal,
} from "@/features/terminal/HostTerminalTab";
import type { SSHHost, SSHHostData } from "@/types";

test("reads the host's terminal values and ssh options", () => {
  const values = readHostTerminal({
    terminalConfig: { theme: "nord" },
    sshOptions: { keepaliveInterval: 10 },
  } as unknown as SSHHost);
  expect(values).toEqual({
    terminalConfig: { theme: "nord" },
    sshOptions: { keepaliveInterval: 10 },
  });
  expect(readHostTerminal(null)).toEqual({
    terminalConfig: {},
    sshOptions: {},
  });
});

test("writes trimmed variables and drops empty ones and an unset keepalive", () => {
  const payload = {} as SSHHostData;
  writeHostTerminal(
    {
      terminalConfig: { autoTmux: true },
      sshOptions: {
        keepaliveInterval: undefined,
        allowLegacyAlgorithms: false,
        environmentVariables: [
          { key: " LANG ", value: "C" },
          { key: "  ", value: "x" },
        ],
      },
    },
    payload,
  );
  expect(payload.terminalConfig).toEqual({ autoTmux: true });
  expect(payload.sshOptions).toEqual({
    allowLegacyAlgorithms: false,
    environmentVariables: [{ key: "LANG", value: "C" }],
  });
});

test("envOf ignores anything that is not a list of pairs", () => {
  expect(envOf(undefined)).toEqual([]);
  expect(envOf({ environmentVariables: "x" })).toEqual([]);
  expect(envOf({ environmentVariables: [null, { key: 1, value: 2 }] })).toEqual(
    [{ key: "1", value: "2" }],
  );
});
