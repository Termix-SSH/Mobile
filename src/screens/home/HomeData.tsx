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
  /** Opens a host on the tab a server tab type names, else like a tap. */
  openHostAs: (host: SSHHost, serverTabType: string) => void;
  /** The host's action sheet. */
  showHostMenu: (host: SSHHost) => void;
}

const empty: HomeData = {
  hosts: [],
  hostsLoading: false,
  statuses: {},
  openHost: () => {},
  openHostAs: () => {},
  showHostMenu: () => {},
};

export const HomeDataContext = createContext<HomeData>(empty);

export function useHomeData(): HomeData {
  return useContext(HomeDataContext);
}
