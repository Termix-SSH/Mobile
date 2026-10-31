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

const STATE_TEXT = {
  idle: "Synced",
  syncing: "Syncing",
  offline: "Offline",
  error: "Stopped",
  signed_out: "Signed out",
  off: "Reads live",
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
        conflicts.length ? `${conflicts.length} to review` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : "Works without a server";
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
      badges={active ? <Badge variant="success">Active</Badge> : null}
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
          Link a server
        </Button>
      </View>
      <Text className="pt-2 text-meta text-muted-foreground">
        Each server keeps its own copy of your hosts, credentials and settings
        on this phone.
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
          <SettingRow label="Signed in as">
            <Text weight="medium" className="text-row text-foreground">
              {user.username || "-"}
            </Text>
          </SettingRow>
          <SettingRow label="Role">
            <Text className="text-row text-muted-foreground">
              {user.isAdmin ? "Administrator" : "User"}
            </Text>
          </SettingRow>
          {user.version ? (
            <SettingRow label="Server version">
              <Text className="text-row text-muted-foreground">
                v{user.version}
              </Text>
            </SettingRow>
          ) : null}
          <View className="py-3">
            <Button variant="destructive" loading={busy} onPress={signOut}>
              Sign out
            </Button>
          </View>
        </>
      ) : (
        <View className="gap-2 py-3">
          <Text className="text-meta text-muted-foreground">
            You are signed out of this server.
          </Text>
          <Button onPress={() => openAuthFlow("login")}>Sign in</Button>
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
      toast.success("Password changed");
      close();
    } catch (e) {
      toast.error(toUserMessage(e, "Could not change the password"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="muted" onPress={() => setOpen(true)}>
        Change password
      </Button>
      <Sheet
        scroll
        visible={open}
        onClose={close}
        title="Change password"
        description="Enter your current password, then choose a new one."
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={close}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !current || !next}
              onPress={submit}
            >
              Change
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
              placeholder="Current password"
              autoCapitalize="none"
            />
            <Input
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholder="New password"
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
      toast.success("Account deleted");
    } catch (e) {
      toast.error(toUserMessage(e, "Could not delete the account"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="destructive" onPress={() => setOpen(true)}>
        Delete server account
      </Button>
      <Sheet
        scroll
        visible={open}
        onClose={close}
        title="Delete server account"
        description="This permanently deletes your account on the server and all of its data. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" size="sm" onPress={close}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !password}
              onPress={submit}
            >
              Delete
            </Button>
          </>
        }
      >
        <SheetBody>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Confirm your password"
            autoCapitalize="none"
          />
        </SheetBody>
      </Sheet>
    </>
  );
}
