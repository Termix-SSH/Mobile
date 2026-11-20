import type { FeatureDef } from "@/core/features/types";
import { t } from "@/i18n";

/** Key generation and checks in the login editor. */
export const credentialToolsFeature: FeatureDef = {
  id: "credential-tools",
  plugins: ["credential-tools"],
  title: t("credentialTools.register.credentialTools"),
  source: "native",
  requires: { plugin: "credential-tools" },
  capabilities: ["credentials.keyTools"],
};
