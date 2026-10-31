import { useState } from "react";
import { View } from "react-native";
import {
  Fingerprint,
  Merge,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react-native";
import { Button, Field, Input, SheetRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { AccountClient } from "@/core/api/AccountClient";
import {
  typedFactor,
  verifySecondFactor,
  type LoginResult,
  type SecondFactorStep as Step,
} from "@/core/accounts/link/login";
import { describeCounts, type OwnDataCounts } from "@/core/sync";
import { toast } from "@/utils/toast";
import { StepCard, TextLink, errorText } from "./AccountSteps";

export function AddressStep({
  address,
  onAddress,
  busy,
  error,
  onContinue,
  onProxy,
}: {
  address: string;
  onAddress: (v: string) => void;
  busy: boolean;
  /** Why the last try failed, said plainly. */
  error: string | null;
  onContinue: () => void;
  onProxy: () => void;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground");
  return (
    <View className="w-full max-w-md gap-4">
      <StepCard>
        <Field
          label="Server address"
          error={error}
          hint="Like termix.example.com or 192.168.1.20:30001"
        >
          <Input
            value={address}
            onChangeText={onAddress}
            placeholder="termix.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            keyboardType="url"
            textContentType="URL"
            importantForAutofill="yes"
            editable={!busy}
            leading={<Server size={16} color={muted} />}
            onSubmitEditing={onContinue}
            returnKeyType="go"
          />
        </Field>
        <Button size="lg" loading={busy} onPress={onContinue}>
          {busy ? "Checking..." : "Continue"}
        </Button>
        <Button
          variant="ghost"
          onPress={onProxy}
          disabled={busy}
          icon={<SlidersHorizontal size={14} color={muted} />}
        >
          Proxy and client certificate
        </Button>
      </StepCard>
      <View className="flex-row gap-2.5 border border-border bg-card/60 px-3 py-2.5">
        <ShieldAlert size={15} color={muted} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-[11px] leading-4 text-muted-foreground">
          A server with a self signed certificate needs its root CA installed on
          this phone first. Plain http works on your own network.
        </Text>
      </View>
    </View>
  );
}

export function SecondFactorStep({
  client,
  step,
  onResult,
  onBrowser,
  onBack,
}: {
  client: AccountClient;
  step: Step;
  onResult: (result: LoginResult) => void;
  onBrowser: () => void;
  onBack: () => void;
}) {
  const color = useThemeColor();
  const factor = typedFactor(step);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!factor) return;
    if (!code.trim()) {
      toast.error("Enter the code");
      return;
    }
    setBusy(true);
    try {
      onResult(await verifySecondFactor(client, step, factor, code));
    } catch (e) {
      toast.error(errorText(e, "That code didn't work"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard>
      {factor ? (
        <>
          <Field
            label="Code"
            hint="The 6 digit code from your authenticator app, or a backup code"
          >
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              autoFocus
              editable={!busy}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </Field>
          <Button size="lg" loading={busy} onPress={submit}>
            Check code
          </Button>
        </>
      ) : (
        <Text className="text-sm leading-5 text-muted-foreground">
          This account asks for a security key after the password. Sign in on
          the server&apos;s page in your browser to use it.
        </Text>
      )}
      {step.factors.some((f) => f !== "totp") ? (
        <Button
          variant={factor ? "ghost" : "default"}
          size="lg"
          onPress={onBrowser}
          icon={
            <Fingerprint
              size={16}
              color={color(factor ? "foreground" : "primary-foreground")}
            />
          }
        >
          Use a security key in the browser
        </Button>
      ) : null}
      <TextLink label="Back to sign in" onPress={onBack} />
    </StepCard>
  );
}

export function MergeStep({
  counts,
  serverName,
  onChoose,
}: {
  counts: OwnDataCounts | null;
  serverName: string;
  onChoose: (merge: boolean) => void;
}) {
  const color = useThemeColor();
  const what = counts
    ? describeCounts(counts)
    : "hosts, credentials or snippets";
  return (
    <View className="w-full max-w-md border border-border bg-card">
      <View className="gap-1 p-5 pb-3">
        <Text weight="medium" className="text-base text-foreground">
          Bring this phone&apos;s hosts along?
        </Text>
        <Text className="text-xs leading-5 text-muted-foreground">
          {`This phone has ${what}. They stay on This device either way.`}
        </Text>
      </View>
      <SheetRow
        icon={<Merge size={18} color={color("foreground")} />}
        label="Merge"
        description={`Copy them to ${serverName} too, so they sync. Ones that look the same as a server host are skipped.`}
        onPress={() => onChoose(true)}
      />
      <SheetRow
        icon={<Smartphone size={18} color={color("foreground")} />}
        label="Replace"
        description={`Use only what is on ${serverName} for this account. Nothing is copied.`}
        onPress={() => onChoose(false)}
      />
    </View>
  );
}
