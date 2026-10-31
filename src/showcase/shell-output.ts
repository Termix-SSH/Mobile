// Canned terminal output for the showcase shell. Kept under 44 columns so it
// fits a phone in portrait without wrapping.

const CSI = "\x1b[";
const reset = `${CSI}0m`;
const c = (code: string, text: string) => `${CSI}${code}m${text}${reset}`;
const bold = (t: string) => c("1", t);
const dim = (t: string) => c("2", t);
const green = (t: string) => c("32", t);
const bgreen = (t: string) => c("1;32", t);
const blue = (t: string) => c("1;34", t);
const cyan = (t: string) => c("36", t);
const yellow = (t: string) => c("33", t);
const red = (t: string) => c("31", t);
const orange = (t: string) => c("38;2;245;145;69", t);
const magenta = (t: string) => c("35", t);

const lines = (...rows: string[]) => rows.join("\r\n") + "\r\n";

export function prompt(user: string, host: string, cwd = "~"): string {
  return `${bgreen(`${user}@${host}`)}:${blue(cwd)}$ `;
}

// The motd and fastfetch fill a still shot's terminal, so they stay under
// 30 columns for the half screen terminal on an unfolded iPhone Duo.
export function motd(host: string): string {
  return lines(
    dim("Linux " + host + " 6.12.0"),
    "",
    `  ${bold("Load")}     0.42  ${bold("Users")} 1`,
    `  ${bold("Memory")}   38%   ${bold("Disk")}  61%`,
    `  ${bold("Updates")}  ${green("0 pending")}`,
    "",
    dim("Last login: Oct 27 09:12"),
  );
}

function fastfetch(user: string, host: string): string {
  const logo = [
    orange("┌──────┐ "),
    orange("│ >_   │ "),
    orange("│      │ "),
    orange("└──┬───┘ "),
    orange(" ──┴──   "),
    "         ",
    "         ",
    "         ",
  ];
  const info = [
    `${bold(cyan(user))}@${bold(cyan(host))}`,
    dim("────────────────"),
    `${cyan("OS")}      Debian 13`,
    `${cyan("Kernel")}  6.12.0`,
    `${cyan("Uptime")}  41 days`,
    `${cyan("CPU")}     Ryzen 7`,
    `${cyan("Memory")}  12/31 GiB`,
    `${cyan("Disk")}    286/468 GiB`,
  ];
  const palette =
    "         " +
    ["40", "41", "42", "43", "44", "45", "46", "47"]
      .map((b) => `${CSI}${b}m  `)
      .join("") +
    reset;
  return lines(...logo.map((l, i) => l + info[i]), "", palette);
}

const DOCKER_PS = lines(
  bold("NAME          STATUS        PORTS"),
  `${cyan("nginx")}         ${green("Up 12 days")}    80,443`,
  `${cyan("termix")}        ${green("Up 12 days")}    8080`,
  `${cyan("postgres")}      ${green("Up 12 days")}    5432`,
  `${cyan("redis")}         ${green("Up 12 days")}    6379`,
  `${cyan("grafana")}       ${green("Up 3 days")}     3000`,
  `${cyan("prometheus")}    ${green("Up 3 days")}     9090`,
  `${cyan("backup")}        ${yellow("Exited (0)")}`,
);

const GIT_LOG = lines(
  `${red("*")} ${yellow("a41c2e9")} ${c("1;36", "(HEAD -> main)")} Add metrics`,
  `${red("*")} ${yellow("9f02b1d")} Fix nginx cache headers`,
  `${red("|")}${green("\\")}`,
  `${red("|")} ${green("*")} ${yellow("77ad310")} New deploy script`,
  `${red("|")}${green("/")}`,
  `${red("*")} ${yellow("e5c8d04")} Bump postgres to 17`,
  `${red("*")} ${yellow("3b6f9aa")} Initial compose stack`,
);

const LS = lines(
  dim("total 48"),
  `drwxr-xr-x  ${blue(".config")}`,
  `drwxr-xr-x  ${blue("backups")}`,
  `drwxr-xr-x  ${blue("stacks")}`,
  `-rw-r--r--  .bashrc`,
  `-rw-r--r--  ${magenta("compose.yml")}`,
  `-rwxr-xr-x  ${bgreen("deploy.sh")}`,
  `-rw-r--r--  notes.md`,
);

const DF = lines(
  bold("Filesystem  Size  Used  Avail  Use%"),
  `/dev/nvme0  468G  286G   182G   ${yellow("61%")}`,
  `/dev/sda1   3.6T  1.9T   1.7T   ${green("52%")}`,
  `tmpfs        16G  1.2M    16G    ${green("1%")}`,
);

const NGINX = lines(
  `${green("●")} nginx.service - web server`,
  `   Loaded: loaded (enabled)`,
  `   Active: ${bgreen("active (running)")} 12d ago`,
  `   Memory: 18.4M`,
  "",
  dim("Oct 27 09:14 nginx: reload ok"),
);

const UPTIME = lines(" 09:41:02 up 41 days,  load: 0.42 0.38 0.31");

export function runCommand(
  cmd: string,
  user: string,
  host: string,
): string | null {
  const name = cmd.trim();
  if (!name) return "";
  if (name === "clear") return `${CSI}2J${CSI}H`;
  if (name === "fastfetch" || name === "neofetch") return fastfetch(user, host);
  if (name.startsWith("docker ps")) return DOCKER_PS;
  if (name.startsWith("git log")) return GIT_LOG;
  if (name === "ls" || name.startsWith("ls ")) return LS;
  if (name.startsWith("df")) return DF;
  if (name.startsWith("systemctl status") || name.startsWith("sudo systemctl"))
    return NGINX;
  if (name === "uptime") return UPTIME;
  if (name === "whoami") return lines(user);
  if (name === "hostname") return lines(host);
  return null;
}
