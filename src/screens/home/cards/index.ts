import {
  Activity,
  Bell,
  Clock,
  LayoutGrid,
  Pin,
  Server,
  SquareTerminal,
} from "lucide-react-native";
import type { FeatureContext, HomeCardDef } from "@/core/features/types";
import { ActivityCard } from "./ActivityCard";
import { AlertsCard } from "./AlertsCard";
import { PinnedCard } from "./PinnedCard";
import { QuickCard } from "./QuickCard";
import { RecentCard } from "./RecentCard";
import { ServerCard } from "./ServerCard";
import { SessionsCard } from "./SessionsCard";

const linked = (ctx: FeatureContext) =>
  ctx.account.kind === "server" && !!ctx.client;

/** Cards Home always knows. Features add more through `homeCards`. */
export const CORE_HOME_CARDS: HomeCardDef[] = [
  {
    id: "server",
    title: "Server",
    icon: Server,
    order: 10,
    isAvailable: linked,
    component: ServerCard,
  },
  {
    id: "sessions",
    title: "Open sessions",
    icon: SquareTerminal,
    order: 20,
    component: SessionsCard,
  },
  {
    id: "quick",
    title: "Quick access",
    icon: LayoutGrid,
    order: 30,
    component: QuickCard,
  },
  {
    id: "alerts",
    title: "Notifications",
    icon: Bell,
    order: 40,
    isAvailable: linked,
    component: AlertsCard,
  },
  {
    id: "pinned",
    title: "Pinned hosts",
    icon: Pin,
    order: 50,
    component: PinnedCard,
  },
  {
    id: "recent",
    title: "Recent hosts",
    icon: Clock,
    order: 80,
    component: RecentCard,
  },
  {
    id: "activity",
    title: "Recent activity",
    icon: Activity,
    order: 90,
    isAvailable: linked,
    component: ActivityCard,
  },
];

export { pinnedHosts } from "./PinnedCard";
