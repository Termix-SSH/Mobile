import { useState } from "react";
import { View } from "react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import { keyTarget, parsePins } from "@/core/api/pins";
import { toUserMessage } from "@/core/errors";
import { isNetAvailable, peekServerKey } from "@/modules/termix-net";
import { Button, Input, SettingRow, Text, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";

const short = (pin: string) => `${pin.slice(0, 10)}...${pin.slice(-6)}`;

function keyDetails(key: {
  pin: string;
  subject: string | null;
  issuer: string | null;
  notAfter: number | null;
  selfSigned: boolean | null;
}): string {
  const lines = [`Key: ${key.pin}`];
  if (key.subject) lines.push(`Issued to: ${key.subject}`);
  if (key.issuer) lines.push(`Issued by: ${key.issuer}`);
  if (key.selfSigned) lines.push("Self-signed");
  if (key.notAfter) {
    lines.push(`Valid until: ${new Date(key.notAfter).toDateString()}`);
  }
  lines.push(
    "",
    "Check that this key matches the one on your server before you pin it.",
  );
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
      toast.error(toUserMessage(error, "Could not save the pin"));
      return false;
    }
  };

  const readFromServer = async () => {
    setBusy(true);
    try {
      const { host, port } = keyTarget(client.rootBase());
      const key = await peekServerKey(host, port);
      if (pins.includes(key.pin)) {
        toast.success("The server's key matches the pin");
        return;
      }
      const ok = await confirm({
        title: pins.length ? "The server shows another key" : "Pin this key?",
        description: keyDetails(key),
        confirmLabel: "Pin this key",
        destructive: pins.length > 0,
      });
      if (ok && (await save([...pins, key.pin]))) toast.success("Key pinned");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not read the server's key"));
    } finally {
      setBusy(false);
    }
  };

  const addTyped = async () => {
    const { pins: typed, bad } = parsePins(text);
    if (bad.length || !typed.length) {
      toast.error(
        "That is not a pin",
        "Paste the base64 sha256 of the server's public key, like openssl prints it.",
      );
      return;
    }
    const next = [...pins, ...typed.filter((p) => !pins.includes(p))];
    if (await save(next)) {
      setText("");
      toast.success(typed.length > 1 ? "Keys pinned" : "Key pinned");
    }
  };

  return (
    <View>
      <Text weight="medium" className="mb-1 text-sm text-foreground">
        Certificate pin
      </Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        {
          "Trust this server only by its key. Use it for a self-signed certificate, or to refuse any other key. Add the next key before you change the server's certificate."
        }
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
                accessibilityLabel={`Remove pin ${short(pin)}`}
                onPress={() => void save(pins.filter((p) => p !== pin))}
              >
                Remove
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
        Read the key from the server
      </Button>
      <View className="mb-6 flex-row items-center gap-2">
        <Input
          containerClassName="flex-1"
          placeholder="Or paste a pin"
          autoCapitalize="none"
          autoCorrect={false}
          value={text}
          onChangeText={setText}
          accessibilityLabel="Pin"
        />
        <Button
          variant="muted"
          onPress={() => void addTyped()}
          disabled={!text.trim() || !isNetAvailable()}
        >
          Add
        </Button>
      </View>
    </View>
  );
}
