const assert = require("node:assert/strict");
const {
  restrictOidcCallbackIntentFilters,
} = require("../plugins/withOidcCallbackIntentFilter.js");

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
              {
                data: [{ $: { "android:scheme": "https" } }],
              },
            ],
          },
        ],
      },
    ],
  },
};

restrictOidcCallbackIntentFilters(manifest);

const filters = manifest.manifest.application[0].activity[0]["intent-filter"];
assert.deepEqual(
  filters[0].data.map((d) => [d.$["android:scheme"], d.$["android:host"]]),
  [
    ["termix-mobile", "oidc-callback"],
    ["termix-mobile", "widget"],
    ["exp+termix", "oidc-callback"],
    ["exp+termix", "widget"],
  ],
);
assert.equal(filters[1].data[0].$["android:host"], undefined);

console.log(
  "App scheme intent filters are restricted to oidc-callback and widget",
);
