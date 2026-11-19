import { useState } from "react";
import { ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Button, ChoiceRow, Input, Label, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SessionMenuContext } from "@/core/features/types";
import {
  guestLink,
  type SharePermission,
} from "@/core/api/modules/sessionSharing";
import { serverHostId } from "@/core/sync/host-ids";
import { showToast } from "@/utils/toast";
import { Screen } from "@/components/Screen";
import { t } from "@/i18n";

const PERMISSIONS: { value: SharePermission; label: string }[] = [
  { value: "read-only", label: t("sessionSharing.shareSessionView.canWatch") },
  { value: "read-write", label: t("sessionSharing.shareSessionView.canType") },
];

export const EXPIRY: { value: string; label: string; hours?: number }[] = [
  { value: "1", label: t("sessionSharing.shareSessionView.n1Hour"), hours: 1 },
  { value: "8", label: t("sessionSharing.shareSessionView.n8Hours"), hours: 8 },
  { value: "24", label: t("sessionSharing.shareSessionView.n1Day"), hours: 24 },
  {
    value: "168",
    label: t("sessionSharing.shareSessionView.n7Days"),
    hours: 168,
  },
  { value: "never", label: t("sessionSharing.shareSessionView.never") },
];

/** Makes a share link to this live session, like the web app's Share button. */
export function ShareSessionView({
  ctx,
  onClose,
}: {
  ctx: SessionMenuContext;
  onClose: () => void;
}) {
  const color = useThemeColor();
  const insets = useSafeAreaInsets();
  const [permission, setPermission] = useState<SharePermission>("read-only");
  const [expiry, setExpiry] = useState("8");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const create = async () => {
    const client = ctx.client;
    const sessionId = ctx.session.backendSessionId;
    if (!client || !sessionId) return;
    setBusy(true);
    try {
      const api = client.api.sessionSharing;
      const hostId = await serverHostId(
        ctx.session.accountId,
        ctx.session.host,
      );
      const share = await api.createLink({
        hostId,
        sessionId,
        tabInstanceId: ctx.session.instanceId,
        permissionLevel: permission,
        expiryHours: EXPIRY.find((e) => e.value === expiry)?.hours,
      });
      const url = share.linkToken
        ? guestLink(await api.publicUrl(), share.linkToken)
        : null;
      if (!url)
        throw new Error(
          t("sessionSharing.shareSessionView.theServerGaveNoLink"),
        );
      setLink(url);
    } catch (e: any) {
      showToast.error(
        e?.response?.data?.error ||
          e?.message ||
          t("sessionSharing.shareSessionView.couldNotMakeALink"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t("sessionSharing.shareSessionView.shareSession")}
      onBack={onClose}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 12,
          gap: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="text-xs text-muted-foreground">
          {t("sessionSharing.shareSessionView.anyoneWithTheLinkCan")}
        </Text>
        <View className="border-y border-border">
          <ChoiceRow
            label={t("sessionSharing.shareSessionView.peopleWithTheLink")}
            value={permission}
            options={PERMISSIONS}
            onChange={(v) => {
              setPermission(v);
              setLink(null);
            }}
          />
          <ChoiceRow
            label={t("sessionSharing.shareSessionView.expiresAfter")}
            value={expiry}
            options={EXPIRY}
            onChange={(v) => {
              setExpiry(v);
              setLink(null);
            }}
            last
          />
        </View>
        {link ? (
          <View className="gap-2">
            <Label>{t("sessionSharing.shareSessionView.link")}</Label>
            <Input value={link} editable={false} selectTextOnFocus />
            <View className="flex-row gap-2">
              <Button
                variant="muted"
                className="flex-1"
                onPress={() =>
                  void Clipboard.setStringAsync(link).then(() =>
                    showToast.success(
                      t("sessionSharing.shareSessionView.linkCopied"),
                    ),
                  )
                }
              >
                {t("sessionSharing.shareSessionView.copy")}
              </Button>
              <Button
                className="flex-1"
                onPress={() => void Share.share({ message: link })}
              >
                {t("sessionSharing.shareSessionView.share")}
              </Button>
            </View>
          </View>
        ) : (
          <Button loading={busy} onPress={create}>
            {t("sessionSharing.shareSessionView.makeLink")}
          </Button>
        )}
      </ScrollView>
    </Screen>
  );
}
