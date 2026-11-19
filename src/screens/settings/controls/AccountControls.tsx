import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Server, Smartphone } from "lucide-react-native";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  accountLabel,
  accounts,
  isServerAccount,
  useAccounts,
  useActiveClient,
  type Account,
} from "@/core/accounts";
import {
  changeServerPassword,
  deleteServerAccount,
  signOutClient,
} from "@/core/accounts/actions";
import { toUserMessage } from "@/core/errors";
import { useAccountSync, useSyncIssues } from "@/core/sync";
import {
  Badge,
  Button,
  Input,
  ListRow,
  Sheet,
  SheetBody,
  Text,
  SettingRow,
} from "@/ui";
import { toast } from "@/utils/toast";
import { useServerUser } from "../useServerUser";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

const STATE_TEXT = {
  idle: t("settings.controls.accountControls.synced"),
  syncing: t("settings.controls.accountControls.syncing"),
  offline: t("settings.controls.accountControls.offline"),
  error: t("settings.controls.accountControls.stopped"),
  signed_out: t("settings.controls.accountControls.signedOut"),
  off: t("settings.controls.accountControls.readsLive"),
} as const;

function AccountRow({
  account,
  active,
  index,
}: {
  account: Account;
  active: boolean;
  index: number;
}) {
  const router = useRouter();
  const color = useThemeColor();
  const status = useAccountSync(account.id);
  const { conflicts } = useSyncIssues(account.id);
  const server = isServerAccount(account) ? account : null;

  const meta = server
    ? [
        server.username,
        server.serverUrl.replace(/^https?:\/\//, ""),
        STATE_TEXT[status.state],
        conflicts.length
          ? t("settings.controls.accountControls.toReview", {
              count: conflicts.length,
            })
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : t("settings.controls.accountControls.worksWithoutAServer");
  const Icon = server ? Server : Smartphone;

  return (
    <ListRow
      index={index}
      selected={active}
      tone={
        !server
          ? "muted"
          : status.state === "error" || status.state === "signed_out"
            ? "destructive"
            : conflicts.length
              ? "warning"
              : "success"
      }
      icon={<Icon size={14} color={color("muted-foreground")} />}
      title={accountLabel(account)}
      badges={
        active ? (
          <Badge variant="success">
            {t("settings.controls.accountControls.active")}
          </Badge>
        ) : null
      }
      meta={<Text className="text-meta text-muted-foreground">{meta}</Text>}
      onPress={() => {
        if (server) {
          router.push(`/tabs/settings/Sync?account=${account.id}` as never);
        } else if (!active) {
          void accounts.setActive(account.id);
        }
      }}
    />
  );
}

/** Every account with its sync state. Tap a server for its sync settings. */
export function AccountsControl() {
  const { accounts: list, active } = useAccounts();
  const { openAuthFlow } = useAppContext();
  return (
    <View className="py-2">
      <View className="border border-border">
        {list.map((account, i) => (
          <AccountRow
            key={account.id}
            account={account}
            active={account.id === active.id}
            index={i}
          />
        ))}
      </View>
      <View className="flex-row gap-2 pt-2">
        <Button
          variant="muted"
          size="sm"
          onPress={() => openAuthFlow("server")}
          icon={<Plus size={14} />}
        >
          {t("settings.controls.accountControls.linkAServer")}
        </Button>
      </View>
      <Text className="pt-2 text-meta text-muted-foreground">
        {t("settings.controls.accountControls.eachServerKeepsItsOwn", {
          deviceWord,
        })}
      </Text>
    </View>
  );
}

/** Signed in user and sign in or out for the active server. */
export function ServerSessionControl() {
  const client = useActiveClient();
  const { isAuthenticated, setAuthenticated, openAuthFlow } = useAppContext();
  const user = useServerUser();
  const [busy, setBusy] = useState(false);
  if (!client) return null;

  const signOut = async () => {
    setBusy(true);
    try {
      await signOutClient(client);
      setAuthenticated(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {isAuthenticated ? (
        <>
          <SettingRow label={t("settings.controls.accountControls.signedInAs")}>
            <Text weight="medium" className="text-row text-foreground">
              {user.username || "-"}
            </Text>
          </SettingRow>
          <SettingRow label={t("settings.controls.accountControls.role")}>
            <Text className="text-row text-muted-foreground">
              {user.isAdmin
                ? t("settings.controls.accountControls.administrator")
                : t("settings.controls.accountControls.user")}
            </Text>
          </SettingRow>
          {user.version ? (
            <SettingRow
              label={t("settings.controls.accountControls.serverVersion")}
            >
              <Text className="text-row text-muted-foreground">
                v{user.version}
              </Text>
            </SettingRow>
          ) : null}
          <View className="py-3">
            <Button variant="destructive" loading={busy} onPress={signOut}>
              {t("settings.controls.accountControls.signOut")}
            </Button>
          </View>
        </>
      ) : (
        <View className="gap-2 py-3">
          <Text className="text-meta text-muted-foreground">
            {t("settings.controls.accountControls.youAreSignedOutOf")}
          </Text>
          <Button onPress={() => openAuthFlow("login")}>
            {t("settings.controls.accountControls.signIn")}
          </Button>
        </View>
      )}
    </View>
  );
}

export function ChangePasswordControl() {
  const client = useActiveClient();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
  };
  const submit = async () => {
    setBusy(true);
    try {
      await changeServerPassword(client, current, next);
      toast.success(t("settings.controls.accountControls.passwordChanged"));
      close();
    } catch (e) {
      toast.error(
        toUserMessage(
          e,
          t("settings.controls.accountControls.couldNotChangeThePassword"),
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="muted" onPress={() => setOpen(true)}>
        {t("settings.controls.accountControls.changePassword")}
      </Button>
      <Sheet
        scroll
        visible={open}
        onClose={close}
        title={t("settings.controls.accountControls.changePassword")}
        description={t(
          "settings.controls.accountControls.enterYourCurrentPasswordThen",
        )}
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={close}>
              {t("settings.controls.accountControls.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={busy || !current || !next}
              onPress={submit}
            >
              {t("settings.controls.accountControls.change")}
            </Button>
          </>
        }
      >
        <SheetBody>
          <View className="gap-2">
            <Input
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              placeholder={t(
                "settings.controls.accountControls.currentPassword",
              )}
              autoCapitalize="none"
            />
            <Input
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholder={t("settings.controls.accountControls.newPassword")}
              autoCapitalize="none"
            />
          </View>
        </SheetBody>
      </Sheet>
    </>
  );
}

export function DeleteAccountControl() {
  const client = useActiveClient();
  const { setAuthenticated } = useAppContext();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(false);
    setPassword("");
  };
  const submit = async () => {
    setBusy(true);
    try {
      await deleteServerAccount(client, password);
      setAuthenticated(false);
      close();
      toast.success(t("settings.controls.accountControls.accountDeleted"));
    } catch (e) {
      toast.error(
        toUserMessage(
          e,
          t("settings.controls.accountControls.couldNotDeleteTheAccount"),
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="destructive" onPress={() => setOpen(true)}>
        {t("settings.controls.accountControls.deleteServerAccount")}
      </Button>
      <Sheet
        scroll
        visible={open}
        onClose={close}
        title={t("settings.controls.accountControls.deleteServerAccount")}
        description={t(
          "settings.controls.accountControls.thisPermanentlyDeletesYourAccount",
        )}
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={close}>
              {t("settings.controls.accountControls.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !password}
              onPress={submit}
            >
              {t("settings.controls.accountControls.delete")}
            </Button>
          </>
        }
      >
        <SheetBody>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={t(
              "settings.controls.accountControls.confirmYourPassword",
            )}
            autoCapitalize="none"
          />
        </SheetBody>
      </Sheet>
    </>
  );
}
