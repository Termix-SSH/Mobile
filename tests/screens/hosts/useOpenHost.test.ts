import { primaryAction } from "@/screens/hosts/useOpenHost";

const ctx = { account: { id: "local", kind: "local" }, client: null } as any;
const action = (id: string, group: "connect" | "manage", ok: boolean) =>
  ({
    id,
    label: id,
    icon: () => null,
    group,
    order: 0,
    isAvailable: () => ok,
    run: jest.fn(),
  }) as any;

test("one tap runs the first connect action the host has", () => {
  const host = { id: 1 } as any;
  const actions = [
    action("edit", "manage", true),
    action("terminal", "connect", false),
    action("rdp", "connect", true),
  ];
  expect(primaryAction(host, actions, ctx)?.id).toBe("rdp");
  expect(primaryAction(host, [action("edit", "manage", true)], ctx)).toBeNull();
});
