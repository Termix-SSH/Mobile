import { ShieldCheck } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";

export const totpFeature: FeatureDef = {
  id: "totp",
  plugins: ["totp"],
  title: "Two-Factor Authentication",
  source: "native",
  requires: { plugin: "totp" },
  settingsLinks: [
    {
      id: "totp",
      label: "Two-Factor Authentication",
      icon: ShieldCheck,
      order: 10,
      href: "/tabs/settings/TwoFactorAuth",
      section: "security",
      description: "Codes from an authenticator app for your server account",
      keywords: ["2fa", "totp", "authenticator", "code"],
    },
  ],
};
