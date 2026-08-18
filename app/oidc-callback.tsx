import { Redirect, useLocalSearchParams } from "expo-router";
import { rememberOidcCallback } from "@/app/utils/oidc-callback";

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
export default function OidcCallback() {
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

  return <Redirect href="/(tabs)/hosts" />;
}
