import { Redirect } from "expo-router";

import ListLab from "@/screens/dev/list-lab/ListLab";
import { labEnabled } from "@/screens/dev/terminal-lab/enabled";

export default function ListLabRoute() {
  if (!labEnabled()) return <Redirect href="/(tabs)/hosts" />;
  return <ListLab />;
}
