import {
  buildFramePage,
  framePolicy,
  frameThemeCss,
} from "@/core/plugins/frame-page";
import type { FrameBoot } from "@/core/plugins/frame-protocol";

const origin = "https://termix.example";

function boot(extra: Partial<FrameBoot> = {}): FrameBoot {
  return {
    summary: { id: "alerts", name: "Alerts" },
    code: "export function activate() {}",
    css: null,
    locales: {},
    view: { view: "alerts" },
    theme: { id: "dark", mode: "dark" },
    themeCss: "html.dark{}",
    basePath: "",
    ...extra,
  };
}

function bootFrom(html: string): FrameBoot {
  const start = html.indexOf("window.__termixFrameBoot=");
  const end = html.indexOf(";</script>", start);
  return JSON.parse(
    html.slice(start + "window.__termixFrameBoot=".length, end),
  );
}

test("the page can't reach the network or run outside scripts", () => {
  const policy = framePolicy(origin);
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("connect-src blob: data:");
  expect(policy).toContain("script-src 'unsafe-inline' blob:");
  expect(policy).toContain(`img-src ${origin} data: blob:`);
  expect(policy).toContain("frame-src 'none'");
  expect(policy).toContain("form-action 'none'");
  expect(policy).not.toMatch(/https?:\/\/(?!termix\.example)/);
});

test("boot data survives plugin code that tries to close the script tag", () => {
  const sep = String.fromCharCode(0x2028);
  const code = `const a = "</script><script>alert(1)</script>${sep}";`;
  const html = buildFramePage({
    script: "console.log('</script>')",
    origin,
    boot: boot({ code, basePath: "/termix" }),
  });
  // Only the two script tags the page itself writes, plus nothing injected.
  expect(html.match(/<script>/g)).toHaveLength(2);
  expect(html).not.toContain(sep);
  expect(bootFrom(html).code).toBe(code);
  expect(html).toContain('<meta name="termix-base-path" content="/termix">');
  expect(html).toContain('<html class="dark">');
});

test("theme tokens become the CSS variables core reads", () => {
  const css = frameThemeCss(
    { id: "dracula", mode: "dark" },
    { background: "40 42 54", border: "68 71 90" },
    "#f59145",
  );
  expect(css).toContain(
    "html.dracula{--background:rgb(40 42 54);--border:rgb(68 71 90);--accent-brand:#f59145;color-scheme:dark;}",
  );
  // A theme id can't break out of its selector.
  expect(frameThemeCss({ id: "x}body{", mode: "light" }, {}, "#000")).toContain(
    "html.xbody{",
  );
});
