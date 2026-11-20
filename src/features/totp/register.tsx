import { ShieldCheck } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { t } from "@/i18n";

export const totpFeature: FeatureDef = {
  id: "totp",
  plugins: ["totp"],
  title: t("totp.register.twoFactorAuthentication"),
  source: "native",
  requires: { plugin: "totp" },
  settingsLinks: [
    {
      id: "totp",
      label: t("totp.register.twoFactorAuthentication"),
      icon: ShieldCheck,
      order: 10,
      href: "/tabs/settings/TwoFactorAuth",
      section: "security",
      description: t("totp.register.codesFromAnAuthenticatorApp"),
      keywords: ["2fa", "totp", "authenticator", "code"],
    },
  ],
};
