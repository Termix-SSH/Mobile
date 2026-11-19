import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Shield, User } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { apiOf, useActiveClient } from "@/core/accounts";
import { useRepositories } from "@/core/data/hooks";
import { serverHostId } from "@/core/sync";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import {
  Button,
  Checkbox,
  ChoiceRow,
  EmptyState,
  Input,
  ListRow,
  Section,
  Sheet,
  SheetRow,
  Tabs,
  Text,
  useConfirm,
} from "@/ui";
import {
  SHARE_LEVELS,
  errorText,
  getHostAccess,
  getShareTargets,
  levelHint,
  levelLabel,
  revokeHostAccess,
  shareHost,
  targetName,
  updateHostAccess,
  type AccessRecord,
  type ShareLevel,
  type ShareRole,
  type ShareTarget,
  type ShareUser,
} from "./api";
import { t } from "@/i18n";

const EXPIRY = [
  { value: "never", hours: 0 },
  { value: "1h", hours: 1 },
  { value: "1d", hours: 24 },
  { value: "7d", hours: 24 * 7 },
  { value: "30d", hours: 24 * 30 },
] as const;
type Expiry = (typeof EXPIRY)[number]["value"];

function untilText(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "";
  return t("hostAccess.until", { date: date.toLocaleString() });
}

