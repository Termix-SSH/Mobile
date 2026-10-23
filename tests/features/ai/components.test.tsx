import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MONO_FONT } from "@/constants/fonts";
import { MessageBubble } from "@/features/ai/components/MessageBubble";
import { ProposalCard } from "@/features/ai/components/ProposalCard";
import { RunView } from "@/features/ai/components/RunView";
import { initialRun, type RunState } from "@/features/ai/run";
import type { AiProposal } from "@/features/ai/types";
import type { ConfirmOptions } from "@/ui/Confirm";

const mockConfirm = jest.fn<Promise<boolean>, [ConfirmOptions]>();
jest.mock("@/ui/Confirm", () => ({ useConfirm: () => mockConfirm }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#999999",
}));
jest.mock("@/utils/toast", () => ({ toast: { error: jest.fn() } }));

const command = '  printf "**literal**"\n\tuname -a  \n';
const proposal: AiProposal = {
  id: 11,
  conversationId: 2,
  kind: "run_command",
  summary: "Inspect the host",
  payload: JSON.stringify({
    hostId: 7,
    command,
    explanation: "Read system information",
    reason: "Troubleshooting",
  }),
  status: "pending",
  resultSummary: null,
  createdAt: "",
};
const hostName = (id: number) => (id === 7 ? "Production" : undefined);

beforeEach(() => {
  mockConfirm.mockReset().mockResolvedValue(false);
});

test("Apply waits for confirmation and passes only the proposal ID", async () => {
  let settle!: (confirmed: boolean) => void;
  mockConfirm.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      settle = resolve;
    }),
  );
  const onApply = jest.fn();
  const result = await render(
    <ProposalCard
      proposal={proposal}
      hostName={hostName}
      onApply={onApply}
      onReject={jest.fn()}
      busy={false}
    />,
  );
  const commandNode = result.getByText(command, { normalizer: (text) => text });
  expect(commandNode.props.selectable).toBe(true);
  expect(StyleSheet.flatten(commandNode.props.style).fontFamily).toBe(
    MONO_FONT,
  );
  expect(result.getByText("Hosts: Production")).toBeTruthy();
  expect(result.getByText("Read system information")).toBeTruthy();
  expect(result.getByText("Troubleshooting")).toBeTruthy();
  expect(mockConfirm).not.toHaveBeenCalled();
  await fireEvent.press(result.getByRole("button", { name: "Apply" }));
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Run this command on Production?",
      confirmLabel: "Apply",
      destructive: false,
      description: expect.objectContaining({
        props: expect.objectContaining({
          style: { maxHeight: 240 },
          children: expect.objectContaining({
            props: expect.objectContaining({
              selectable: true,
              children: command,
            }),
          }),
        }),
      }),
    }),
  );
  expect(onApply).not.toHaveBeenCalled();
  await act(async () => settle(true));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(11);
});

test("declining confirmation never applies; Reject calls its callback directly", async () => {
  const onApply = jest.fn();
  const onReject = jest.fn();
  const result = await render(
    <ProposalCard
      proposal={proposal}
      hostName={hostName}
      onApply={onApply}
      onReject={onReject}
    />,
  );
  await fireEvent.press(result.getByText("Apply"));
  expect(onApply).not.toHaveBeenCalled();
  await fireEvent.press(result.getByText("Reject"));
  expect(onReject).toHaveBeenCalledWith(11);
  expect(mockConfirm).toHaveBeenCalledTimes(1);
});

test("deletions use destructive confirmation and include all target hosts", async () => {
  const result = await render(
    <ProposalCard
      proposal={{
        ...proposal,
        kind: "bulk_delete_hosts",
        payload: JSON.stringify({ hostIds: [7, 8], command }),
      }}
      hostName={hostName}
      onApply={jest.fn()}
      onReject={jest.fn()}
    />,
  );
  await fireEvent.press(result.getByText("Apply"));
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Run this command on Production, Host #8?",
      destructive: true,
    }),
  );
});

