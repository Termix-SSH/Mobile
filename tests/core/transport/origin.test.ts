import {
  checkNeeds,
  planConnection,
  readOrigin,
  type ConnectionOrigin,
  type OriginInputs,
} from "@/core/transport/origin";
import type { Transport } from "@/core/transport/types";

function transport(
  kind: Transport["kind"],
  available = true,
  reason = `${kind} is off`,
): Transport {
  return {
    kind,
    provides:
      kind === "local"
        ? ["shell", "exec", "sftp"]
        : ["shell", "server", "guacd"],
    available,
    unavailableReason: available ? undefined : reason,
    openShell: jest.fn(),
  };
}

const kinds = (inputs: OriginInputs, origin: ConnectionOrigin) =>
  planConnection(origin, inputs).attempts.map((t) => t.kind);

test("readOrigin takes the host value, then the phone copy, then automatic", () => {
  expect(readOrigin("server", "device")).toBe("server");
  expect(readOrigin(undefined, "device")).toBe("device");
  expect(readOrigin("bogus", null)).toBe("auto");
  expect(readOrigin(undefined)).toBe("auto");
});

describe("This device", () => {
  test("always connects from the phone, whatever the origin says", () => {
    const inputs: OriginInputs = {
      accountKind: "local",
      local: transport("local"),
      relay: null,
      isSsh: true,
    };
    for (const o of ["auto", "device", "server"] as const) {
      expect(kinds(inputs, o)).toEqual(["local"]);
    }
  });

  test("says why when the phone can't, with nothing to switch to", () => {
    const plan = planConnection("auto", {
      accountKind: "local",
      local: transport("local", false, "no engine"),
      relay: null,
      isSsh: true,
    });
    expect(plan.attempts).toEqual([]);
    expect(plan.blocked).toEqual({ reason: "no engine" });
  });
});

describe("a linked server", () => {
  const inputs = (local = true, relay = true, isSsh = true): OriginInputs => ({
    accountKind: "server",
    local: transport("local", local, "not synced"),
    relay: transport("relay", relay, "signed out"),
    isSsh,
  });

  test("automatic tries the phone first, then the server", () => {
    expect(kinds(inputs(), "auto")).toEqual(["local", "relay"]);
    expect(kinds(inputs(false), "auto")).toEqual(["relay"]);
    expect(kinds(inputs(true, false), "auto")).toEqual(["local"]);
  });

  test("a fixed origin uses only that way", () => {
    expect(kinds(inputs(), "device")).toEqual(["local"]);
    expect(kinds(inputs(), "server")).toEqual(["relay"]);
  });

  test("a blocked origin names the reason and the way that works", () => {
    expect(planConnection("device", inputs(false)).blocked).toEqual({
      reason: "not synced",
      fix: "server",
    });
    expect(planConnection("server", inputs(true, false)).blocked).toEqual({
      reason: "signed out",
      fix: "device",
    });
    expect(planConnection("auto", inputs(false, false)).blocked).toEqual({
      reason: "signed out",
    });
  });

  test("non-SSH hosts never use the phone", () => {
    expect(kinds(inputs(true, true, false), "auto")).toEqual(["relay"]);
    expect(planConnection("device", inputs(true, true, false)).blocked).toEqual(
      {
        reason: "The phone only connects to SSH and Telnet hosts.",
        fix: "server",
      },
    );
  });
});

describe("checkNeeds", () => {
  const server: OriginInputs = {
    accountKind: "server",
    local: transport("local"),
    relay: transport("relay"),
    isSsh: true,
  };
  const planFor = (o: ConnectionOrigin) => planConnection(o, server);

  test("keeps only the ways that can do the job", () => {
    const r = checkNeeds(["server"], planFor("auto"), "Files", planFor);
    expect(r.attempts.map((t) => t.kind)).toEqual(["relay"]);
    expect(r.blocked).toBeUndefined();
  });

  test("a server feature on a phone host says how to fix it", () => {
    const r = checkNeeds(
      ["server"],
      planFor("device"),
      "File Manager",
      planFor,
    );
    expect(r.attempts).toEqual([]);
    expect(r.blocked).toEqual({
      reason:
        "File Manager needs a Termix server. Connect this host through the server to use it.",
      fix: "server",
    });
  });

  test("on This device there is nothing to switch to", () => {
    const local: OriginInputs = {
      accountKind: "local",
      local: transport("local"),
      relay: null,
      isSsh: true,
    };
    const lp = (o: ConnectionOrigin) => planConnection(o, local);
    const r = checkNeeds(["guacd"], lp("auto"), "Remote Desktop", lp);
    expect(r.blocked).toEqual({
      reason:
        "Remote Desktop needs a Termix server, which this host can't use right now.",
      fix: undefined,
    });
  });

  test("a plan blocked outright keeps its own reason", () => {
    const blocked = planConnection("server", {
      ...server,
      relay: transport("relay", false, "signed out"),
    });
    expect(checkNeeds(["shell"], blocked, "Terminal", planFor).blocked).toEqual(
      { reason: "signed out", fix: "device" },
    );
  });

  test("any one list of needs will do", () => {
    const needs = [["sftp"], ["server"]] as const;
    const groups = needs.map((g) => [...g]);
    expect(
      checkNeeds(groups, planFor("auto"), "Files", planFor).attempts.map(
        (t) => t.kind,
      ),
    ).toEqual(["local", "relay"]);
    expect(
      checkNeeds(groups, planFor("server"), "Files", planFor).attempts.map(
        (t) => t.kind,
      ),
    ).toEqual(["relay"]);
  });

  test("with the server side off, relay drops out and the phone is the fix", () => {
    const r = checkNeeds(
      [["sftp"], ["server"]],
      planFor("server"),
      "File Manager",
      planFor,
      { relayOk: false },
    );
    expect(r.attempts).toEqual([]);
    expect(r.blocked).toEqual({
      reason:
        "File Manager is off on this server. Connect this host from the phone to use it.",
      fix: "device",
    });
    const auto = checkNeeds(
      [["sftp"], ["server"]],
      planFor("auto"),
      "File Manager",
      planFor,
      { relayOk: false },
    );
    expect(auto.attempts.map((t) => t.kind)).toEqual(["local"]);
  });

  test("no needs fits anything", () => {
    expect(checkNeeds([], planFor("auto"), "X", planFor).attempts).toHaveLength(
      2,
    );
  });
});
