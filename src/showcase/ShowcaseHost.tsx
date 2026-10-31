import { useEffect, useRef } from "react";
import { PixelRatio } from "react-native";
import { useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppContext } from "@/contexts/AppContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useTheme } from "@/contexts/ThemeContext";
import { LOCAL_ACCOUNT_ID } from "@/core/accounts/types";
import { setConsent } from "@/core/analytics/consent";
import { repositoriesFor } from "@/core/data/repositories";
import { localStores } from "@/core/db/stores";
import { markOnboardingDone } from "@/core/onboarding";
import { FrameMonitor } from "@/modules/termix-frame-monitor";
import type { SSHHost } from "@/types";
import { SHOWCASE } from "./enabled";
import { findScenario, tour, type ShowcaseControl } from "./scenarios";
import { seedShowcase } from "./seed";
import { setFirstCommand } from "./shell";
import { parseShowcaseUrl } from "./url";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Time for lists, charts and the terminal to draw before the shot. */
const SETTLE_MS = 3000;

/** The capture scripts wait for these lines in the device log. */
function log(line: string) {
  FrameMonitor?.log(`SHOWCASE_${line}`);
  console.log(`SHOWCASE_${line}`);
}

async function localReady(timeoutMs = 20_000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const s = localStores.getState();
    if (s.available && s.unlocked) return true;
    await wait(100);
  }
  return false;
}

/**
 * Showcase builds only: reads the scenario the capture script launched the
 * app with, seeds This device and opens the screen to capture.
 */
export function ShowcaseHost() {
  const nav = useRootNavigationState();
  const app = useAppContext();
  const theme = useTheme();
  const tabs = useTerminalSessions();
  const insets = useSafeAreaInsets();
  const latest = useRef({ app, theme, tabs, insets });
  latest.current = { app, theme, tabs, insets };
  const started = useRef(false);

  useEffect(() => {
    if (!SHOWCASE || started.current || !nav?.key || app.isLoading) return;
    const launch = parseShowcaseUrl(FrameMonitor?.launchUrl());
    if (!launch) return;
    started.current = true;

    // Pixel insets let the capture crop off the status bar and home bar.
    // An unfolded iPhone Duo has its status bar on the side.
    const insets = () => {
      const { top, bottom, left, right } = latest.current.insets;
      const px = (n: number) => Math.round(n * PixelRatio.get());
      return `insets=${[top, bottom, left, right].map(px).join(",")}`;
    };
    const run = async () => {
      const t0 = Date.now();
      await setConsent("off");
      await markOnboardingDone();
      latest.current.theme.setTheme(launch.theme);
      latest.current.theme.setAccent(launch.accent);
      if (latest.current.app.welcomeVisible) {
        latest.current.app.finishWelcome("standalone");
      }
      if (!(await localReady())) {
        log("FAILED local store not open");
        return;
      }
      const repos = repositoriesFor(
        { id: LOCAL_ACCOUNT_ID, kind: "local" },
        null,
      );
      const hosts = await seedShowcase(repos);
      latest.current.tabs.closeAllSessions();
      setFirstCommand("fastfetch");
      await wait(500);

      const ctl: ShowcaseControl = {
        host(name) {
          const host = hosts.get(name);
          if (!host) throw new Error(`No showcase host ${name}`);
          return host as SSHHost;
        },
        async open(host, type) {
          await latest.current.tabs.navigateToSessions(host, type, {
            quiet: true,
          });
          await wait(300);
        },
        sessionIds: () => latest.current.tabs.sessions.map((s) => s.id),
        activate: (id) => latest.current.tabs.setActiveSession(id),
        wait,
        mark: (name) => log(`MARK ${name} ${Date.now() - t0}`),
      };

      if (launch.video) {
        log(`START ${Date.now() - t0} ${insets()}`);
        await tour(ctl);
        log(`DONE ${Date.now() - t0}`);
        return;
      }
      const scenario = findScenario(launch.scenario);
      if (!scenario) {
        log(`FAILED unknown scenario ${launch.scenario}`);
        return;
      }
      await scenario.setup(ctl);
      await wait(SETTLE_MS);
      log(`READY ${scenario.id} ${insets()}`);
    };
    run().catch((e) => log(`FAILED ${e instanceof Error ? e.message : e}`));
  }, [nav?.key, app.isLoading]);

  return null;
}