test("create_host shows the complete payload in the card and Apply confirmation", async () => {
  const payload = {
    name: "New server",
    ip: "10.0.0.8",
    port: 2222,
    username: "root",
    tags: ["prod", "eu"],
    options: { enabled: false, note: null },
  };
  const json = JSON.stringify(payload, null, 2);
  const result = await render(
    <ProposalCard
      proposal={{
        ...proposal,
        kind: "create_host",
        payload: JSON.stringify(payload),
      }}
      hostName={hostName}
      onApply={jest.fn()}
      onReject={jest.fn()}
    />,
  );
  expect(
    result.getByText(json, { normalizer: (text) => text }).props.selectable,
  ).toBe(true);
  await fireEvent.press(result.getByRole("button", { name: "Apply" }));
  const options = mockConfirm.mock.calls[0][0];
  expect(options.title).toBe("Apply Create host?");
  const confirmation = await render(<>{options.description}</>);
  expect(
    confirmation.getByText(json, { normalizer: (text) => text }).props
      .selectable,
  ).toBe(true);
  expect(
    confirmation.getByTestId("proposal-confirm-scroll").props.style,
  ).toEqual({
    maxHeight: 240,
  });
});

test("command text reveals bidi characters and wraps in the card and confirmation", async () => {
  const escaped = "echo safe\\u202Ehidden\\u200B";
  const result = await render(
    <ProposalCard
      proposal={{
        ...proposal,
        payload: JSON.stringify({
          hostId: 7,
          command: "echo safe\u202Ehidden\u200B",
        }),
      }}
      hostName={hostName}
      onApply={jest.fn()}
      onReject={jest.fn()}
    />,
  );
  expect(result.getByText(escaped)).toBeTruthy();
  expect(JSON.stringify(result.toJSON())).not.toContain('"horizontal":true');
  await fireEvent.press(result.getByRole("button", { name: "Apply" }));
  const confirmation = await render(
    <>{mockConfirm.mock.calls[0][0].description}</>,
  );
  expect(confirmation.getByText(escaped)).toBeTruthy();
  const description = confirmation.getByTestId("proposal-confirm-scroll");
  expect(description.props.horizontal).not.toBe(true);
  expect(description.props.style).toEqual({ maxHeight: 240 });
});

test.each(["", "   ", "\n\t "])(
  "an empty command %j is labelled and cannot be applied",
  async (command) => {
    const onApply = jest.fn();
    const result = await render(
      <ProposalCard
        proposal={{
          ...proposal,
          payload: JSON.stringify({ command, hostId: 7 }),
        }}
        hostName={hostName}
        onApply={onApply}
        onReject={jest.fn()}
      />,
    );
    expect(result.getByText("(empty command)")).toBeTruthy();
    const apply = result.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    await fireEvent.press(apply);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(result.getByRole("button", { name: "Reject" })).not.toBeDisabled();
  },
);

test("a command without a valid host ID disables Apply", async () => {
  const onApply = jest.fn();
  const result = await render(
    <ProposalCard
      proposal={{
        ...proposal,
        payload: JSON.stringify({
          command,
          hostId: 0,
          hostIds: [-1, "7", 1.5, null],
        }),
      }}
      hostName={hostName}
      onApply={onApply}
      onReject={jest.fn()}
    />,
  );
  const apply = result.getByRole("button", { name: "Apply" });
  expect(apply).toBeDisabled();
  await fireEvent.press(apply);
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
  expect(result.getByRole("button", { name: "Reject" })).not.toBeDisabled();
});

test.each(["applied", "failed", "rejected", "expired"] as const)(
  "%s proposals show their result and have no action buttons",
  async (status) => {
    const result = await render(
      <ProposalCard
        proposal={{ ...proposal, status, resultSummary: "Server result" }}
        hostName={hostName}
        onApply={jest.fn()}
        onReject={jest.fn()}
      />,
    );
    expect(
      result.getByText(status[0].toUpperCase() + status.slice(1)),
    ).toBeTruthy();
    expect(result.getByText("Server result")).toBeTruthy();
    expect(result.queryAllByRole("button")).toHaveLength(0);
  },
);

test("busy proposals disable both actions", async () => {
  const onApply = jest.fn();
  const onReject = jest.fn();
  const result = await render(
    <ProposalCard
      proposal={proposal}
      hostName={hostName}
      onApply={onApply}
      onReject={onReject}
      busy
    />,
  );
  for (const name of ["Apply", "Reject"]) {
    const button = result.getByRole("button", { name });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
  }
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
  expect(onReject).not.toHaveBeenCalled();
});

test("malformed proposals cannot be applied but can be rejected", async () => {
  const onReject = jest.fn();
  const result = await render(
    <ProposalCard
      proposal={{ ...proposal, payload: "{" }}
      hostName={hostName}
      onApply={jest.fn()}
      onReject={onReject}
    />,
  );
  expect(result.getByRole("alert")).toHaveTextContent(
    "Invalid proposal payload",
  );
  await fireEvent.press(result.getByText("Apply"));
  expect(mockConfirm).not.toHaveBeenCalled();
  await fireEvent.press(result.getByText("Reject"));
  expect(onReject).toHaveBeenCalledWith(11);
});

