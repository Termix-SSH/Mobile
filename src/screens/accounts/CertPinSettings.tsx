import { useState } from "react";
import { View } from "react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import { keyTarget, parsePins } from "@/core/api/pins";
import { toUserMessage } from "@/core/errors";
import { isNetAvailable, peekServerKey } from "@/modules/termix-net";
import { Button, Input, SettingRow, Text, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";
import { t } from "@/i18n";

const short = (pin: string) => `${pin.slice(0, 10)}...${pin.slice(-6)}`;

function keyDetails(key: {
  pin: string;
  subject: string | null;
  issuer: string | null;
  notAfter: number | null;
  selfSigned: boolean | null;
}): string {
  const lines = [`Key: ${key.pin}`];
  if (key.subject)
    lines.push(
      t("accounts.certPinSettings.issuedTo", { subject: key.subject }),
    );
  if (key.issuer)
    lines.push(t("accounts.certPinSettings.issuedBy", { issuer: key.issuer }));
  if (key.selfSigned) lines.push("Self-signed");
  if (key.notAfter) {
    lines.push(
      t("accounts.certPinSettings.validUntil", {
        value: new Date(key.notAfter).toDateString(),
      }),
    );
  }
  lines.push("", t("accounts.certPinSettings.checkThatThisKeyMatches"));
  return lines.join("\n");
}

/**
 * Pins this server's public key. A pinned server is trusted by its key alone
 * (a self-signed certificate works) and any other key is refused.
 */
export function CertPinSettings({
  client,
  onSaved,
}: {
  client: AccountClient;
  onSaved?: () => void;
}) {
  const confirm = useConfirm();
  const [pins, setPins] = useState(() => client.certPins());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (next: string[]) => {
    try {
      await client.setCertPins(next);
      setPins(next);
      onSaved?.();
      return true;
    } catch (error) {
      toast.error(
        toUserMessage(error, t("accounts.certPinSettings.couldNotSaveThePin")),
      );
      return false;
    }
  };

  const readFromServer = async () => {
    setBusy(true);
    try {
      const { host, port } = keyTarget(client.rootBase());
      const key = await peekServerKey(host, port);
      if (pins.includes(key.pin)) {
        toast.success(t("accounts.certPinSettings.theServerSKeyMatches"));
        return;
      }
      const ok = await confirm({
        title: pins.length
          ? t("accounts.certPinSettings.theServerShowsAnotherKey")
          : t("accounts.certPinSettings.pinThisKey"),
        description: keyDetails(key),
        confirmLabel: t("accounts.certPinSettings.pinThisKey2"),
        destructive: pins.length > 0,
      });
      if (ok && (await save([...pins, key.pin])))
        toast.success(t("accounts.certPinSettings.keyPinned"));
    } catch (error) {
      toast.error(
        toUserMessage(
          error,
          t("accounts.certPinSettings.couldNotReadTheServer"),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const addTyped = async () => {
    const { pins: typed, bad } = parsePins(text);
    if (bad.length || !typed.length) {
      toast.error(
        t("accounts.certPinSettings.thatIsNotAPin"),
        t("accounts.certPinSettings.pasteTheBase64Sha256Of"),
      );
      return;
    }
    const next = [...pins, ...typed.filter((p) => !pins.includes(p))];
    if (await save(next)) {
      setText("");
      toast.success(
        typed.length > 1
          ? t("accounts.certPinSettings.keysPinned")
          : t("accounts.certPinSettings.keyPinned"),
      );
    }
  };

  return (
    <View>
      <Text weight="medium" className="mb-1 text-sm text-foreground">
        {t("accounts.certPinSettings.certificatePin")}
      </Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        {t("accounts.certPinSettings.trustThisServerOnlyBy")}
      </Text>
      {pins.length ? (
        <View className="mb-2 border border-border bg-card px-3">
          {pins.map((pin, i) => (
            <SettingRow
              key={pin}
              label={short(pin)}
              last={i === pins.length - 1}
            >
              <Button
                variant="ghost"
                size="sm"
                accessibilityLabel={t("accounts.certPinSettings.removePin", {
                  pin: short(pin),
                })}
                onPress={() => void save(pins.filter((p) => p !== pin))}
              >
                {t("accounts.certPinSettings.remove")}
              </Button>
            </SettingRow>
          ))}
        </View>
      ) : null}
      <Button
        variant="muted"
        onPress={() => void readFromServer()}
        loading={busy}
        disabled={!isNetAvailable()}
        className="mb-2"
      >
        {t("accounts.certPinSettings.readTheKeyFromThe")}
      </Button>
      <View className="mb-6 flex-row items-center gap-2">
        <Input
          containerClassName="flex-1"
          placeholder={t("accounts.certPinSettings.orPasteAPin")}
          autoCapitalize="none"
          autoCorrect={false}
          value={text}
          onChangeText={setText}
          accessibilityLabel={t("accounts.certPinSettings.pin")}
        />
        <Button
          variant="muted"
          onPress={() => void addTyped()}
          disabled={!text.trim() || !isNetAvailable()}
        >
          {t("accounts.certPinSettings.add")}
        </Button>
      </View>
    </View>
  );
}
