# Ghostty bash shell integration.
#
# Copyright (c) 2026 @Lakr233
# SPDX-License-Identifier: MIT
#
# Written from scratch for libghostty-spm. Not derived from Ghostty's or
# Kitty's bash integration (both GPLv3). Hooks come from bash-preexec.sh
# next to this file (MIT, https://github.com/rcaloras/bash-preexec — see
# LICENSE-bash-preexec.md).
#
# Two ways in:
#
# 1. Injected. The terminal starts `bash --posix` with ENV pointing here, so
#    bash reads this file instead of its normal startup files. The contract,
#    from libghostty's termio/shell_integration.zig (hosts that spawn bash
#    themselves set the same variables):
#
#      GHOSTTY_BASH_INJECT            "1", plus any of " --norc" " --noprofile"
#                                     the terminal swallowed from the command
#      GHOSTTY_BASH_RCFILE            the argument of --rcfile / --init-file
#      GHOSTTY_BASH_ENV               the user's ENV, if there was one
#      GHOSTTY_BASH_UNEXPORT_HISTFILE the terminal exported HISTFILE only to
#                                     undo POSIX mode's ~/.sh_history default
#
#    The file leaves POSIX mode, undoes those variables, replays the startup
#    files bash would have read on its own, then attaches the hooks.
#
# 2. Sourced from a .bashrc. Only the hooks attach.
#
# What the terminal gets from the hooks, per prompt:
#
#   OSC 133 A / B / C / D   prompt start, input start, output start,
#                           command end with its exit code
#   OSC 7                   the working directory, as a file:// URL
#   OSC 2                   the title — the directory at a prompt, the
#                           command while it runs (feature `title`)
#   DECSCUSR                a bar cursor while editing, the default shape
#                           while a command runs (feature `cursor`)
#
# Features come from GHOSTTY_SHELL_FEATURES, a comma-separated list the
# terminal exports (`cursor`, `cursor:blink`, `cursor:steady`, `title`, …).
# Anything else in the list is ignored.

if [[ -n "${GHOSTTY_BASH_INJECT:-}" ]]; then
    builtin set +o posix

    _ghostty_inject="$GHOSTTY_BASH_INJECT"
    _ghostty_rcfile="${GHOSTTY_BASH_RCFILE:-}"
    builtin unset GHOSTTY_BASH_INJECT GHOSTTY_BASH_RCFILE

    if [[ -n "${GHOSTTY_BASH_ENV:-}" ]]; then
        builtin export ENV="$GHOSTTY_BASH_ENV"
    else
        builtin unset ENV
    fi
    builtin unset GHOSTTY_BASH_ENV

    if [[ -n "${GHOSTTY_BASH_UNEXPORT_HISTFILE:-}" ]]; then
        builtin export -n HISTFILE
        builtin unset GHOSTTY_BASH_UNEXPORT_HISTFILE
    fi

    _ghostty_norc=0
    _ghostty_noprofile=0
    for _ghostty_word in $_ghostty_inject; do
        case "$_ghostty_word" in
            --norc) _ghostty_norc=1 ;;
            --noprofile) _ghostty_noprofile=1 ;;
        esac
    done

    # The system files live in bash's compiled-in sysconfdir. Derive it from
    # the binary's location: /bin/bash and /usr/bin/bash → /etc,
    # /var/jb/usr/bin/bash → /var/jb/etc, /opt/homebrew/bin/bash →
    # /opt/homebrew/etc.
    _ghostty_sysconfdir="${BASH%/bin/bash}"
    _ghostty_sysconfdir="${_ghostty_sysconfdir%/usr}/etc"

    if shopt -q login_shell; then
        if (( ! _ghostty_noprofile )); then
            [[ -r "$_ghostty_sysconfdir/profile" ]] && builtin source "$_ghostty_sysconfdir/profile"
            for _ghostty_file in ~/.bash_profile ~/.bash_login ~/.profile; do
                if [[ -r "$_ghostty_file" ]]; then
                    builtin source "$_ghostty_file"
                    break
                fi
            done
        fi
    elif (( ! _ghostty_norc )); then
        for _ghostty_file in "$_ghostty_sysconfdir/bash.bashrc" "$_ghostty_sysconfdir/bashrc"; do
            if [[ -r "$_ghostty_file" ]]; then
                builtin source "$_ghostty_file"
                break
            fi
        done
        if [[ -n "$_ghostty_rcfile" ]]; then
            [[ -r "$_ghostty_rcfile" ]] && builtin source "$_ghostty_rcfile"
        elif [[ -r ~/.bashrc ]]; then
            builtin source ~/.bashrc
        fi
    fi

    builtin unset _ghostty_inject _ghostty_rcfile _ghostty_norc _ghostty_noprofile \
        _ghostty_word _ghostty_file _ghostty_sysconfdir
