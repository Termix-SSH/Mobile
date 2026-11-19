import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useRepositories } from "@/core/data/hooks";
import { encodeHostShare } from "@/core/hosts/transfer/share";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import { Button, EmptyState, Text } from "@/ui";
import { QrCode } from "./QrCode";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

export default function HostShare() {
  const router = useRouter();
  const repos = useRepositories();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [host, setHost] = useState<SSHHost | null | undefined>(undefined);

  useEffect(() => {
    repos.hosts
      .get(Number(id))
      .then(setHost)
      .catch(() => setHost(null));
  }, [id, repos]);

  const qr = useMemo(
    () => (host ? encodeHostShare(host, { compact: true }) : ""),
    [host],
  );

  const copy = async (password: boolean) => {
    if (!host) return;
    await Clipboard.setStringAsync(encodeHostShare(host, { password }));
    toast.success(
      password
        ? t("hostTransfer.hostShare.copiedWithThePassword")
        : t("hostTransfer.hostShare.copiedTheLink"),
    );
  };

  return (
    <Screen
      title={t("hostTransfer.hostShare.shareHost")}
      subtitle={host?.name || host?.ip}
      onBack={() => router.back()}
    >
      {host === null ? (
        <EmptyState
          title={t("hostTransfer.hostShare.thatHostNoLongerExists")}
        />
      ) : host ? (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 12, alignItems: "center" }}
        >
          <QrCode value={qr} size={260} />
          <Text className="text-center text-meta text-muted-foreground">
            {t("hostTransfer.hostShare.scanThisInTermixOn", { deviceWord })}
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            <Button variant="muted" size="sm" onPress={() => void copy(false)}>
              {t("hostTransfer.hostShare.copyLink")}
            </Button>
            {host.authType === "password" && host.password ? (
              <Button variant="muted" size="sm" onPress={() => void copy(true)}>
                {t("hostTransfer.hostShare.copyLinkWithPassword")}
              </Button>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}
