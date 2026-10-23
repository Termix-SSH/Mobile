import { describeProposal } from "@/features/ai/components/proposal";
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
