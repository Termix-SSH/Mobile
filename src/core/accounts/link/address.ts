import { t } from "@/i18n";

/**
 * Turns what the user typed into a server address. A missing scheme means
 * https, and a path the server lives under is kept.
 */
export type AddressCheck =
  { ok: true; url: string; insecure: boolean } | { ok: false; message: string };

const HOST =
  /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(:\d{1,5})?$/i;

export function checkServerAddress(text: string): AddressCheck {
  let value = text.trim();
  if (!value)
    return {
      ok: false,
      message: t("accounts.link.address.enterYourServerSAddress"),
    };
  if (/\s/.test(value)) {
    return {
      ok: false,
      message: t("accounts.link.address.theAddressCanTHave"),
    };
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  const scheme = value.slice(0, value.indexOf(":")).toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return { ok: false, message: t("accounts.link.address.useAnHttpOrHttps") };
  }
  const rest = value.slice(scheme.length + 3);
  const slash = rest.indexOf("/");
  const host = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "" : rest.slice(slash).replace(/[?#].*$/, "");
  if (!HOST.test(host)) {
    return {
      ok: false,
      message: t("accounts.link.address.thatDoesnTLookLike"),
    };
  }
  const port = host.match(/:(\d+)$/)?.[1];
  if (port && (Number(port) < 1 || Number(port) > 65535)) {
    return { ok: false, message: t("accounts.link.address.thePortMustBeFrom") };
  }
  return {
    ok: true,
    url: `${scheme}://${host}${path}`.replace(/\/+$/, ""),
    insecure: scheme === "http",
  };
}
