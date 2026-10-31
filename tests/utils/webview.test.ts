import { inlineJson, stayOnLocalPage } from "@/utils/webview";

test("inline JSON can't close the script tag", () => {
  const out = inlineJson("wss://t/x?token=</script><script>alert(1)</script>");
  expect(out).not.toContain("</script>");
  expect(JSON.parse(out)).toBe(
    "wss://t/x?token=</script><script>alert(1)</script>",
  );
});

test("an app built page never leaves for another site", () => {
  expect(stayOnLocalPage({ url: "about:blank" })).toBe(true);
  expect(stayOnLocalPage({ url: "data:text/html,hi" })).toBe(true);
  expect(stayOnLocalPage({ url: "blob:abc" })).toBe(true);
  expect(stayOnLocalPage({ url: "https://evil.example/" })).toBe(false);
  expect(stayOnLocalPage({ url: "file:///etc/hosts" })).toBe(false);
});
