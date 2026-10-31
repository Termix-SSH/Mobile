export type TransferKind = "download" | "upload";

export type TransferState =
  "queued" | "running" | "paused" | "done" | "failed" | "cancelled";

export interface Transfer {
  id: string;
  kind: TransferKind;
  name: string;
  /** Download: the remote file. Upload: the remote folder. */
  remotePath: string;
  /** Plain path on the phone (no file://). */
  localPath: string;
  /** Bytes in all, -1 while unknown. */
  total: number;
  done: number;
  state: TransferState;
  error?: string;
  /** Files from one folder share a group so the panel can show them together. */
  group?: string;
  /** Folders under the downloaded folder, to keep its layout when saved elsewhere. */
  relative?: string[];
  /** Set once the try started, so a later start resumes instead of starting over. */
  started?: boolean;
}

export type TransferAction =
  | { type: "add"; transfers: Transfer[] }
  | { type: "start"; id: string }
  | { type: "progress"; id: string; done: number; total: number }
  | { type: "pause"; id: string }
  | { type: "resume"; id: string }
  | { type: "cancel"; id: string }
  | { type: "finish"; id: string }
  | { type: "fail"; id: string; error: string }
  | { type: "retry"; id: string }
  | { type: "clear" };

const ACTIVE: TransferState[] = ["queued", "running", "paused"];

export function isActive(t: Transfer): boolean {
  return ACTIVE.includes(t.state);
}

export function reduceTransfers(
  list: Transfer[],
  action: TransferAction,
): Transfer[] {
  const update = (id: string, fn: (t: Transfer) => Transfer | null) =>
    list.map((t) => (t.id === id ? (fn(t) ?? t) : t));
  switch (action.type) {
    case "add":
      return [...list, ...action.transfers];
    case "start":
      return update(action.id, (t) =>
        t.state === "queued"
          ? { ...t, state: "running", started: true, error: undefined }
          : null,
      );
    case "progress":
      return update(action.id, (t) =>
        t.state === "running"
          ? { ...t, done: action.done, total: action.total }
          : null,
      );
    case "pause":
      return update(action.id, (t) =>
        t.state === "running" || t.state === "queued"
          ? { ...t, state: "paused" }
          : null,
      );
    case "resume":
      return update(action.id, (t) =>
        t.state === "paused" ? { ...t, state: "queued" } : null,
      );
    case "cancel":
      return update(action.id, (t) =>
        isActive(t) ? { ...t, state: "cancelled" } : null,
      );
    case "finish":
      return update(action.id, (t) =>
        t.state === "running"
          ? {
              ...t,
              state: "done",
              done: t.total >= 0 ? t.total : t.done,
              total: t.total >= 0 ? t.total : t.done,
            }
          : null,
      );
    case "fail":
      return update(action.id, (t) =>
        t.state === "running"
          ? { ...t, state: "failed", error: action.error }
          : null,
      );
    case "retry":
      return update(action.id, (t) =>
        t.state === "failed" || t.state === "cancelled"
          ? { ...t, state: "queued", error: undefined }
          : null,
      );
    case "clear":
      return list.filter(isActive);
  }
}

/** The queued transfers that may start now, oldest first. */
export function nextToStart(list: Transfer[], concurrency: number): string[] {
  const running = list.filter((t) => t.state === "running").length;
  const free = Math.max(0, concurrency - running);
  return list
    .filter((t) => t.state === "queued")
    .slice(0, free)
    .map((t) => t.id);
}

/** Totals for a badge or a progress line. */
export function summarize(list: Transfer[]): {
  active: number;
  failed: number;
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const t of list) {
    if (!isActive(t)) continue;
    done += t.done;
    total += Math.max(t.total, t.done);
  }
  return {
    active: list.filter(isActive).length,
    failed: list.filter((t) => t.state === "failed").length,
    done,
    total,
  };
}
