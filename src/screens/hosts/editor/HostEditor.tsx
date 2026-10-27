import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  AccordionSection,
  Button,
  FakeSwitch,
  Field,
  FieldRow,
  InlineView,
  Input,
  Label,
  SettingRow,
  Tabs,
  Text,
  digits,
  useConfirm,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  useHostEditorSections,
  useHostToggles,
  type HostEditorContext,
  type HostEditorSectionDef,
  type HostFormValues,
} from "@/core/features";
import { useRepositories } from "@/core/data/hooks";
import { useActiveAccount } from "@/core/accounts";
import { formDefaults, type FormDefaults } from "@/core/hosts/defaults/form";
import type { DefaultsIndex } from "@/core/hosts/defaults/resolve";
import {
  ORIGINS,
  ORIGIN_HELP,
  ORIGIN_LABELS,
  originInputs,
  originOf,
  planConnection,
  saveOrigin,
  type ConnectionOrigin,
} from "@/core/transport";
import type { TestTarget } from "@/core/transport/test";
import { toast } from "@/utils/toast";
import type { Credential, SSHHost } from "@/types";
import { TestConnection } from "@/screens/hosts/TestConnection";
import { AuthFields } from "./AuthFields";
import { ColorIconField } from "./ColorIconField";
import { JumpHostsField } from "./JumpHostsField";
import { ParentHostField } from "./ParentHostField";
import { TagsField } from "./TagsField";
import {
  applyFormDefaults,
  EMPTY_FORM,
  folderUnder,
  formError,
  formFromHost,
  payloadFromForm,
  sortSections,
  visibleSections,
  type HostEditorForm,
} from "./model";

function Band({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <Label className="text-muted-foreground">{title}</Label>
      {children}
    </View>
  );
}

