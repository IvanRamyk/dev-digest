#!/usr/bin/env bash
# PR self review gate — PreToolUse hook for `git push` and `gh pr create`.
#
# Reads the stamp written by the pr-self-review skill and decides allow / ask / deny.
# Fails OPEN in every degraded state: a gate that breaks the push when the gate itself
# is broken gets deleted from the repo by the third person who hits it.
#
# `--hash` prints the working-state hash and exits, so the skill and this script can
# never disagree about what "fresh" means.

set -uo pipefail

STAMP_NAME='devdigest-selfreview.json'

# --- working-state hash -------------------------------------------------------
# Tracked edits alone are not enough: `git diff HEAD` cannot see an untracked file,
# so adding one would leave a stale stamp looking fresh. Fold both in.
state_hash() {
  {
    git diff HEAD 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | git hash-object --stdin 2>/dev/null
}

if [[ "${1:-}" == '--hash' ]]; then
  state_hash
  exit 0
fi

# --- fail-open preconditions --------------------------------------------------
allow_silently() { exit 0; }

command -v git >/dev/null 2>&1 || allow_silently
command -v jq  >/dev/null 2>&1 || allow_silently   # jq is not guaranteed on a teammate's machine

GIT_DIR=$(git rev-parse --absolute-git-dir 2>/dev/null) || allow_silently
STAMP="$GIT_DIR/$STAMP_NAME"

# --- read the invoking command ------------------------------------------------
HOOK_INPUT=$(cat 2>/dev/null || true)
COMMAND=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

# Documented escape hatch. There has to be a way past a false positive that is not
# "delete the hook".
case "$COMMAND" in
  *DEVDIGEST_SKIP_SELFREVIEW=1*) allow_silently ;;
esac

# Deleting a remote branch publishes no code. `--dry-run` is deliberately NOT excluded:
# it should preview the block it would hit.
case "$COMMAND" in
  *' --delete'*|*' -d '*|*' :'*) allow_silently ;;
esac

emit() {
  # $1 = allow|ask|deny   $2 = reason
  jq -cn --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}' \
    2>/dev/null || true
  exit 0
}

# --- absent stamp: ask, never deny -------------------------------------------
# A teammate who has never run this skill must still be able to push. The message has
# to make sense to someone who has never heard of the stamp.
if [[ ! -f "$STAMP" ]]; then
  emit ask \
"PR self review has not run on this branch. It routes this repo's architecture and \
security skills at your changed files and flags anything that would block a merge. \
Run the pr-self-review skill first, or continue — this is only a reminder."
fi

# --- unreadable stamp: fail open ---------------------------------------------
jq -e . "$STAMP" >/dev/null 2>&1 || allow_silently

STAMP_HEAD=$(jq -r '.head // ""'       "$STAMP" 2>/dev/null || true)
STAMP_HASH=$(jq -r '.state_hash // ""' "$STAMP" 2>/dev/null || true)
CRITICAL=$(jq -r '.by_severity.CRITICAL // 0' "$STAMP" 2>/dev/null || echo 0)

HEAD_NOW=$(git rev-parse HEAD 2>/dev/null || true)
HASH_NOW=$(state_hash)

# A stamp missing its freshness fields is malformed — do not trust it to block.
[[ -n "$STAMP_HEAD" && -n "$STAMP_HASH" ]] || allow_silently

# --- stale stamp: ask --------------------------------------------------------
if [[ "$STAMP_HEAD" != "$HEAD_NOW" || "$STAMP_HASH" != "$HASH_NOW" ]]; then
  emit ask \
"PR self review is stale — the working tree or HEAD changed since it ran, so its \
verdict no longer describes what you are about to push. Re-run the pr-self-review \
skill, or continue."
fi

# --- fresh stamp -------------------------------------------------------------
[[ "$CRITICAL" =~ ^[0-9]+$ ]] || allow_silently
(( CRITICAL > 0 )) || allow_silently   # reviewed and clean

BLOCKERS=$(jq -r \
  '(.critical // []) | .[] | "  • [\(.rule // "?")] \(.file // "?"):\(.line // 0) — \(.summary // "")"' \
  "$STAMP" 2>/dev/null || true)

emit deny \
"PR self review found $CRITICAL CRITICAL finding(s) — these block a merge, so this \
push is held back:

$BLOCKERS

Fix them, then re-run the pr-self-review skill. To override, prefix the command with \
DEVDIGEST_SKIP_SELFREVIEW=1"
