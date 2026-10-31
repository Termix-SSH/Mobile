// Copy of Plugin-SSH-Terminal src/backend/shell-cwd.ts. A test keeps them the same.

/**
 * Prints the working directory of the interactive shell on the same SSH
 * connection. An exec channel starts in the home directory, but it shares
 * the connection with the terminal's shell. Ways to find that shell, tried
 * in order, all under sh whatever the login shell is:
 *
 * 1. By SSH_CONNECTION. sshd gives every process of a connection the same
 *    value, so the shell is the process with a tty that carries ours. This
 *    does not depend on how sshd lays out its processes.
 * 2. From /proc: walk up from this process to the first ancestor with a
 *    child that has a controlling tty.
 * 3. With ps, for systems where /proc gave nothing.
 *
 * The directory read is the shell's foreground process group, so it is right
 * while something like vim runs. Falls back to the exec's own directory where
 * /proc is missing (macOS, BSD).
 */

// Reads a stat line: state, ppid, pgrp, session, tty_nr, tpgid follow ") ".
const BY_CONNECTION = [
  'if [ -n "$SSH_CONNECTION" ] && [ -d /proc/self ]; then',
  'for e in $(grep -lzxF "SSH_CONNECTION=$SSH_CONNECTION" /proc/[0-9]*/environ 2>/dev/null); do',
  'p=${e%/environ}; s=$(cat "$p/stat" 2>/dev/null) || continue;',
  "s=${s##*) }; set -- $s;",
  '[ -n "$5" ] && [ "$5" != 0 ] || continue;',
  'd=$(readlink "/proc/$6/cwd" 2>/dev/null || readlink "$p/cwd" 2>/dev/null);',
  'if [ -n "$d" ]; then echo "$d"; exit 0; fi;',
  "done; fi;",
].join(" ");

// The awk program is wrapped in '\'' so it can sit inside sh -c '...'. It
// reads cat's output, which skips processes that vanish mid-read (awk given
// the files itself stops on the first one that is gone).
const WALK_AWK = String.raw`{ n=$1; s=$0; sub(/^.*\) /,"",s); split(s,f," "); par[n]=f[2]; tty[n]=f[5]; fg[n]=f[6] } END { a=p; for (d=0; d<5 && a!=""; d++) { best=""; for (k in par) if (par[k]==a && tty[k]!=0 && (best=="" || k+0<best+0)) best=k; if (best!="") { if (fg[best]>0) print fg[best]; print best; exit } a=par[a] } }`;

const BY_WALK = [
  "if [ -d /proc/self ]; then",
  `for f in $(cat /proc/[0-9]*/stat 2>/dev/null | awk -v p=$PPID '\\''${WALK_AWK}'\\''); do`,
  'd=$(readlink "/proc/$f/cwd" 2>/dev/null);',
  'if [ -n "$d" ]; then echo "$d"; exit 0; fi;',
  "done; fi;",
].join(" ");

const BY_PS = [
  "p=$PPID; i=0; found=;",
  "while [ $i -lt 4 ]; do",
  'case "$(ps -o comm= -p "$p" 2>/dev/null)" in *sshd*) found=1; break;; esac;',
  'p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d " "); i=$((i+1));',
  "done;",
  '[ -n "$found" ] || { pwd; exit 0; };',
  'for c in $(ps -o pid= --ppid "$p" 2>/dev/null); do',
  't=$(ps -o tty= -p "$c" 2>/dev/null | tr -d " ");',
  'if [ -z "$t" ] || [ "$t" = "?" ]; then continue; fi;',
  'f=$(ps -o tpgid= -p "$c" 2>/dev/null | tr -d " ");',
  'd=$(readlink "/proc/$f/cwd" 2>/dev/null || readlink "/proc/$c/cwd" 2>/dev/null);',
  'if [ -n "$d" ]; then echo "$d"; exit 0; fi;',
  "done; pwd",
].join(" ");

export const SHELL_CWD_COMMAND = `sh -c '${BY_CONNECTION} ${BY_WALK} ${BY_PS}'`;
