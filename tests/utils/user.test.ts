import type { AccountClient } from "@/core/api/AccountClient";
import { clearCachedUserId, getCurrentUserId } from "@/utils/user";

function client(accountId: string, userId: string) {
  const getUserInfo = jest.fn(async () => ({ userId }));
  return {
    client: {
      accountId,
      api: { auth: { getUserInfo } },
    } as unknown as AccountClient,
    getUserInfo,
  };
}

beforeEach(() => clearCachedUserId());

test("each server keeps its own user id", async () => {
  const a = client("a", "user-a");
  const b = client("b", "user-b");
  expect(await getCurrentUserId(a.client)).toBe("user-a");
  expect(await getCurrentUserId(b.client)).toBe("user-b");
  expect(await getCurrentUserId(a.client)).toBe("user-a");
  expect(a.getUserInfo).toHaveBeenCalledTimes(1);
  clearCachedUserId("a");
  await getCurrentUserId(a.client);
  expect(a.getUserInfo).toHaveBeenCalledTimes(2);
  expect(await getCurrentUserId(null)).toBeNull();
});
