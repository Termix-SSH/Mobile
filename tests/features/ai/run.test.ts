import {
  applyEvent,
  finishRun,
  initialRun,
  type RunFinishReason,
} from "@/features/ai/run";

const proposal = {
  id: 9,
  conversationId: 4,
  kind: "create_host",
  summary: "Add the host",
  payload: '{"name":"build"}',
  status: "pending",
  resultSummary: null,
  createdAt: "2026-10-23T12:00:00Z",
};

const call = (name = "list_hosts") => ({
  type: "tool_call",
  name,
  arguments: { limit: 5 },
});

test("each run starts empty with independent collections", () => {
  const state = initialRun();
  expect(state).toEqual({
    conversationId: null,
    text: "",
    reasoning: "",
    tools: [],
    proposals: [],
    error: null,
    finished: false,
    finishReason: null,
  });
  const another = initialRun();
  expect(another).not.toBe(state);
  expect(another.tools).not.toBe(state.tools);
  expect(another.proposals).not.toBe(state.proposals);
});

test("conversation, answer, and reasoning frames accumulate independently", () => {
  let state = applyEvent(initialRun(), {
    type: "conversation",
    conversationId: 4,
  });
  for (const event of [
    { type: "reasoning", text: "Checking " },
    { type: "token", text: "Two " },
    { type: "reasoning", text: "hosts" },
    { type: "token", text: "hosts." },
  ]) {
    state = applyEvent(state, event);
  }
  expect(state).toMatchObject({
    conversationId: 4,
    text: "Two hosts.",
    reasoning: "Checking hosts",
    finished: false,
  });
});

test("malformed and unsupported frames leave the run unchanged", () => {
  const state = initialRun();
  for (const event of [
    null,
    undefined,
    [],
    1,
    "done",
    {},
    { type: "conversation", conversationId: "4" },
    { type: "conversation", conversationId: 0 },
    { type: "conversation", conversationId: -1 },
    { type: "conversation", conversationId: 1.5 },
    { type: "conversation", conversationId: Infinity },
    { type: "conversation", conversationId: NaN },
    { type: "token" },
    { type: "token", text: {} },
    { type: "reasoning", text: null },
    { type: "tool_call", name: 2, arguments: {} },
    { type: "tool_call", name: "list_hosts" },
    { type: "tool_call", name: "list_hosts", arguments: null },
    { type: "tool_call", name: "list_hosts", arguments: [] },
    { type: "tool_result", name: "list_hosts" },
    { type: "tool_result", name: 2, result: null },
    { type: "proposal", proposal: {} },
    { type: "proposal", draft: proposal },
    { type: "error", message: null },
    { type: "tool_progress", name: "list_hosts", host: {} },
    { type: "usage", usage: {} },
    { type: "compacted", summary: "Earlier messages", keep: 2 },
    { type: "message", message: { role: "assistant", content: "Saved" } },
    { type: "future_event" },
  ]) {
    expect(applyEvent(state, event)).toBe(state);
  }
});

test("tool IDs are deterministic and results match the newest pending name", () => {
  const start = initialRun();
  expect(applyEvent(start, call())).toEqual(applyEvent(start, call()));
  let state = applyEvent(start, call());
  state = applyEvent(state, call("other_tool"));
  state = applyEvent(state, call());
  expect(state.tools.map(({ id }) => id)).toEqual([
    "tool-0",
    "tool-1",
    "tool-2",
  ]);

  const beforeResults = state;
  state = applyEvent(state, {
    type: "tool_result",
    name: "list_hosts",
    result: null,
  });
  expect(state.tools[2]).toMatchObject({ result: null, done: true });
  expect(state.tools[0].done).toBe(false);
  state = applyEvent(state, {
    type: "tool_result",
    name: "list_hosts",
    result: ["host-1"],
  });
  expect(state.tools[0]).toMatchObject({ result: ["host-1"], done: true });
  expect(state.tools[2].result).toBeNull();
  expect(state.tools[1]).toBe(beforeResults.tools[1]);
  expect(beforeResults.tools.every(({ done }) => !done)).toBe(true);
  expect(
    applyEvent(state, { type: "tool_result", name: "missing", result: 1 }),
  ).toBe(state);
  expect(
    applyEvent(state, { type: "tool_result", name: "list_hosts", result: 1 }),
  ).toBe(state);
});

