import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import { refreshUnread } from "@/screens/notifications/unread";
import { t } from "@/i18n";
import { accountFromPush } from "./links";
import { notificationsModule, pushMode } from "./native";
import { checkAlerts, updateAlertCheck } from "./poll";
import { syncPushAll } from "./register";

/** Opens the inbox of the server a notification came from. */
export function openFromPush(data: unknown): void {
  const account = accountFromPush(data);
  router.push({
    pathname: "/alert",
    params: account ? { account } : {},
  } as never);
}

function serverIds(): string {
  return accounts
    .list()
    .filter(isServerAccount)
    .map((a) => a.id)
    .join(",");
}

let handlerSet = false;

function setUpOnce(): void {
  const mod = notificationsModule();
  if (!mod || handlerSet) return;
  handlerSet = true;
  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    void mod
      .setNotificationChannelAsync("alerts", {
        name: t("push.channels.alerts"),
        importance: mod.AndroidImportance.DEFAULT,
      })
      .catch(() => {});
    void mod
      .setNotificationChannelAsync("alerts-critical", {
        name: t("push.channels.critical"),
        importance: mod.AndroidImportance.HIGH,
      })
      .catch(() => {});
  }
}

/** Keeps each server's phone link up to date and opens taps on alerts. */
export function usePushNotifications(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const mode = pushMode();
    if (mode === "none") return;
    setUpOnce();

    let ids = serverIds();
    void syncPushAll();
    if (mode === "poll") void updateAlertCheck().then(() => checkAlerts());

    const stopAccounts = accounts.subscribe(() => {
      const next = serverIds();
      if (next === ids) return;
      ids = next;
      void syncPushAll();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active" && mode === "poll") void checkAlerts();
    });

    const mod = notificationsModule();
    if (!mod) {
      return () => {
        stopAccounts();
        appState.remove();
      };
    }
    const token = mod.addPushTokenListener(() => void syncPushAll());
    const received = mod.addNotificationReceivedListener(() => {
      void refreshUnread();
    });
    const response = mod.addNotificationResponseReceivedListener((event) =>
      openFromPush(event.notification.request.content.data),
    );
    // A tap that started the app.
    try {
      const last = mod.getLastNotificationResponse();
      if (last) {
        openFromPush(last.notification.request.content.data);
        mod.clearLastNotificationResponse();
      }
    } catch {
      // Nothing to open.
    }

    return () => {
      stopAccounts();
      appState.remove();
      token.remove();
      received.remove();
      response.remove();
    };
  }, [ready]);
}
