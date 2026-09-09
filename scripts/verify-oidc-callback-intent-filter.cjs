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
assert.equal(filters[0].data[0].$["android:host"], "oidc-callback");
assert.equal(filters[0].data[1].$["android:host"], "oidc-callback");
assert.equal(filters[1].data[0].$["android:host"], undefined);

console.log("OIDC callback intent filters are restricted to oidc-callback");
