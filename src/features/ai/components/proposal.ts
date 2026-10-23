import type { AiProposal } from "../types";

export interface ProposalDescription {
  title: string;
  summary: string;
  command?: string;
  hosts: string[];
  explanation?: string;
  reason?: string;
  destructive: boolean;
  invalid: boolean;
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
