import { parseProposal, type AiProposal } from "@/features/ai/types";

export type RunFinishReason = "done" | "cancelled" | "background" | "error";

export interface RunToolActivity {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  done: boolean;
  interrupted?: boolean;
}

export interface RunState {
  conversationId: number | null;
  text: string;
  reasoning: string;
  tools: RunToolActivity[];
  proposals: AiProposal[];
  error: string | null;
  finished: boolean;
  finishReason: RunFinishReason | null;
}

export function initialRun(): RunState {
  return {
    conversationId: null,
    text: "",
    reasoning: "",
    tools: [],
    proposals: [],
    error: null,
    finished: false,
    finishReason: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first terminal event owns the outcome, including any unfinished tools. */
export function finishRun(state: RunState, reason: RunFinishReason): RunState {
  if (state.finished) return state;
  return {
    ...state,
    tools: state.tools.map((tool) =>
      tool.done ? tool : { ...tool, done: true, interrupted: true },
    ),
    finished: true,
    finishReason: reason,
  };
}

/** Fold a Plugin-AI stream frame into a run without mutating prior state. */
export function applyEvent(state: RunState, event: unknown): RunState {
  if (state.finished || !isRecord(event)) return state;

  switch (event.type) {
    case "conversation":
      return typeof event.conversationId === "number" &&
        Number.isSafeInteger(event.conversationId) &&
        event.conversationId > 0
        ? { ...state, conversationId: event.conversationId }
        : state;
    case "token":
      return typeof event.text === "string"
        ? { ...state, text: state.text + event.text }
        : state;
    case "reasoning":
      return typeof event.text === "string"
        ? { ...state, reasoning: state.reasoning + event.text }
        : state;
    case "tool_call":
      if (typeof event.name !== "string" || !isRecord(event.arguments)) {
        return state;
      }
      return {
        ...state,
        tools: [
          ...state.tools,
          {
            id: `tool-${state.tools.length}`,
            name: event.name,
            arguments: { ...event.arguments },
            done: false,
          },
        ],
      };
    case "tool_result": {
      if (
        typeof event.name !== "string" ||
        !Object.prototype.hasOwnProperty.call(event, "result")
      ) {
        return state;
      }
      for (let index = state.tools.length - 1; index >= 0; index -= 1) {
        const tool = state.tools[index];
        if (tool.name === event.name && !("result" in tool)) {
          const tools = [...state.tools];
          tools[index] = { ...tool, result: event.result, done: true };
          return { ...state, tools };
        }
      }
      return state;
    }
    case "proposal": {
      const proposal = parseProposal(event.proposal);
      return proposal
        ? { ...state, proposals: [...state.proposals, proposal] }
        : state;
    }
    case "error":
      return typeof event.message === "string"
        ? finishRun({ ...state, error: event.message }, "error")
        : state;
    case "done":
      return finishRun(state, "done");
    default:
      return state;
  }
}
