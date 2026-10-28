import type { Transport } from "@/core/transport/types";
import { showcaseSession } from "./session";
import { ShowcaseShell } from "./shell";

/** Stands in for the phone's SSH on every host in showcase builds. */
export const showcaseTransport: Transport = {
  kind: "local",
  provides: ["shell", "exec", "sftp", "forward", "tcp"],
  available: true,
  openShell: (options) => new ShowcaseShell(options),
  openSession: async (host) => showcaseSession(host),
};
