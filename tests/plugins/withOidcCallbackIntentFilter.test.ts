const {
  restrictOidcCallbackIntentFilters,
} = require("../../plugins/withOidcCallbackIntentFilter.js");

test("app scheme intent filters only open oidc-callback, widget and open", () => {
  const manifest = {
    manifest: {
      application: [
        {
          activity: [
            {
              "intent-filter": [
                {
                  data: [
                    { $: { "android:scheme": "termix-mobile" } },
                    { $: { "android:scheme": "exp+termix" } },
                  ],
                },
                { data: [{ $: { "android:scheme": "https" } }] },
              ],
            },
          ],
        },
      ],
    },
  };

  restrictOidcCallbackIntentFilters(manifest);

  const filters: any[] =
    manifest.manifest.application[0].activity[0]["intent-filter"];
  expect(
    filters[0].data.map((d: any) => [
      d.$["android:scheme"],
      d.$["android:host"],
    ]),
  ).toEqual([
    ["termix-mobile", "oidc-callback"],
    ["termix-mobile", "widget"],
    ["termix-mobile", "open"],
    ["exp+termix", "oidc-callback"],
    ["exp+termix", "widget"],
    ["exp+termix", "open"],
  ]);
  expect(filters[1].data[0].$["android:host"]).toBeUndefined();
});
