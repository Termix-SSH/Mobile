import { useState } from "react";
import { View } from "react-native";
import { useAppLock } from "@/contexts/AppLockContext";
import { LOCK_DELAYS } from "@/core/lock";
import { ChoiceRow, FakeSwitch, SettingRow, SettingsLinkRow } from "@/ui";
import { KeyRound } from "lucide-react-native";
import { toast } from "@/utils/toast";
import { PinSheet } from "./PinSheet";
import { t } from "@/i18n";

type Flow =
  | null
  | { kind: "enable"; step: "new" | "confirm"; first: string }
  | { kind: "disable" }
  | {
      kind: "change";
      step: "old" | "new" | "confirm";
      old: string;
      first: string;
    };

const ENABLE_TEXT = {
  new: ["Set a PIN", t("settings.controls.securityControls.chooseA4DigitPin")],
  confirm: [
    t("settings.controls.securityControls.confirmPin"),
    t("settings.controls.securityControls.enterTheSamePinAgain"),
  ],
} as const;

export function AppLockControl() {
  const lock = useAppLock();
  const [flow, setFlow] = useState<Flow>(null);
  const close = () => setFlow(null);

  const onToggle = (on: boolean) => {
    if (on) setFlow({ kind: "enable", step: "new", first: "" });
    else setFlow({ kind: "disable" });
  };

  let sheet = null;
  if (flow?.kind === "enable") {
    const [title, description] = ENABLE_TEXT[flow.step];
    sheet = (
      <PinSheet
        visible
        title={title}
        description={description}
        onClose={close}
        onSubmit={async (pin) => {
          if (flow.step === "new") {
            setFlow({ kind: "enable", step: "confirm", first: pin });
            return true;
          }
          if (pin !== flow.first) {
            toast.error(
              t("settings.controls.securityControls.thePinsDoNotMatch"),
            );
            setFlow({ kind: "enable", step: "new", first: "" });
            return true;
          }
          await lock.enable(pin);
          close();
          toast.success(t("settings.controls.securityControls.appLockIsOn"));
          return true;
        }}
      />
    );
  } else if (flow?.kind === "disable") {
    sheet = (
      <PinSheet
        visible
        title={t("settings.controls.securityControls.turnOffAppLock")}
        description={t(
          "settings.controls.securityControls.enterYourPinToConfirm",
        )}
        waitMs={lock.pinWaitMs}
        onClose={close}
        onBiometric={
          lock.hasBiometrics
            ? async () => {
                if (await lock.authenticateBiometrics()) {
                  await lock.disable();
                  close();
                  toast.success(
                    t("settings.controls.securityControls.appLockIsOff"),
                  );
                }
              }
            : undefined
        }
        onSubmit={async (pin) => {
          if (!(await lock.verifyPin(pin))) return false;
          await lock.disable();
          close();
          toast.success(t("settings.controls.securityControls.appLockIsOff"));
          return true;
        }}
      />
    );
  }

  return (
    <>
      <SettingRow
        label={t("settings.controls.securityControls.appLock")}
        description={
          lock.hasBiometrics
            ? t("settings.controls.securityControls.askForFaceIdTouch")
            : t("settings.controls.securityControls.askForAPinTo")
        }
        last
      >
        <FakeSwitch
          checked={lock.enabled}
          onChange={onToggle}
          accessibilityLabel={t("settings.controls.securityControls.appLock")}
        />
      </SettingRow>
      {sheet}
    </>
  );
}

export function ChangePinControl() {
  const lock = useAppLock();
  const [flow, setFlow] = useState<Flow>(null);
  const close = () => setFlow(null);
  if (!lock.enabled) return null;

  let sheet = null;
  if (flow?.kind === "change") {
    const text = {
      old: [
        t("settings.controls.securityControls.currentPin"),
        t("settings.controls.securityControls.enterYourCurrentPin"),
      ],
      new: [
        t("settings.controls.securityControls.newPin"),
        t("settings.controls.securityControls.chooseANew4Digit"),
      ],
      confirm: [
        t("settings.controls.securityControls.confirmNewPin"),
        t("settings.controls.securityControls.enterTheNewPinAgain"),
      ],
    }[flow.step];
    sheet = (
      <PinSheet
        visible
        title={text[0]}
        description={text[1]}
        waitMs={flow.step === "old" ? lock.pinWaitMs : 0}
        onClose={close}
        onSubmit={async (pin) => {
          if (flow.step === "old") {
            if (!(await lock.verifyPin(pin))) return false;
            setFlow({ kind: "change", step: "new", old: pin, first: "" });
            return true;
          }
          if (flow.step === "new") {
            setFlow({ ...flow, step: "confirm", first: pin });
            return true;
          }
          if (pin !== flow.first) {
            toast.error(
              t("settings.controls.securityControls.thePinsDoNotMatch"),
            );
            setFlow({ ...flow, step: "new", first: "" });
            return true;
          }
          const ok = await lock.changePin(flow.old, pin);
          close();
          if (ok)
            toast.success(t("settings.controls.securityControls.pinChanged"));
          else
            toast.error(
              t("settings.controls.securityControls.couldNotChangeThePin"),
            );
          return true;
        }}
      />
    );
  }

  return (
    <>
      <SettingsLinkRow
        label={t("settings.controls.securityControls.changePin")}
        icon={KeyRound}
        onPress={() =>
          setFlow({ kind: "change", step: "old", old: "", first: "" })
        }
        last
      />
      {sheet}
    </>
  );
}

export function LockDelayControl() {
  const lock = useAppLock();
  if (!lock.enabled) return null;
  return (
    <View>
      <ChoiceRow
        label={t("settings.controls.securityControls.lockAfter")}
        description={t("settings.controls.securityControls.howLongTheAppCan")}
        value={String(lock.delayMs)}
        options={LOCK_DELAYS.map((d) => ({
          value: String(d.ms),
          label: d.label,
        }))}
        onChange={(v) => void lock.setDelayMs(Number(v))}
        last
      />
    </View>
  );
}

export function HideSwitcherControl() {
  const lock = useAppLock();
  return (
    <SettingRow
      label={t("settings.controls.securityControls.hideInAppSwitcher")}
      description={t("settings.controls.securityControls.showABlankScreenIn")}
      last
    >
      <FakeSwitch
        checked={lock.hideInSwitcher}
        onChange={(on) => void lock.setHideInSwitcher(on)}
        accessibilityLabel={t(
          "settings.controls.securityControls.hideInAppSwitcher",
        )}
      />
    </SettingRow>
  );
}