test("Thinking starts collapsed and expands to muted markdown", async () => {
  const result = await render(
    <RunView
      run={{
        ...initialRun(),
        reasoning: "**Private reasoning**",
        text: "**Reply**",
      }}
      canResend={false}
      onResend={jest.fn()}
    />,
  );
  expect(result.queryByText("Private reasoning")).toBeNull();
  expect(result.getByText("Reply")).toBeTruthy();
  expect(result.getByText("Streaming")).toBeTruthy();
  await fireEvent.press(result.getByText("Thinking"));
  expect(result.getByText("Private reasoning").props.className).toContain(
    "text-muted-foreground",
  );
  await fireEvent.press(result.getByText("Thinking"));
  expect(result.queryByText("Private reasoning")).toBeNull();
});

test("tool rows show progress and keep arguments and results collapsed", async () => {
  const run: RunState = {
    ...initialRun(),
    tools: [
      { id: "a", name: "inspect_host", arguments: { hostId: 7 }, done: false },
      {
        id: "b",
        name: "list_hosts",
        arguments: {},
        result: "Tool output",
        done: true,
      },
      {
        id: "c",
        name: "read_logs",
        arguments: {},
        done: true,
        interrupted: true,
      },
    ],
  };
  const result = await render(
    <RunView run={run} canResend={false} onResend={jest.fn()} />,
  );
  for (const name of [
    "inspect_host",
    "list_hosts",
    "read_logs",
    "done",
    "interrupted",
  ]) {
    expect(result.getByText(name)).toBeTruthy();
  }
  expect(result.getByLabelText("inspect_host running")).toBeTruthy();
  expect(result.queryByText(/hostId/)).toBeNull();
  expect(result.queryByText("Tool output")).toBeNull();
  await fireEvent.press(result.getAllByText("Arguments and result")[0]);
  expect(result.getByText(/hostId/).props.selectable).toBe(true);
  await fireEvent.press(result.getAllByText("Arguments and result")[1]);
  expect(result.getByText("Tool output").props.selectable).toBe(true);
});

test("background interruptions show Send again and call onResend", async () => {
  const onResend = jest.fn();
  const result = await render(
    <RunView
      run={{
        ...initialRun(),
        finished: true,
        finishReason: "background",
        text: "Partial reply",
      }}
      canResend
      onResend={onResend}
    />,
  );
  expect(
    result.getByText("Interrupted when the app went to the background"),
  ).toBeTruthy();
  expect(result.getByText("Partial reply")).toBeTruthy();
  expect(result.queryByText("Streaming")).toBeNull();
  await fireEvent.press(result.getByRole("button", { name: "Send again" }));
  expect(onResend).toHaveBeenCalledTimes(1);
});

test("stopped and failed runs show their footer without a resend action when unavailable", async () => {
  const result = await render(
    <RunView
      run={{
        ...initialRun(),
        finished: true,
        finishReason: "cancelled",
        error: "Request failed",
      }}
      canResend={false}
      onResend={jest.fn()}
    />,
  );
  expect(result.getByText("Stopped")).toBeTruthy();
  expect(result.getByRole("alert")).toHaveTextContent("Request failed");
  expect(result.queryByText("Send again")).toBeNull();
});

test("user messages keep markdown syntax literal and selectable", async () => {
  const result = await render(
    <MessageBubble
      message={{ role: "user", content: "**x**", reasoning: "Hidden" }}
    />,
  );
  expect(result.getByText("**x**").props.selectable).toBe(true);
  expect(result.queryByText("x")).toBeNull();
  expect(result.queryByText("Thinking")).toBeNull();
  expect(result.getByText("**x**").parent?.props.className).toContain(
    "self-end",
  );
});

test("assistant messages render markdown with optional collapsed reasoning", async () => {
  const result = await render(
    <MessageBubble
      message={{
        role: "assistant",
        content: "**Answer**",
        reasoning: "**Consideration**",
      }}
    />,
  );
  expect(result.getByText("Answer")).toBeTruthy();
  expect(result.queryByText("Consideration")).toBeNull();
  await fireEvent.press(result.getByText("Thinking"));
  expect(result.getByText("Consideration")).toBeTruthy();
});
