import {
  changeServerPassword,
  deleteServerAccount,
  signOutClient,
} from "@/core/accounts/actions";
import { clearSession } from "@/core/api/webSession";
import { clearCachedUserId } from "@/utils/user";
import { resetWidgets } from "@/widgets";

jest.mock("@/core/api/webSession", () => ({ clearSession: jest.fn() }));
jest.mock("@/utils/user", () => ({ clearCachedUserId: jest.fn() }));
jest.mock("@/widgets", () => ({ resetWidgets: jest.fn() }));

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "a1",
    api: {
      auth: { logoutUser: jest.fn(async () => {}) },
      users: {
        changePassword: jest.fn(async () => {}),
        deleteAccount: jest.fn(async () => {}),
      },
      ...overrides,
    },
  } as never;
}

beforeEach(() => jest.clearAllMocks());

describe("account actions", () => {
  it("signs out on the server and on the phone", async () => {
    const client = fakeClient();
    await signOutClient(client);
    expect(clearSession).toHaveBeenCalledWith(client);
    expect(clearCachedUserId).toHaveBeenCalledWith("a1");
    expect(resetWidgets).toHaveBeenCalled();
  });

  it("still clears the phone when the server logout fails", async () => {
    const client = fakeClient({
      auth: {
        logoutUser: jest.fn(async () => {
          throw new Error("expired");
        }),
      },
    });
    await signOutClient(client);
    expect(clearSession).toHaveBeenCalled();
    expect(resetWidgets).toHaveBeenCalled();
  });

  it("changes the password through the api", async () => {
    const client = fakeClient();
    await changeServerPassword(client, "old", "new");
    expect(
      (client as never as { api: any }).api.users.changePassword,
    ).toHaveBeenCalledWith("old", "new");
  });

  it("signs out after deleting the account", async () => {
    const client = fakeClient();
    await deleteServerAccount(client, "pw");
    expect(
      (client as never as { api: any }).api.users.deleteAccount,
    ).toHaveBeenCalledWith("pw");
    expect(clearSession).toHaveBeenCalled();
  });

  it("fails without a client", async () => {
    await expect(changeServerPassword(null, "a", "b")).rejects.toThrow();
  });
});
