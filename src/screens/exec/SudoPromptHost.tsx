import { useEffect, useRef, useState } from "react";
import { setSudoPrompter, type SudoRequest } from "@/core/exec";
import { PromptSheet } from "@/ui";
import { t } from "@/i18n";

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
        pending.retry ? t("exec.sudoPromptHost.thatPasswordWasWrong") : null,
        pending.reason
          ? t("exec.sudoPromptHost.onNeedsRoot", {
              reason: pending.reason,
              hostName: pending.hostName,
            })
          : t("exec.sudoPromptHost.needsRootForThis", {
              hostName: pending.hostName,
            }),
        t("exec.sudoPromptHost.itIsKeptUntilYou"),
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return (
    <PromptSheet
      visible={pending !== null}
      title={t("exec.sudoPromptHost.sudoPassword")}
      description={description}
      placeholder={t("exec.sudoPromptHost.password")}
      confirmLabel={t("exec.sudoPromptHost.run")}
      secureTextEntry
      validate={(value) => value.length > 0 && !/[\r\n]/.test(value)}
      onSubmit={(value) => finish(value)}
      onCancel={() => finish(null)}
    />
  );
}
