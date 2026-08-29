import { useEffect } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { rememberOidcCallback } from "@/app/utils/oidc-callback";
import { useAppContext } from "@/app/AppContext";

// Route for the `termix-mobile://oidc-callback` deep link.
//
// It renders nothing: the sign-in screen completes the authentication, either
// through the openAuthSessionAsync result or through its Linking listener. This
// exists because expo-router resolves the link as the path "/oidc-callback",
// and without a file to match it the user lands on "Unmatched Route — Page
// could not be found" at the end of an otherwise successful sign-in.
//
// The URL is rebuilt from the parsed params rather than read back from
// Linking, so nothing here depends on Hermes parsing a custom scheme. Parking
// it happens during render, not in an effect: <Redirect> navigates from its own
// effect, and child effects flush before the parent's, so an effect here could
// race the unmount. rememberOidcCallback is idempotent, which is what makes
// that safe under a double render.
//
// Parking alone does not finish the sign-in. OidcStep drains the parked link
// from its mount effect, but the auth flow is a dismissible overlay rather than
// a route, and a configured-but-unauthenticated app deliberately starts on the
// empty-state shell with that overlay closed. Nothing would mount to consume
// the token and the user would land signed out on the hosts tab, so open the
// flow at the oidc step to complete it.
export default function OidcCallback() {
  const { openAuthFlow } = useAppContext();
  const params = useLocalSearchParams<{
    success?: string;
    token?: string;
    error?: string;
  }>();

  const query = Object.entries(params)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`,
    )
    .join("&");

  rememberOidcCallback(
    `termix-mobile://oidc-callback${query ? `?${query}` : ""}`,
  );

  useEffect(() => {
    openAuthFlow("oidc");
  }, [openAuthFlow]);

  return <Redirect href="/(tabs)/hosts" />;
}
