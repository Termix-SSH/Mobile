import { Share2 } from "lucide-react-native";
import type { FeatureDef, SessionMenuContext } from "@/core/features/types";
import { ShareSessionView } from "./ShareSessionView";

/** Only a session that runs on the server can be shared. */
export function canShare(ctx: SessionMenuContext): boolean {
  return (
    ctx.session.type === "terminal" &&
    ctx.transport === "relay" &&
    !!ctx.session.backendSessionId
  );
}

export const sessionSharingFeature: FeatureDef = {
  id: "session-sharing",
  plugins: ["session-sharing"],
  title: "Session sharing",
  source: "native",
  requires: { plugin: "session-sharing", pluginApiOnly: true },
  sessionMenuItems: [
    {
      id: "session-sharing.link",
      label: "Share link",
      icon: Share2,
      order: 40,
      isAvailable: canShare,
      view: ShareSessionView,
    },
  ],
};
