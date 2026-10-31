import type { AccountClient } from "../AccountClient";

export function createWakeOnLanApi(c: AccountClient) {
  async function wakeHost(
    hostId: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await c.http.host.post(`/db/host/${hostId}/wake`);
      return response.data;
    } catch (error) {
      c.fail(error, "wake host");
    }
  }

  return { wakeHost };
}

export type WakeOnLanApi = ReturnType<typeof createWakeOnLanApi>;
