import { useEffect } from "react";
import { useRouter } from "expo-router";

/**
 * Old Settings route. The assistant lives in the AI tab now; dismiss back to
 * it so the tabs are not stacked twice.
 */
export default function AiAssistantRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo("/(tabs)/ai");
  }, [router]);
  return null;
}
