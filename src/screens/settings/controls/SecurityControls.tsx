import { useState } from "react";
import { View } from "react-native";
import { useAppLock } from "@/contexts/AppLockContext";
import { LOCK_DELAYS } from "@/core/lock";
import { ChoiceRow, FakeSwitch, SettingRow, SettingsLinkRow } from "@/ui";
import { KeyRound } from "lucide-react-native";
import { toast } from "@/utils/toast";
import { PinSheet } from "./PinSheet";

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
  new: ["Set a PIN", "Choose a 4 digit PIN."],
  confirm: ["Confirm PIN", "Enter the same PIN again."],
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
            toast.error("The PINs do not match");
            setFlow({ kind: "enable", step: "new", first: "" });
            return true;
          }
          await lock.enable(pin);
          close();
          toast.success("App Lock is on");
          return true;
        }}
      />
    );
  } else if (flow?.kind === "disable") {
    sheet = (
      <PinSheet
        visible
        title="Turn off App Lock"
        description="Enter your PIN to confirm."
        waitMs={lock.pinWaitMs}
        onClose={close}
        onBiometric={
          lock.hasBiometrics
            ? async () => {
                if (await lock.authenticateBiometrics()) {
                  await lock.disable();
                  close();
                  toast.success("App Lock is off");
                }
              }
            : undefined
        }
        onSubmit={async (pin) => {
          if (!(await lock.verifyPin(pin))) return false;
          await lock.disable();
          close();
          toast.success("App Lock is off");
          return true;
        }}
      />
    );
  }

  return (
    <>
      <SettingRow
        label="App Lock"
        description={
          lock.hasBiometrics
            ? "Ask for Face ID, Touch ID or a PIN to open the app"
            : "Ask for a PIN to open the app"
        }
        last
      >
        <FakeSwitch
          checked={lock.enabled}
          onChange={onToggle}
          accessibilityLabel="App Lock"
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
      old: ["Current PIN", "Enter your current PIN."],
      new: ["New PIN", "Choose a new 4 digit PIN."],
      confirm: ["Confirm new PIN", "Enter the new PIN again."],
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
            toast.error("The PINs do not match");
            setFlow({ ...flow, step: "new", first: "" });
            return true;
          }
          const ok = await lock.changePin(flow.old, pin);
          close();
          if (ok) toast.success("PIN changed");
          else toast.error("Could not change the PIN");
          return true;
        }}
      />
    );
  }

  return (
    <>
      <SettingsLinkRow
        label="Change PIN"
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
        label="Lock after"
        description="How long the app can be out of sight before it locks"
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
      label="Hide in app switcher"
      description="Show a blank screen in the list of recent apps"
      last
    >
      <FakeSwitch
        checked={lock.hideInSwitcher}
        onChange={(on) => void lock.setHideInSwitcher(on)}
        accessibilityLabel="Hide in app switcher"
      />
    </SettingRow>
  );
}