test("only validated stored proposals are appended", () => {
  const state = initialRun();
  const next = applyEvent(state, { type: "proposal", proposal });
  expect(next.proposals).toEqual([proposal]);
  expect(state.proposals).toEqual([]);
  expect(
    applyEvent(next, {
      type: "proposal",
      proposal: { ...proposal, id: "invalid" },
    }),
  ).toBe(next);
});

test.each<RunFinishReason>(["done", "cancelled", "background", "error"])(
  "finishing as %s preserves content and interrupts only unfinished tools",
  (reason) => {
    let state = applyEvent(initialRun(), call());
    state = applyEvent(state, {
      type: "tool_result",
      name: "list_hosts",
      result: null,
    });
    state = applyEvent(state, call());
    state = applyEvent(state, { type: "token", text: "Partial answer" });
    state = applyEvent(state, { type: "reasoning", text: "Working" });
    state = applyEvent(state, { type: "proposal", proposal });
    const finished = finishRun(state, reason);

    expect(finished).toMatchObject({
      text: "Partial answer",
      reasoning: "Working",
      proposals: [proposal],
      finished: true,
      finishReason: reason,
    });
    expect(finished.tools[0]).toBe(state.tools[0]);
    expect(finished.tools[0].interrupted).toBeUndefined();
    expect(finished.tools[1]).toMatchObject({ done: true, interrupted: true });
    expect(state.tools[1].done).toBe(false);
    expect(finishRun(finished, "done")).toBe(finished);
    expect(applyEvent(finished, { type: "done" })).toBe(finished);
    expect(applyEvent(finished, { type: "token", text: "late" })).toBe(
      finished,
    );
    expect(applyEvent(finished, { type: "error", message: "late" })).toBe(
      finished,
    );
  },
);

test("an error terminates a partial run and a following done cannot erase it", () => {
  let state = applyEvent(initialRun(), { type: "token", text: "Partial" });
  state = applyEvent(state, call());
  const failed = applyEvent(state, {
    type: "error",
    message: "Provider unavailable",
  });
  expect(failed).toMatchObject({
    text: "Partial",
    error: "Provider unavailable",
    finished: true,
    finishReason: "error",
    tools: [{ done: true, interrupted: true }],
  });
  for (const event of [
    { type: "done" },
    { type: "error", message: "Another error" },
    { type: "conversation", conversationId: 99 },
    { type: "reasoning", text: "late" },
    call(),
    { type: "tool_result", name: "list_hosts", result: "late" },
    { type: "proposal", proposal },
  ]) {
    expect(applyEvent(failed, event)).toBe(failed);
  }
});

test("done frames finish a run once", () => {
  const state = applyEvent(initialRun(), call());
  const done = applyEvent(state, { type: "done" });
  expect(done.finishReason).toBe("done");
  expect(done.tools[0]).toMatchObject({ done: true, interrupted: true });
  expect(applyEvent(done, { type: "done" })).toBe(done);
});

test("reducers accept frozen state and frames without changing either", () => {
  const event = Object.freeze({
    ...call(),
    arguments: Object.freeze({ limit: 5 }),
  });
  const empty = initialRun();
  Object.freeze(empty.tools);
  Object.freeze(empty.proposals);
  Object.freeze(empty);
  const called = applyEvent(empty, event);
  Object.freeze(called.tools[0]);
  Object.freeze(called.tools);
  Object.freeze(called);

  const result = Object.freeze({
    type: "tool_result",
    name: "list_hosts",
    result: Object.freeze(["host-1"]),
  });
  const completed = applyEvent(called, result);
  expect(completed.tools[0]).toMatchObject({ result: ["host-1"], done: true });
  expect(called.tools[0]).toEqual({
    id: "tool-0",
    name: "list_hosts",
    arguments: { limit: 5 },
    done: false,
  });
  expect(finishRun(called, "cancelled").tools[0].interrupted).toBe(true);
  expect(empty).toEqual(initialRun());
  expect(event).toEqual(call());
});
