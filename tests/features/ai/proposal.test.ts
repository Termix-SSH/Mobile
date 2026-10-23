import {
  describeProposal,
  revealInvisible,
} from "@/features/ai/components/proposal";
import type { AiProposal } from "@/features/ai/types";

const proposal: AiProposal = {
  id: 1,
  conversationId: 2,
  kind: "run_command",
  summary: "Check a host",
  payload: "{}",
  status: "pending",
  resultSummary: null,
  createdAt: "",
};
const hostName = (id: number) => (id === 7 ? "Production" : undefined);

test("reveals invisible and bidi characters while preserving tabs and newlines", () => {
  const codes = [
    ...Array.from({ length: 32 }, (_, index) => index).filter(
      (code) => code !== 9 && code !== 10,
    ),
    ...Array.from({ length: 5 }, (_, index) => 0x200b + index),
    ...Array.from({ length: 5 }, (_, index) => 0x202a + index),
    ...Array.from({ length: 10 }, (_, index) => 0x2060 + index),
    ...Array.from({ length: 33 }, (_, index) => 0x007f + index),
    0x00ad,
    0x061c,
    0x115f,
    0x1160,
    0x180e,
    ...Array.from({ length: 6 }, (_, index) => 0x206a + index),
    0x3164,
    ...Array.from({ length: 16 }, (_, index) => 0xfe00 + index),
    0xffa0,
    ...Array.from({ length: 3 }, (_, index) => 0xfff9 + index),
    ...Array.from({ length: 128 }, (_, index) => 0xe0000 + index),
    0xfeff,
  ];
  for (const code of codes) {
    const hex = code.toString(16).toUpperCase();
    expect(revealInvisible(`a${String.fromCodePoint(code)}b`)).toBe(
      code > 0xffff ? `a\\u{${hex}}b` : `a\\u${hex.padStart(4, "0")}b`,
    );
  }
  expect(revealInvisible("  printf 'hello'\n\t🙂  ")).toBe(
    "  printf 'hello'\n\t🙂  ",
  );
});

test("non-command proposals preserve every payload key and value as pretty JSON", () => {
  const payload = {
    name: "Production",
    ip: "10.0.0.7",
    port: 2222,
    enabled: false,
    tags: ["prod", null],
    options: { username: "root" },
  };
  expect(
    describeProposal(
      { ...proposal, kind: "create_host", payload: JSON.stringify(payload) },
      hostName,
    ).payload,
  ).toBe(JSON.stringify(payload, null, 2));
});

test("preserves the command exactly, resolves a host and reads explanations", () => {
  const command = '  printf "**literal**"\n\tuname -a  \n';
  const detail = describeProposal(
    {
      ...proposal,
      payload: JSON.stringify({
        command,
        hostId: 7,
        explanation: "Read the system information",
        reason: "Diagnose the host",
      }),
    },
    hostName,
  );
  expect(detail).toEqual({
    title: "Run command",
    summary: "Check a host",
    command,
    hosts: ["Production"],
    explanation: "Read the system information",
    reason: "Diagnose the host",
    destructive: false,
    invalid: false,
  });
});

test("maps hostIds, falls back to IDs and ignores invalid or duplicate IDs", () => {
  expect(
    describeProposal(
      {
        ...proposal,
        payload: JSON.stringify({
          hostId: 7,
          hostIds: [7, 8, "9", null, {}, -1, 0, 1.5],
        }),
      },
      hostName,
    ).hosts,
  ).toEqual(["Production", "Host #8"]);
});

test.each(["{broken", "", "null", "[]", '"text"', "42"])(
  "handles invalid or non-object payload %s defensively",
  (payload) => {
    const detail = describeProposal({ ...proposal, payload }, hostName);
    expect(detail).toMatchObject({
      invalid: true,
      hosts: [],
    });
    expect(detail.command).toBeUndefined();
  },
);

test("ignores unexpected field types without coercion", () => {
  const detail = describeProposal(
    {
      ...proposal,
      summary: null,
      payload: JSON.stringify({
        command: 42,
        hostIds: {},
        explanation: [],
        reason: false,
      }),
    },
    hostName,
  );
  expect(detail).toMatchObject({ summary: "", hosts: [], invalid: false });
  expect(detail.command).toBeUndefined();
  expect(detail.explanation).toBeUndefined();
  expect(detail.reason).toBeUndefined();
});

test.each(["delete_host", "bulk_delete_snippets", "DeleteHost"])(
  "marks %s as destructive even if its payload is invalid",
  (kind) => {
    expect(
      describeProposal({ ...proposal, kind, payload: "{" }, hostName)
        .destructive,
    ).toBe(true);
  },
);

test.each([
  ["run_command", "Run command"],
  ["create-snippet", "Create snippet"],
  ["updateHost", "Update host"],
])("humanizes %s", (kind, title) => {
  expect(describeProposal({ ...proposal, kind }, hostName).title).toBe(title);
});
