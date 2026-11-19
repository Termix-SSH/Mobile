import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { useAccounts } from "@/core/accounts";
import { isServerAccount, type ServerAccount } from "@/core/accounts/types";
import type { AlertSeverity } from "@/core/api/modules/alerts";
import { pushMode } from "@/core/push/native";
import { checkAlerts, updateAlertCheck } from "@/core/push/poll";
import { getPushPref, type PushPref } from "@/core/push/prefs";
import {
  setPushPref,
  syncPushAccount,
  type PushState,
} from "@/core/push/register";
import { Button, ChoiceRow, FakeSwitch, SettingRow, Text } from "@/ui";
import { t } from "@/i18n";

const SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];

/** Servers often share the name Termix, so show where each one is. */
export function serverAddress(account: ServerAccount): string {
  return account.serverUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function stateText(state: PushState | null): string | null {
  switch (state) {
    case "denied":
      return t("push.settings.denied");
    case "outdated":
      return t("push.settings.outdated");
    case "unavailable":
      return t("push.settings.unavailable");
    case "error":
      return t("push.settings.error");
    default:
      return null;
  }
}

function ServerPush({
  account,
  last,
}: {
  account: ServerAccount;
  last: boolean;
}) {
  const [pref, setPref] = useState<PushPref | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getPushPref(account.id).then(async (saved) => {
      if (!live) return;
      setPref(saved);
      if (saved.enabled) {
        const next = await syncPushAccount(account.id);
        if (!live) return;
        setState(next);
        setPref(await getPushPref(account.id));
      }
    });
    return () => {
      live = false;
    };
  }, [account.id]);

  const change = useCallback(
    async (patch: Partial<Pick<PushPref, "enabled" | "minSeverity">>) => {
      setBusy(true);
      try {
        const next = await setPushPref(account.id, patch);
        setState(next);
        setPref(await getPushPref(account.id));
        if (pushMode() === "poll") {
          await updateAlertCheck();
          if (patch.enabled) await checkAlerts();
        }
      } finally {
        setBusy(false);
      }
    },
    [account.id],
  );

  if (!pref) return null;
  const note = stateText(state);
  return (
    <View>
      <SettingRow
        label={serverAddress(account)}
        description={
          pref.enabled ? t("push.settings.on") : t("push.settings.off")
        }
        last={last && !pref.enabled && !note}
      >
        <FakeSwitch
          checked={pref.enabled}
          disabled={busy}
          accessibilityLabel={t("push.settings.toggle", {
            server: serverAddress(account),
          })}
          onChange={(on) => void change({ enabled: on })}
        />
      </SettingRow>
      {pref.enabled ? (
        <ChoiceRow
          label={t("push.settings.minSeverity")}
          value={pref.minSeverity}
          options={SEVERITIES.map((value) => ({
            value,
            label: t(`push.severity.${value}`),
          }))}
          onChange={(value) => void change({ minSeverity: value })}
          last={last && !note}
        />
      ) : null}
      {note ? (
        <View className="gap-2 py-2">
          <Text className="text-[11px] text-muted-foreground">{note}</Text>
          {state === "denied" ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onPress={() => void Linking.openSettings()}
            >
              {t("push.settings.openSettings")}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Push notifications for each linked server. */
export function PushNotificationsControl() {
  const { accounts: list } = useAccounts();
  const servers = list.filter(isServerAccount);
  const mode = pushMode();

  if (mode === "none") {
    return (
      <Text className="py-3 text-meta text-muted-foreground">
        {t("push.settings.notInThisBuild")}
      </Text>
    );
  }
  if (servers.length === 0) {
    return (
      <Text className="py-3 text-meta text-muted-foreground">
        {t("push.settings.noServers")}
      </Text>
    );
  }
  return (
    <View>
      <Text className="pb-1 pt-2 text-[11px] text-muted-foreground">
        {mode === "poll"
          ? t("push.settings.pollHint")
          : t("push.settings.pushHint")}
      </Text>
      {servers.map((account, i) => (
        <ServerPush
          key={account.id}
          account={account}
          last={i === servers.length - 1}
        />
      ))}
    </View>
  );
}
