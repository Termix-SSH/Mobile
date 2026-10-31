// Pull down at the top to reload, and links that leave the server open in
// the phone's browser instead of the web view.

const PULL = 80;

function scrolledToTop(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.documentElement) {
    if (node.scrollTop > 0) return false;
    node = node.parentElement;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

export function watchGestures(options: {
  onRefresh: () => void;
  onLink: (url: string) => void;
  origin: string;
}): () => void {
  const bar = document.createElement("div");
  bar.className = "termix-pull";
  document.body.appendChild(bar);

  let startY: number | null = null;
  let pulled = 0;

  const show = (amount: number) => {
    bar.style.height = `${Math.min(amount, PULL) / 20}px`;
    bar.style.opacity = amount >= PULL ? "1" : "0.5";
  };

  const onStart = (event: TouchEvent) => {
    startY =
      event.touches.length === 1 && scrolledToTop(event.target)
        ? event.touches[0].clientY
        : null;
    pulled = 0;
  };
  const onMove = (event: TouchEvent) => {
    if (startY === null) return;
    pulled = event.touches[0].clientY - startY;
    if (pulled > 0) show(pulled);
  };
  const onEnd = () => {
    if (startY !== null && pulled >= PULL) options.onRefresh();
    startY = null;
    pulled = 0;
    show(0);
  };

  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    // A jump within the page stays; anything else would replace the page.
    if (
      url.origin === location.origin &&
      url.pathname === location.pathname &&
      url.hash
    ) {
      return;
    }
    event.preventDefault();
    options.onLink(url.href);
  };

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: true });
  document.addEventListener("touchend", onEnd);
  document.addEventListener("touchcancel", onEnd);
  document.addEventListener("click", onClick, true);
  const open = window.open;
  window.open = ((url?: string | URL) => {
    if (url) options.onLink(new URL(String(url), options.origin).href);
    return null;
  }) as typeof window.open;

  return () => {
    document.removeEventListener("touchstart", onStart);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    document.removeEventListener("touchcancel", onEnd);
    document.removeEventListener("click", onClick, true);
    window.open = open;
    bar.remove();
  };
}
