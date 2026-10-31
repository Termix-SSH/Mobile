import { toUserMessage } from "@/core/errors";
import type { FileBackend } from "../backend/types";
import { localSize, removeLocal } from "../backend/local-io";
import { joinRemote } from "../backend/paths";
import {
  nextToStart,
  reduceTransfers,
  type Transfer,
  type TransferAction,
} from "./queue";

export type TransferInput = Omit<Transfer, "id" | "state" | "done" | "started">;

let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Runs a backend's transfers a few at a time. Pause stops the try and keeps
 * what arrived; resume starts again from there.
 */
export class TransferManager {
  private list: Transfer[] = [];
  private controllers = new Map<string, AbortController>();
  private stopReason = new Map<string, "pause" | "cancel">();
  private listeners = new Set<() => void>();
  private lastEmit = 0;

  constructor(
    private backend: FileBackend,
    private options: {
      concurrency: () => number;
      /** Runs after a download landed on the phone. */
      onDownloaded?: (t: Transfer) => void | Promise<void>;
      /** Runs after an upload finished, to refresh the folder. */
      onUploaded?: (t: Transfer) => void;
    },
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.list;

  add(inputs: TransferInput[]): string[] {
    const transfers = inputs.map((input): Transfer => ({
      ...input,
      id: newId(),
      state: "queued",
      done: 0,
    }));
    this.dispatch({ type: "add", transfers });
    this.pump();
    return transfers.map((t) => t.id);
  }

  pause(id: string) {
    this.stop(id, "pause");
    this.dispatch({ type: "pause", id });
  }

  resume(id: string) {
    this.dispatch({ type: "resume", id });
    this.pump();
  }

  retry(id: string) {
    this.dispatch({ type: "retry", id });
    this.pump();
  }

  cancel(id: string) {
    const t = this.find(id);
    const wasRunning = t?.state === "running";
    this.stop(id, "cancel");
    this.dispatch({ type: "cancel", id });
    // A running one cleans up when its try ends.
    if (t && !wasRunning) void this.cleanUp(t);
  }

  cancelAll() {
    for (const t of this.list) this.cancel(t.id);
  }

  clear() {
    this.dispatch({ type: "clear" });
  }

  private find(id: string) {
    return this.list.find((t) => t.id === id);
  }

  private stop(id: string, reason: "pause" | "cancel") {
    const controller = this.controllers.get(id);
    if (!controller) return;
    this.stopReason.set(id, reason);
    controller.abort();
  }

  private dispatch(action: TransferAction, quiet = false) {
    this.list = reduceTransfers(this.list, action);
    // Progress comes often; a few updates a second is enough to draw.
    const now = Date.now();
    if (quiet && now - this.lastEmit < 200) return;
    this.lastEmit = now;
    this.listeners.forEach((l) => l());
  }

  private pump() {
    for (const id of nextToStart(this.list, this.options.concurrency())) {
      void this.run(id);
    }
  }

  private async offsetFor(t: Transfer) {
    if (!t.started) return 0;
    if (t.kind === "download") return localSize(t.localPath);
    return this.backend.uploadedBytes(t.remotePath, t.name);
  }

  private async run(id: string) {
    const before = this.find(id);
    if (!before) return;
    this.dispatch({ type: "start", id });
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const onProgress = (done: number, total: number) =>
      this.dispatch({ type: "progress", id, done, total }, true);
    try {
      const offset = await this.offsetFor(before);
      const options = { offset, onProgress, signal: controller.signal };
      if (before.kind === "download") {
        await this.backend.download(
          before.remotePath,
          before.localPath,
          options,
        );
      } else {
        await this.backend.upload(
          before.localPath,
          before.remotePath,
          before.name,
          options,
        );
      }
      if (controller.signal.aborted) throw new Error("stopped");
      this.dispatch({ type: "finish", id });
      const done = this.find(id)!;
      if (done.kind === "download") await this.options.onDownloaded?.(done);
      else this.options.onUploaded?.(done);
    } catch (error) {
      const reason = this.stopReason.get(id);
      if (reason === "cancel") {
        // This try started, so there may be a partial file either way.
        await this.cleanUp({ ...before, started: true });
      } else if (!reason) {
        this.dispatch({
          type: "fail",
          id,
          error: toUserMessage(error, "Transfer failed"),
        });
      }
    } finally {
      this.controllers.delete(id);
      this.stopReason.delete(id);
      this.listeners.forEach((l) => l());
      this.pump();
    }
  }

  /** Drops what a cancelled transfer left behind. */
  private async cleanUp(t: Transfer) {
    try {
      if (t.kind === "download") {
        removeLocal(t.localPath);
      } else if (t.started) {
        await this.backend.remove(
          [
            {
              name: t.name,
              path: joinRemote(t.remotePath, t.name),
              type: "file",
              size: 0,
              mtime: null,
              mode: null,
            },
          ],
          true,
        );
      }
    } catch {
      // Nothing there to drop.
    }
  }
}
