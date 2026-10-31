# Ghostty zsh shell integration — bootstrap.
#
# Copyright (c) 2026 @Lakr233
# SPDX-License-Identifier: MIT
#
# Written from scratch for libghostty-spm. Not derived from Ghostty's or
# Kitty's zsh integration (both GPLv3); only the environment contract is
# shared, so libghostty's exec backend and any host that mimics it can load
# this file the same way:
#
#   ZDOTDIR=<resources>/shell-integration/zsh   zsh reads this file first
#   GHOSTTY_ZSH_ZDOTDIR=<user's ZDOTDIR>         set only if the user had one
#
# This file puts ZDOTDIR back, runs the user's own .zshenv, and — for an
# interactive shell — arranges for ghostty-integration to load after .zshrc,
# so the user's prompt and hooks are already in place when ours attach.

# Where this file lives; ghostty-integration sits next to it.
typeset -g GHOSTTY_ZSH_INTEGRATION_DIR="${${(%):-%x}:A:h}"

# Restore ZDOTDIR before anything else reads it. zsh looks the variable up
# again for every later startup file, so .zprofile/.zshrc/.zlogin come from
# the user's directory, not from ours.
if [[ -n "${GHOSTTY_ZSH_ZDOTDIR+set}" ]]; then
    ZDOTDIR="$GHOSTTY_ZSH_ZDOTDIR"
    unset GHOSTTY_ZSH_ZDOTDIR
else
    unset ZDOTDIR
fi

# The user's .zshenv, which may itself relocate ZDOTDIR.
if [[ -r "${ZDOTDIR:-$HOME}/.zshenv" ]]; then
    builtin source -- "${ZDOTDIR:-$HOME}/.zshenv"
fi

if [[ -o interactive ]]; then
    # Load the integration from the first precmd: by then .zshrc has run,
    # so hooks we add land after the user's and our prompt marks survive
    # prompt frameworks that rebuild PS1 in their own precmd.
    _ghostty_deferred_init() {
        builtin unfunction _ghostty_deferred_init
        precmd_functions=(${precmd_functions:#_ghostty_deferred_init})
        # Already sourced by .zshrc: its hooks are in this cycle's snapshot.
        (( ${+_ghostty_integration_loaded} )) && return 0
        if [[ -r "$GHOSTTY_ZSH_INTEGRATION_DIR/ghostty-integration" ]]; then
            builtin source -- "$GHOSTTY_ZSH_INTEGRATION_DIR/ghostty-integration"
            # This precmd cycle iterates a snapshot of the hook list, so
            # run ours once by hand for the very first prompt.
            _ghostty_precmd
        fi
    }
    typeset -ga precmd_functions
    precmd_functions+=(_ghostty_deferred_init)
fi