fi

[[ $- == *i* ]] || return 0
[[ -n "${_ghostty_integration_loaded:-}" ]] && return 0
_ghostty_integration_loaded=1

# Not a precmd: bash-preexec runs those before the pre-existing PROMPT_COMMAND
# text, so only a tail entry survives a PROMPT_COMMAND that rebuilds PS1 every
# cycle. Appended before bash-preexec installs itself so that on the first
# prompt it also precedes __bp_interactive_mode, whose flag the DEBUG trap
# spends on the next command it sees.
PROMPT_COMMAND+=$'\n_ghostty_mark_input'
builtin source "${BASH_SOURCE[0]%/*}/bash-preexec.sh"

_ghostty_prompt_end='\[\e]133;B\a\]'
_ghostty_command_ran=0

_ghostty_feature() {
    [[ ",${GHOSTTY_SHELL_FEATURES:-}," == *",$1,"* ]]
}

# Percent-encodes $PWD byte by byte for the OSC 7 URL.
_ghostty_encoded_pwd() {
    local LC_ALL=C
    local out= byte i
    for (( i = 0; i < ${#PWD}; i++ )); do
        byte="${PWD:i:1}"
        case "$byte" in
            [A-Za-z0-9/_.~-]) out+="$byte" ;;
            *) builtin printf -v byte '%%%02X' "$(( $(builtin printf '%d' "'$byte") & 0xFF ))"
               out+="$byte" ;;
        esac
    done
    builtin printf '%s' "$out"
}

_ghostty_precmd() {
    local exit_code=$?

    if (( _ghostty_command_ran )); then
        builtin printf '\033]133;D;%s\007' "$exit_code"
        _ghostty_command_ran=0
    fi

    # Prompt start goes out directly, so it lands however PS1 is built.
    builtin printf '\033]133;A\007'
    builtin printf '\033]7;file://%s%s\007' "${HOSTNAME:-}" "$(_ghostty_encoded_pwd)"

    if _ghostty_feature title; then
        local directory="$PWD"
        [[ -n "$HOME" && ( "$directory" == "$HOME" || "$directory" == "$HOME"/* ) ]] && directory="~${directory#"$HOME"}"
        builtin printf '\033]2;%s\007' "$directory"
    fi

    if _ghostty_feature cursor:steady; then
        builtin printf '\033[6 q'
    elif _ghostty_feature cursor || _ghostty_feature cursor:blink; then
        builtin printf '\033[5 q'
    fi
}

_ghostty_preexec() {
    _ghostty_command_ran=1

    if _ghostty_feature cursor || _ghostty_feature cursor:blink || _ghostty_feature cursor:steady; then
        builtin printf '\033[0 q'
    fi

    if _ghostty_feature title; then
        # The first line of the command, control characters stripped.
        local command="${1%%$'\n'*}"
        builtin printf '\033]2;%s\007' "${command//[[:cntrl:]]/}"
    fi

    builtin printf '\033]133;C\007'
}

# Input start rides on the end of PS1; re-append whenever something
# rebuilt PS1 without it.
_ghostty_mark_input() {
    if [[ "$PS1" != *"$_ghostty_prompt_end" ]]; then
        PS1="$PS1$_ghostty_prompt_end"
    fi
}

precmd_functions+=(_ghostty_precmd)
preexec_functions+=(_ghostty_preexec)