export default function HostEditor({
  visible,
  host,
  draft,
  onClose,
  onSaved,
}: {
  visible: boolean;
  host: SSHHost | null;
  draft?: Partial<SSHHost>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const color = useThemeColor();
  const confirm = useConfirm();
  const repos = useRepositories();
  const account = useActiveAccount();
  const toggles = useHostToggles();
  const allSections = useHostEditorSections();
  const isEdit = !!host;
  const picksOrigin = account.kind === "server";

  const [form, setForm] = useState<HostEditorForm>(EMPTY_FORM);
  const [sectionValues, setSectionValues] = useState<
    Record<string, HostFormValues>
  >({});
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [allHosts, setAllHosts] = useState<SSHHost[]>([]);
  // Shows the parent host picker in place of the folder.
  const [underHost, setUnderHost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectFrom, setConnectFrom] = useState<ConnectionOrigin>("auto");
  const savedOrigin = useRef<ConnectionOrigin>("auto");
  const savedSudo = useRef("");
  // What a new host was filled with from the defaults.
  const [filled, setFilled] = useState<FormDefaults>({});
  const defaultsIndex = useRef<DefaultsIndex | null>(null);
  const autoName = useRef("");
  // What the editor opened with, to tell when there are unsaved changes.
  const startForm = useRef("");
  const startValues = useRef("");
  // The host with its secrets, once loaded.
  const [full, setFull] = useState<SSHHost | null>(null);

  const set = useCallback(
    (patch: Partial<HostEditorForm>) => setForm((f) => ({ ...f, ...patch })),
    [],
  );

  // Open: load lists, the full host with its secrets, and the defaults.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    repos.credentials.list().then(
      (list) => !cancelled && setCredentials(list),
      () => {},
    );
    repos.hosts.list().then(
      (list) => !cancelled && setAllHosts(list),
      () => {},
    );
    setConnectFrom("auto");
    savedOrigin.current = "auto";
    savedSudo.current = "";
    setFilled({});
    setFull(null);
    autoName.current = host ? "" : (draft?.name ?? "");

    const fill = (source: Partial<SSHHost> | null) => {
      const next = formFromHost(source, toggles);
      const values: Record<string, HostFormValues> = {};
      for (const section of allSections) {
        values[section.id] = section.editor.read(
          (source as SSHHost | null) ?? null,
        );
      }
      setForm(next);
      setUnderHost(next.parentHostId != null);
      setSectionValues(values);
      startForm.current = JSON.stringify(next);
      startValues.current = JSON.stringify(values);
      return next;
    };

    if (host) {
      setLoading(true);
      if (picksOrigin) {
        originOf(account.id, host)
          .then((o) => {
            if (cancelled) return;
            savedOrigin.current = o;
            setConnectFrom(o);
          })
          .catch(() => {});
      }
      fill(host);
      repos.hosts
        .get(host.id)
        .then((full) => {
          if (cancelled || !full) return;
          setFull(full);
          savedSudo.current = full.sudoPassword ?? "";
          fill(full);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    } else {
      const start = fill(draft ? { ...draft } : null);
      if (repos.hostDefaults) {
        Promise.all([
          repos.hostDefaults.index(),
          start.parentHostId != null ? repos.hosts.list() : [],
        ])
          .then(([index, list]) => {
            if (cancelled) return;
            defaultsIndex.current = index;
            const found = formDefaults(
              index,
              start.parentHostId != null
                ? folderUnder(list, start.parentHostId)
                : start.folder,
            );
            setFilled(found);
            setForm((f) => {
              const next = applyFormDefaults(f, found, {});
              startForm.current = JSON.stringify(next);
              return next;
            });
          })
          .catch(() => {});
      }
    }
    return () => {
      cancelled = true;
    };
    // Sections and toggles are read once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, host, draft, repos, account.id]);

  // A new host follows the defaults of the folder it is going into. A
  // sub-host follows its parent's folder.
  const changePlace = (
    patch: Partial<Pick<HostEditorForm, "folder" | "parentHostId">>,
  ) => {
    if (isEdit || !defaultsIndex.current) {
      set(patch);
      return;
    }
    const next = { ...form, ...patch };
    const found = formDefaults(
      defaultsIndex.current,
      next.parentHostId != null
        ? folderUnder(allHosts, next.parentHostId)
        : next.folder,
    );
    setForm((f) => applyFormDefaults({ ...f, ...patch }, found, filled));
    setFilled(found);
  };
  const changeFolder = (folder: string) => changePlace({ folder });
  const switchPlace = () => {
    if (underHost) changePlace({ parentHostId: null });
    setUnderHost(!underHost);
  };

  // A Tailscale device fills the address, and the name unless one was typed.
  const pickDevice = (ip: string, deviceName: string) => {
    const typed = form.name.trim();
    if (typed && typed !== autoName.current) {
      set({ ip });
      return;
    }
    autoName.current = deviceName;
    set({ ip, name: deviceName });
  };

  const otherHosts = useMemo(
    () => allHosts.filter((h) => h.id !== host?.id),
    [allHosts, host?.id],
  );
  const context: HostEditorContext = useMemo(
    () => ({ isEdit, otherHosts, toggles: form.toggles }),
    [isEdit, otherHosts, form.toggles],
  );
  const shown = useMemo(
    () => sortSections(visibleSections(allSections, form)),
    [allSections, form],
  );
  const byGroup = (group: HostEditorSectionDef["group"]) =>
    shown.filter((s) => s.group === group);
  const protocolToggles = toggles.filter((t) => t.group === "protocol");
  const featureToggles = toggles.filter((t) => t.group === "feature");

  const dirty = () =>
    JSON.stringify(form) !== startForm.current ||
    JSON.stringify(sectionValues) !== startValues.current;

  const onBeforeClose = async () =>
    !dirty() ||
    (await confirm({
      title: "Leave without saving?",
      description: "Your changes to this host will be lost.",
      confirmLabel: "Leave",
      destructive: true,
    }));

  const sectionError = (): string | null => {
    for (const section of shown) {
      const message = section.editor.validate?.(
        sectionValues[section.id] ?? {},
      );
      if (message) return message;
    }
    return null;
  };

  const handleSave = async () => {
    const problem = formError(form, toggles) ?? sectionError();
    if (problem) {
      toast.error(problem);
      return;
    }
    const payload = payloadFromForm({
      form,
      host: full ?? host,
      toggles,
      sections: allSections,
      sectionValues,
      filledDefaults: filled,
      savedSudo: savedSudo.current,
    });
    setSaving(true);
    try {
      const saved =
        isEdit && host
          ? await repos.hosts.update(host.id, payload)
          : await repos.hosts.create(payload);
      if (
        picksOrigin &&
        form.enableSsh &&
        connectFrom !== savedOrigin.current
      ) {
        await saveOrigin(account.id, saved.id, connectFrom).catch((e) =>
          toast.error("Could not save how this host connects", e?.message),
        );
      }
      toast.success(isEdit ? "Host saved" : "Host added");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the host");
    } finally {
      setSaving(false);
    }
  };

  const testTarget = async (): Promise<TestTarget | string> => {
    if (!form.ip.trim()) return "Enter the host's address first.";
    if (!form.enableSsh) return "Turn on SSH to test the login.";
    let { username, authType, password, key, keyPassword } = form;
    let certificate: string | undefined;
    if (authType === "credential") {
      const cred = form.credentialId
        ? await repos.credentials.get(form.credentialId).catch(() => null)
        : null;
      if (!cred) return "Pick a credential first.";
      authType = cred.key ? "key" : "password";
      password = cred.password ?? "";
      key = cred.key ?? "";
      keyPassword = cred.keyPassword ?? "";
      certificate = cred.certPublicKey || undefined;
      if (!username.trim()) username = cred.username ?? "";
    }
    if (isEdit && authType === "password" && !password)
      password = full?.password ?? "";
    return {
      hostId: host?.id,
      name: form.name || form.ip,
      ip: form.ip,
      port: parseInt(form.port, 10) || 22,
      username,
      authType,
      password,
      key,
      keyPassword,
      certificate,
      jumpHostIds: form.jumpHosts,
    };
  };

  const renderSection = (section: HostEditorSectionDef, open: boolean) => {
    const Editor = section.editor.component;
    const Icon = section.icon;
    return (
      <AccordionSection
        key={section.id}
        label={section.label}
        defaultOpen={open}
        icon={
          Icon ? (
            <Icon size={14} color={color("muted-foreground")} />
          ) : undefined
        }
      >
        <View className="pt-3">
          <Editor
            host={full ?? host}
            value={sectionValues[section.id] ?? {}}
            context={context}
            onChange={(patch) =>
              setSectionValues((all) => ({
                ...all,
                [section.id]: { ...(all[section.id] ?? {}), ...patch },
              }))
            }
          />
        </View>
      </AccordionSection>
    );
  };

  const originNote =
    picksOrigin && connectFrom === "server"
      ? "The test runs from this phone. This host connects through the server, so it can still work when the phone can't reach it."
      : undefined;

  return (
    <InlineView
      open={visible}
      onClose={onClose}
      onBeforeClose={onBeforeClose}
      title={isEdit ? "Edit host" : "New host"}
      subtitle={isEdit ? host?.name : undefined}
      scroll={false}
      bare
      footer={
        <View className="flex-row gap-2">
          <Button
            variant="muted"
            className="flex-1"
            onPress={async () => (await onBeforeClose()) && onClose()}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            disabled={loading}
            onPress={handleSave}
          >
            Save
          </Button>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Band title="Host">
          <Field label="Name">
            <Input
              value={form.name}
              onChangeText={(name) => set({ name })}
              placeholder="My server"
            />
          </Field>
          <FieldRow>
            <Field label="Address" className="flex-[3]">
              <Input
                value={form.ip}
                onChangeText={(ip) => set({ ip })}
                placeholder="192.168.1.10"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Field>
            <Field label="Port" className="flex-1">
              <Input
                value={form.port}
                onChangeText={(v) => set({ port: digits(v) })}
                keyboardType="number-pad"
                placeholder="22"
              />
            </Field>
          </FieldRow>
          {!isEdit &&
          filled.port !== undefined &&
          form.port === String(filled.port) ? (
            <Text className="-mt-2 text-meta text-muted-foreground">
              Port and username come from your host defaults until you change
              them.
            </Text>
          ) : null}
          {underHost ? (
            <ParentHostField
              value={form.parentHostId}
              onChange={(parentHostId) => changePlace({ parentHostId })}
              selfId={host?.id}
              hosts={otherHosts}
            />
          ) : (
            <Field label="Folder">
              <Input
                value={form.folder}
                onChangeText={changeFolder}
                placeholder="Production"
              />
            </Field>
          )}
          <Button
            variant="link"
            size="xs"
            className="-mt-2 self-start"
            onPress={switchPlace}
          >
            {underHost ? "Use a folder instead" : "Put it under a host instead"}
          </Button>
          <TagsField tags={form.tags} onChange={(tags) => set({ tags })} />
          <SettingRow label="Pin to top" last>
            <FakeSwitch checked={form.pin} onChange={(pin) => set({ pin })} />
          </SettingRow>
          <AccordionSection label="Color and icon">
            <View className="pt-3">
              <ColorIconField
                color={form.color}
                icon={form.icon}
                onChange={(patch) => set(patch)}
              />
            </View>
          </AccordionSection>
          {byGroup("host").map((s) => renderSection(s, true))}
          <Field label="Notes">
            <Input
              value={form.notes}
              onChangeText={(notes) => set({ notes })}
              multiline
              placeholder="Anything worth remembering about this host"
              style={{ minHeight: 80 }}
            />
          </Field>
        </Band>

        <Band title="Protocols">
          <View>
            <SettingRow
              label="SSH"
              description="Terminal, files and more"
              last={protocolToggles.length === 0}
            >
              <FakeSwitch
                checked={form.enableSsh}
                onChange={(enableSsh) => set({ enableSsh })}
              />
            </SettingRow>
            {protocolToggles.map((t, i) => (
              <SettingRow
                key={t.key}
                label={t.label}
                description={t.description}
                last={i === protocolToggles.length - 1}
              >
                <FakeSwitch
                  checked={!!form.toggles[t.key]}
                  onChange={(v) =>
                    set({ toggles: { ...form.toggles, [t.key]: v } })
                  }
                />
              </SettingRow>
            ))}
          </View>
        </Band>

        {form.enableSsh ? (
          <Band title="SSH">
            <AuthFields
              form={form}
              set={set}
              credentials={credentials}
              isEdit={isEdit}
              onDevicePick={pickDevice}
            />
            <JumpHostsField
              value={form.jumpHosts}
              onChange={(jumpHosts) => set({ jumpHosts })}
              selfId={host?.id}
              hosts={otherHosts}
            />
            {picksOrigin ? (
              <Field
                label="Connect from"
                hint={
                  planConnection(connectFrom, originInputs(account.id, true))
                    .blocked?.reason ?? ORIGIN_HELP[connectFrom]
                }
              >
                <Tabs<ConnectionOrigin>
                  value={connectFrom}
                  onChange={setConnectFrom}
                  options={ORIGINS.map((id) => ({
                    id,
                    label: ORIGIN_LABELS[id],
                  }))}
                />
              </Field>
            ) : null}
            <TestConnection getTarget={testTarget} note={originNote} />
            {featureToggles.length > 0 ? (
              <View>
                <Label className="mb-1 text-muted-foreground">Features</Label>
                {featureToggles.map((t, i) => (
                  <SettingRow
                    key={t.key}
                    label={t.label}
                    description={t.description}
                    last={i === featureToggles.length - 1}
                  >
                    <FakeSwitch
                      checked={!!form.toggles[t.key]}
                      onChange={(v) =>
                        set({ toggles: { ...form.toggles, [t.key]: v } })
                      }
                    />
                  </SettingRow>
                ))}
              </View>
            ) : null}
            {byGroup("ssh").map((s) => renderSection(s, false))}
          </Band>
        ) : null}

        {byGroup("protocol").length > 0 ? (
          <Band title="Other protocols">
            {byGroup("protocol").map((s) => renderSection(s, true))}
          </Band>
        ) : null}

        {byGroup("feature").length > 0 ? (
          <Band title="More">
            {byGroup("feature").map((s) => renderSection(s, false))}
          </Band>
        ) : null}
      </ScrollView>
    </InlineView>
  );
}
