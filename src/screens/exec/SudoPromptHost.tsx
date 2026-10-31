import { useEffect, useRef, useState } from "react";
import { setSudoPrompter, type SudoRequest } from "@/core/exec";
import { PromptSheet } from "@/ui";

interface Pending extends SudoRequest {
  resolve: (password: string | null) => void;
}

/** Asks for a sudo password when a script needs root. Mounted once. */
export function SudoPromptHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  useEffect(
    () =>
      setSudoPrompter(
        (request) =>
          new Promise((resolve) => {
            // A second ask while one is open cancels the older one.
            pendingRef.current?.resolve(null);
            setPending({ ...request, resolve });
          }),
      ),
    [],
  );

  const finish = (password: string | null) => {
    pending?.resolve(password);
    setPending(null);
  };

  const description = pending
    ? [
        pending.retry ? "That password was wrong." : null,
        pending.reason
          ? `${pending.reason} on ${pending.hostName} needs root.`
          : `${pending.hostName} needs root for this.`,
        "It is kept until you close the app.",
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return (
    <PromptSheet
      visible={pending !== null}
      title="Sudo password"
      description={description}
      placeholder="Password"
      confirmLabel="Run"
      secureTextEntry
      validate={(value) => value.length > 0 && !/[\r\n]/.test(value)}
      onSubmit={(value) => finish(value)}
      onCancel={() => finish(null)}
    />
  );
}
