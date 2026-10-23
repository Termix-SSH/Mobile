import type { AiProposal } from "../types";

export interface ProposalDescription {
  title: string;
  summary: string;
  command?: string;
  payload?: string;
  hosts: string[];
  explanation?: string;
  reason?: string;
  destructive: boolean;
  invalid: boolean;
}

/** Make hidden formatting and control characters visible in untrusted text. */
export function revealInvisible(text: string): string {
  return text.replace(
    /[\u0000-\u0008\u000B-\u001F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
}

/** Describe untrusted payloads without ever rewriting the stored command. */
export function describeProposal(
  proposal: AiProposal,
  hostName: (id: number) => string | undefined,
): ProposalDescription {
  const words = proposal.kind
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  const title = words ? words[0].toUpperCase() + words.slice(1) : "Proposal";
  const description: ProposalDescription = {
    title,
    summary: proposal.summary ?? "",
    hosts: [],
    destructive: proposal.kind.toLowerCase().includes("delete"),
    invalid: false,
  };

  let payload: unknown;
  try {
    payload = JSON.parse(proposal.payload);
  } catch {
    return { ...description, invalid: true };
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return { ...description, invalid: true };
  }
  const data = payload as Record<string, unknown>;
  if (typeof data.command === "string") description.command = data.command;
  else description.payload = JSON.stringify(payload, null, 2);
  if (typeof data.explanation === "string") {
    description.explanation = data.explanation;
  }
  if (typeof data.reason === "string") description.reason = data.reason;

  const ids = [
    data.hostId,
    ...(Array.isArray(data.hostIds) ? data.hostIds : []),
  ];
  const validIds = ids.filter(
    (id): id is number =>
      typeof id === "number" && Number.isSafeInteger(id) && id > 0,
  );
  description.hosts = [...new Set(validIds)].map(
    (id) => hostName(id) || `Host #${id}`,
  );
  return description;
}
