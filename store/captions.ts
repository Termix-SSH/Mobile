/**
 * The slides in store order, with their text. The first slide also shows the
 * logo. Keep lines short: they are read at a glance on a store page.
 */
export interface Slide {
  id: string;
  /** Raw capture(s) the slide shows. More than one fans them out. */
  shots: string[];
  title: string;
  subtitle: string;
  wideOnly?: boolean;
}

export const SLIDES: Slide[] = [
  {
    id: "hosts",
    shots: ["hosts"],
    title: "Your servers, in your pocket",
    subtitle: "Every host in one list, with live status",
  },
  {
    id: "terminal",
    shots: ["terminal"],
    title: "A real terminal, made for touch",
    subtitle: "Fast native drawing and a row of extra keys",
  },
  {
    id: "split",
    shots: ["split"],
    title: "Two sessions side by side",
    subtitle: "Split view on big screens",
    wideOnly: true,
  },
  {
    id: "files",
    shots: ["files"],
    title: "Browse and edit files",
    subtitle: "SFTP with transfers that pick up where they left off",
  },
  {
    id: "metrics",
    shots: ["metrics"],
    title: "See how your servers are doing",
    subtitle: "CPU, memory, disk and network at a glance",
  },
  {
    id: "docker",
    shots: ["docker"],
    title: "Manage your containers",
    subtitle: "Start, stop, logs and stats",
  },
  {
    id: "themes",
    shots: ["themes-light", "themes-dracula", "themes-nord"],
    title: "Make it yours",
    subtitle: "Nine themes and any accent color",
  },
  {
    id: "snippets",
    shots: ["snippets"],
    title: "Save the commands you use",
    subtitle: "Run them on one host or many",
  },
  {
    id: "home",
    shots: ["home"],
    title: "No server needed",
    subtitle: "Works on its own, or link your Termix server",
  },
];

/** Captions over the App Preview, by the marks the tour logs. */
export const PREVIEW_CAPTIONS: Record<string, string> = {
  hosts: "Every host in one list",
  terminal: "A real terminal, made for touch",
  files: "Browse and edit files",
  metrics: "See how your servers are doing",
  docker: "Manage your containers",
};
