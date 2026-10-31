import { accounts } from "@/core/accounts";

/**
 * Reloads the plugin list of every signed in linked server, so plugins an
 * admin turned on or off show up while the app was away. `skip` is an
 * account already being checked.
 */
export async function refreshPluginLists(skip?: string): Promise<void> {
  await Promise.all(
    accounts
      .list()
      .filter((account) => account.kind === "server" && account.id !== skip)
      .map(async (account) => {
        const client = accounts.client(account.id);
        if (!client) return;
        await client.load();
        if (client.isAuthenticated()) await client.refreshEnabledPlugins();
      }),
  );
}
