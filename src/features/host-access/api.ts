import type { AccountClient } from "@/core/api/AccountClient";
import { t } from "@/i18n";

export type ShareLevel = "connect" | "view" | "edit" | "manage";

export const SHARE_LEVELS: ShareLevel[] = ["connect", "view", "edit", "manage"];

export interface AccessRecord {
  id: number;
  targetType: "user" | "role";
  userId: string | null;
  roleId: number | null;
  username: string | null;
  roleName: string | null;
  roleDisplayName: string | null;
  grantedBy: string;
  grantedByUsername: string;
  permissionLevel: ShareLevel;
  expiresAt: string | null;
  createdAt: string;
}

export interface ShareUser {
  id: string;
  username: string;
}

export interface ShareRole {
  id: number;
  name: string;
}

export type ShareTarget =
  { type: "user"; id: string } | { type: "role"; id: number };

export function levelLabel(level: ShareLevel): string {
  return t(`hostAccess.levels.${level}`);
}

export function levelHint(level: ShareLevel): string {
  return t(`hostAccess.levelHints.${level}`);
}

export function targetName(record: AccessRecord): string {
  if (record.targetType === "user")
    return record.username ?? record.userId ?? "";
  return (
    record.roleDisplayName || record.roleName || String(record.roleId ?? "")
  );
}

export async function getHostAccess(
  client: AccountClient,
  hostId: number,
): Promise<{ accessList: AccessRecord[]; isOwner: boolean }> {
  const res = await client.http.auth.get(`/rbac/host/${hostId}/access`);
  return {
    accessList: res.data?.accessList ?? [],
    isOwner: !!res.data?.isOwner,
  };
}

export async function shareHost(
  client: AccountClient,
  hostId: number,
  targets: ShareTarget[],
  permissionLevel: ShareLevel,
  durationHours?: number,
): Promise<void> {
  await client.http.auth.post(`/rbac/host/${hostId}/share`, {
    targets,
    permissionLevel,
    ...(durationHours ? { durationHours } : {}),
  });
}

export async function updateHostAccess(
  client: AccountClient,
  hostId: number,
  accessId: number,
  permissionLevel: ShareLevel,
): Promise<void> {
  await client.http.auth.patch(`/rbac/host/${hostId}/access/${accessId}`, {
    permissionLevel,
  });
}

export async function revokeHostAccess(
  client: AccountClient,
  hostId: number,
  accessId: number,
): Promise<void> {
  await client.http.auth.delete(`/rbac/host/${hostId}/access/${accessId}`);
}

/** People and roles this account can share with, without itself and system roles. */
export async function getShareTargets(
  client: AccountClient,
  myUserId?: string | null,
): Promise<{ users: ShareUser[]; roles: ShareRole[] }> {
  const [usersRes, rolesRes] = await Promise.all([
    client.http.auth.get("/users/list").catch(() => null),
    client.http.auth.get("/rbac/roles").catch(() => null),
  ]);
  const rawUsers: { id?: string; userId?: string; username?: string }[] =
    usersRes?.data?.users ?? [];
  const rawRoles: {
    id: number;
    name: string;
    displayName?: string;
    isSystem?: boolean;
  }[] = rolesRes?.data?.roles ?? [];
  return {
    users: rawUsers
      .map((u) => ({
        id: String(u.id ?? u.userId ?? ""),
        username: u.username ?? "",
      }))
      .filter((u) => u.id && u.username && u.id !== myUserId),
    roles: rawRoles
      .filter((r) => !r.isSystem)
      .map((r) => ({ id: Number(r.id), name: r.displayName || r.name })),
  };
}

export function errorText(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}