/** Who can use a server host, and sharing it with more people or roles. */
export default function HostAccess() {
  const router = useRouter();
  const client = useActiveClient();
  const repos = useRepositories();
  const confirm = useConfirm();
  const color = useThemeColor();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [host, setHost] = useState<SSHHost | null>(null);
  const [serverId, setServerId] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessRecord[] | null>(null);
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [roles, setRoles] = useState<ShareRole[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"user" | "role">("user");
  const [search, setSearch] = useState("");
  const [pickedUsers, setPickedUsers] = useState<Set<string>>(new Set());
  const [pickedRoles, setPickedRoles] = useState<Set<number>>(new Set());
  const [level, setLevel] = useState<ShareLevel>("connect");
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AccessRecord | null>(null);

  useEffect(() => {
    repos.hosts
      .get(Number(id))
      .then(setHost)
      .catch(() => setHost(null));
  }, [id, repos]);

  const load = useCallback(async () => {
    if (!client || !host) return;
    try {
      const hostId = await serverHostId(client.accountId, host);
      setServerId(hostId);
      const me = await apiOf(client)
        .auth.getUserInfo()
        .catch(() => null);
      const [list, targets] = await Promise.all([
        getHostAccess(client, hostId),
        getShareTargets(client, me?.userId),
      ]);
      setAccess(list.accessList);
      setUsers(targets.users);
      setRoles(targets.roles);
      setError("");
    } catch (e) {
      setError(errorText(e, t("hostAccess.couldNotLoad")));
    }
  }, [client, host]);

  useEffect(() => {
    void load();
  }, [load]);

  const shownUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? users.filter((u) => u.username.toLowerCase().includes(q))
      : users;
  }, [users, search]);

  const shownRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? roles.filter((r) => r.name.toLowerCase().includes(q)) : roles;
  }, [roles, search]);

  const picked = pickedUsers.size + pickedRoles.size;

  const share = async () => {
    if (!client || serverId === null || picked === 0) return;
    const targets: ShareTarget[] = [
      ...[...pickedUsers].map((uid) => ({ type: "user" as const, id: uid })),
      ...[...pickedRoles].map((rid) => ({ type: "role" as const, id: rid })),
    ];
    setBusy(true);
    try {
      const hours = EXPIRY.find((e) => e.value === expiry)?.hours || undefined;
      await shareHost(client, serverId, targets, level, hours);
      setPickedUsers(new Set());
      setPickedRoles(new Set());
      toast.success(t("hostAccess.shared"));
      await load();
    } catch (e) {
      toast.error(errorText(e, t("hostAccess.couldNotShare")));
    } finally {
      setBusy(false);
    }
  };

  const changeLevel = async (record: AccessRecord, next: ShareLevel) => {
    setEditing(null);
    if (!client || serverId === null || record.permissionLevel === next) return;
    try {
      await updateHostAccess(client, serverId, record.id, next);
      setAccess((prev) =>
        (prev ?? []).map((r) =>
          r.id === record.id ? { ...r, permissionLevel: next } : r,
        ),
      );
      toast.success(t("hostAccess.updated"));
    } catch (e) {
      toast.error(errorText(e, t("hostAccess.couldNotUpdate")));
    }
  };

  const revoke = async (record: AccessRecord) => {
    setEditing(null);
    if (!client || serverId === null) return;
    const ok = await confirm({
      title: t("hostAccess.removeTitle", { name: targetName(record) }),
      description: t("hostAccess.removeHint"),
      confirmLabel: t("hostAccess.remove"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await revokeHostAccess(client, serverId, record.id);
      setAccess((prev) => (prev ?? []).filter((r) => r.id !== record.id));
      toast.success(t("hostAccess.removed"));
    } catch (e) {
      toast.error(errorText(e, t("hostAccess.couldNotRemove")));
    }
  };

  const toggle = <T,>(set: Set<T>, value: T, on: boolean): Set<T> => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };

  const muted = color("muted-foreground");

  return (
    <Screen
      title={t("hostAccess.title")}
      subtitle={host?.name || host?.ip}
      onBack={() => router.back()}
    >
      {error ? (
        <EmptyState title={error} />
      ) : (
        <>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Section title={t("hostAccess.whoHasAccess")}>
              {access === null ? (
                <Text className="py-3 text-meta text-muted-foreground">
                  {t("hostAccess.loading")}
                </Text>
              ) : access.length === 0 ? (
                <Text className="py-3 text-meta text-muted-foreground">
                  {t("hostAccess.nobodyYet")}
                </Text>
              ) : null}
            </Section>
            {(access ?? []).map((record, index) => (
              <ListRow
                key={record.id}
                index={index}
                icon={
                  record.targetType === "user" ? (
                    <User size={16} color={muted} />
                  ) : (
                    <Shield size={16} color={muted} />
                  )
                }
                title={targetName(record)}
                meta={
                  <Text className="text-meta text-muted-foreground">
                    {[
                      levelLabel(record.permissionLevel),
                      untilText(record.expiresAt),
                      record.grantedByUsername
                        ? t("hostAccess.sharedBy", {
                            name: record.grantedByUsername,
                          })
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  </Text>
                }
                onPress={() => setEditing(record)}
                accessibilityLabel={t("hostAccess.changeAccessFor", {
                  name: targetName(record),
                })}
              />
            ))}

            <Section title={t("hostAccess.shareWith")}>
              <View className="gap-2 py-2">
                <Tabs
                  options={[
                    { id: "user", label: t("hostAccess.users") },
                    { id: "role", label: t("hostAccess.roles") },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                <Input
                  value={search}
                  onChangeText={setSearch}
                  placeholder={
                    tab === "user"
                      ? t("hostAccess.searchUsers")
                      : t("hostAccess.searchRoles")
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </Section>
            {tab === "user" ? (
              shownUsers.length === 0 ? (
                <Text className="px-3 py-3 text-meta text-muted-foreground">
                  {t("hostAccess.noUsers")}
                </Text>
              ) : (
                shownUsers.map((u, index) => (
                  <ListRow
                    key={u.id}
                    index={index}
                    title={u.username}
                    selected={pickedUsers.has(u.id)}
                    onPress={() =>
                      setPickedUsers((s) => toggle(s, u.id, !s.has(u.id)))
                    }
                    trailing={
                      <Checkbox
                        checked={pickedUsers.has(u.id)}
                        onChange={(on) =>
                          setPickedUsers((s) => toggle(s, u.id, on))
                        }
                        accessibilityLabel={u.username}
                      />
                    }
                  />
                ))
              )
            ) : shownRoles.length === 0 ? (
              <Text className="px-3 py-3 text-meta text-muted-foreground">
                {t("hostAccess.noRoles")}
              </Text>
            ) : (
              shownRoles.map((r, index) => (
                <ListRow
                  key={r.id}
                  index={index}
                  title={r.name}
                  selected={pickedRoles.has(r.id)}
                  onPress={() =>
                    setPickedRoles((s) => toggle(s, r.id, !s.has(r.id)))
                  }
                  trailing={
                    <Checkbox
                      checked={pickedRoles.has(r.id)}
                      onChange={(on) =>
                        setPickedRoles((s) => toggle(s, r.id, on))
                      }
                      accessibilityLabel={r.name}
                    />
                  }
                />
              ))
            )}

            <Section title={t("hostAccess.options")}>
              <ChoiceRow
                label={t("hostAccess.level")}
                description={levelHint(level)}
                value={level}
                options={SHARE_LEVELS.map((l) => ({
                  value: l,
                  label: levelLabel(l),
                  description: levelHint(l),
                }))}
                onChange={setLevel}
              />
              <ChoiceRow
                label={t("hostAccess.expires")}
                value={expiry}
                options={EXPIRY.map((e) => ({
                  value: e.value,
                  label: t(`hostAccess.expiry.${e.value}`),
                }))}
                onChange={setExpiry}
                last
              />
            </Section>
          </ScrollView>
          <View className="border-t border-border bg-background px-3 py-2">
            <Button
              onPress={() => void share()}
              loading={busy}
              disabled={picked === 0 || serverId === null}
            >
              {picked === 0
                ? t("hostAccess.pickSomeone")
                : t("hostAccess.shareCount", { count: picked })}
            </Button>
          </View>
        </>
      )}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? targetName(editing) : ""}
        scroll
      >
        {editing
          ? SHARE_LEVELS.map((l) => (
              <SheetRow
                key={l}
                label={levelLabel(l)}
                description={levelHint(l)}
                selected={editing.permissionLevel === l}
                onPress={() => void changeLevel(editing, l)}
              />
            ))
          : null}
        {editing ? (
          <SheetRow
            label={t("hostAccess.removeAccess")}
            destructive
            onPress={() => void revoke(editing)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
