import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  Bluetooth,
  CloudCheck,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Nfc,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Usb,
} from "lucide-react-native";
import {
  deleteWebAuthnCredential,
  getCurrentServerUrl,
  getWebAuthnCredentials,
  type WebAuthnCredential,
} from "@/app/main-axios";
import { Badge, Button, Dialog, Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

/** Absolute date for "created", which rarely needs precision. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Relative age for "last used", where recency is what matters. */
function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "Never used";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const elapsed = Date.now() - date.getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Used just now";
  if (minutes < 60) return `Used ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Used ${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `Used ${days}d ago`;
  return `Used ${formatDate(iso)}`;
}

/** A synced passkey lives in a keychain; a single-device one is real hardware. */
function isSyncedPasskey(credential: WebAuthnCredential): boolean {
  return credential.deviceType === "multiDevice" || credential.backedUp;
}

/**
 * Picks the icon that best describes where the key lives. Transports are the
 * strongest signal — a key that speaks USB or NFC is a physical one.
 */
function credentialIcon(credential: WebAuthnCredential) {
  const transports = credential.transports.map((t) => t.toLowerCase());
  if (transports.includes("usb")) return Usb;
  if (transports.includes("nfc")) return Nfc;
  if (transports.includes("ble")) return Bluetooth;
  if (transports.includes("internal")) return Fingerprint;
  if (transports.includes("hybrid")) return Smartphone;
  return isSyncedPasskey(credential) ? CloudCheck : KeyRound;
}

const TRANSPORT_LABELS: Record<string, string> = {
  usb: "USB",
  nfc: "NFC",
  ble: "Bluetooth",
  internal: "Built-in",
  hybrid: "Phone",
  "smart-card": "Smart card",
  cable: "Cable",
};

export default function SecurityKeys() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();

  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<WebAuthnCredential | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [addDialog, setAddDialog] = useState(false);

  const serverUrl = getCurrentServerUrl();

  const load = useCallback(async () => {
    try {
      const result = await getWebAuthnCredentials();
      setCredentials(result.credentials);
      setFailed(false);
    } catch {
      setFailed(true);
      setCredentials([]);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const openWebInterface = useCallback(async () => {
    if (!serverUrl) {
      toast.error("No server configured.");
      return;
    }
    setAddDialog(false);
    try {
      await WebBrowser.openBrowserAsync(serverUrl);
    } catch {
      toast.error("Could not open the web interface.");
    }
  }, [serverUrl]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWebAuthnCredential(deleteTarget.id);
      setCredentials((prev) =>
        prev.filter((entry) => entry.id !== deleteTarget.id),
      );
      toast.success(`Removed ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove security key");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  /** Removing the only key can lock a passwordless account out. */
  const removingLastKey = credentials.length === 1;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-base text-foreground">
          Security Keys
        </Text>
        <Pressable
          onPress={() => setAddDialog(true)}
          hitSlop={8}
          accessibilityLabel="Add a security key"
        >
          <Plus size={20} color={color("accent-brand")} />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-2">
          <ActivityIndicator color={color("accent-brand")} />
          <Text className="text-sm text-muted-foreground">
            Loading security keys…
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={color("accent-brand")}
            />
          }
        >
          <Text className="text-xs text-muted-foreground">
            Security keys and passkeys sign you in with hardware or biometrics
            instead of a password. Keys registered on your account are listed
            here — revoke one the moment a device goes missing.
          </Text>

          {failed ? (
            <View className="items-center gap-2 border border-border bg-card p-5">
              <Text weight="medium" className="text-sm text-foreground">
                Could not load security keys
              </Text>
              <Text className="text-center text-[11px] text-muted-foreground">
                Your server may be older than the security-key feature, or it is
                unreachable right now.
              </Text>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onPress={async () => {
                  setLoading(true);
                  await load();
                  setLoading(false);
                }}
              >
                Try again
              </Button>
            </View>
          ) : credentials.length === 0 ? (
            <View className="items-center gap-2 border border-border bg-card p-6">
              <View className="mb-1 h-12 w-12 items-center justify-center border border-accent-brand/40 bg-accent-brand/10">
                <ShieldCheck size={22} color={color("accent-brand")} />
              </View>
              <Text weight="medium" className="text-sm text-foreground">
                No security keys yet
              </Text>
              <Text className="text-center text-[11px] text-muted-foreground">
                Register a hardware key or passkey to protect your account.
              </Text>
              <Button
                variant="accent"
                size="sm"
                className="mt-2"
                onPress={() => setAddDialog(true)}
                icon={<Plus size={14} color={color("accent-brand")} />}
              >
                Add a security key
              </Button>
            </View>
          ) : (
            credentials.map((credential) => {
              const Icon = credentialIcon(credential);
              const synced = isSyncedPasskey(credential);
              return (
                <View
                  key={credential.id}
                  className="flex-row items-start gap-3 border border-border bg-card p-3"
                >
                  <View className="mt-0.5 h-8 w-8 items-center justify-center border border-border bg-muted">
                    <Icon size={16} color={color("accent-brand")} />
                  </View>

                  <View className="min-w-0 flex-1 gap-1">
                    <Text
                      weight="medium"
                      className="text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {credential.name}
                    </Text>

                    <View className="flex-row flex-wrap items-center gap-1">
                      <Badge variant={synced ? "accent" : "muted"}>
                        {synced ? "Synced passkey" : "Hardware key"}
                      </Badge>
                      {credential.transports
                        .map((transport) => transport.toLowerCase())
                        .filter((transport) => TRANSPORT_LABELS[transport])
                        .map((transport) => (
                          <Badge key={transport}>
                            {TRANSPORT_LABELS[transport]}
                          </Badge>
                        ))}
                      {credential.userVerification === "required" ? (
                        <Badge variant="success">PIN or biometrics</Badge>
                      ) : null}
                    </View>

                    <Text className="text-[11px] text-muted-foreground">
                      {formatRelative(credential.lastUsedAt)} · Added{" "}
                      {formatDate(credential.createdAt)}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setDeleteTarget(credential)}
                    hitSlop={8}
                    className="mt-0.5"
                    accessibilityLabel={`Remove ${credential.name}`}
                  >
                    <Trash2 size={16} color={color("destructive")} />
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Registering a key runs a WebAuthn ceremony, which needs a browser on
          the server's own origin — so the app hands that step to the web UI. */}
      <Dialog
        visible={addDialog}
        onClose={() => setAddDialog(false)}
        title="Add a security key"
        description="Registering a key has to happen in the Termix web interface: the browser is what talks to your key or passkey provider. It appears here straight after."
        icon={<KeyRound size={15} color={color("accent-brand")} />}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setAddDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onPress={openWebInterface}
              icon={<ExternalLink size={14} color={color("accent-brand")} />}
            >
              Open web interface
            </Button>
          </>
        }
      >
        <Text className="text-[11px] text-muted-foreground">
          Sign in there, then open Profile → Security and add the key. Pull to
          refresh this screen afterwards.
        </Text>
      </Dialog>

      <Dialog
        visible={deleteTarget !== null}
        onClose={() => {
          // Don't let a backdrop tap cancel a delete that is already in flight.
          if (!deleting) setDeleteTarget(null);
        }}
        title="Remove security key"
        description={
          deleteTarget
            ? `${deleteTarget.name} will no longer be able to sign in to your account.`
            : undefined
        }
        icon={<Trash2 size={15} color={color("destructive")} />}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={deleting}
              onPress={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              loading={deleting}
              onPress={confirmDelete}
            >
              Remove
            </Button>
          </>
        }
      >
        {removingLastKey ? (
          <Text className="text-[11px] text-destructive">
            This is your last security key. Make sure you can still sign in with
            your password before removing it.
          </Text>
        ) : null}
      </Dialog>
    </View>
  );
}
