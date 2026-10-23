import { Redirect } from "expo-router";

import TerminalLab from "@/screens/dev/terminal-lab/TerminalLab";
import { labEnabled } from "@/screens/dev/terminal-lab/enabled";

export default function TerminalLabRoute() {
  if (!labEnabled()) return <Redirect href="/(tabs)/hosts" />;
  return <TerminalLab />;
}
