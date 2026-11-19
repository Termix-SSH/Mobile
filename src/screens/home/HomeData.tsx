import { createContext, useContext } from "react";
import type { HostState } from "@/core/status";
import type { SSHHost } from "@/types";

/** What Home loads once and every card can read. */
export interface HomeData {
  hosts: SSHHost[];
  hostsLoading: boolean;
  statuses: Record<number, HostState>;
  /** Opens a host the way a tap on its row would. */
  openHost: (host: SSHHost) => void;
  /** The host's action sheet. */
  showHostMenu: (host: SSHHost) => void;
}

const empty: HomeData = {
  hosts: [],
  hostsLoading: false,
  statuses: {},
  openHost: () => {},
  showHostMenu: () => {},
};

export const HomeDataContext = createContext<HomeData>(empty);

export function useHomeData(): HomeData {
  return useContext(HomeDataContext);
}
