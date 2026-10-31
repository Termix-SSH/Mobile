import type { FeatureDef } from "@/core/features/types";

/** Key generation and checks in the login editor. */
export const credentialToolsFeature: FeatureDef = {
  id: "credential-tools",
  plugins: ["credential-tools"],
  title: "Credential Tools",
  source: "native",
  requires: { plugin: "credential-tools" },
  capabilities: ["credentials.keyTools"],
};
