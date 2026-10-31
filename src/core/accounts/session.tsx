import React, { createContext, useContext, type ReactNode } from "react";
import type { AccountClient } from "@/core/api/AccountClient";
import { AppError } from "@/core/errors";
import { useClient } from "./index";

// Sessions keep running after an account switch, so anything inside a session
// talks to the account that opened it, not the active one.
const SessionAccountContext = createContext<string | null>(null);

export function SessionAccountProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  return (
    <SessionAccountContext.Provider value={accountId}>
      {children}
    </SessionAccountContext.Provider>
  );
}

export function useSessionAccountId(): string | null {
  return useContext(SessionAccountContext);
}

/** Client of the account the surrounding session belongs to. */
export function useSessionClient(): AccountClient {
  const client = useClient(useSessionAccountId());
  if (!client) {
    throw new AppError("This session has no server", "NO_SERVER");
  }
  return client;
}
