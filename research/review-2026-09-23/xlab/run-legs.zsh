#!/bin/zsh
# Cross-lab review of REQUIREMENTS.md + PREFERENCES.md: GPT (codex) contradictions lens, Kimi cold-read lens.
# Safe to re-run from the top. Read-only against the repo; every artifact lands under $OUT.
set -u
REPO=/Users/jowolff/code/agent-system-2.0
XLAB=/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/xlab
OUT="$XLAB/run-$(date +%Y%m%d-%H%M%S)"
LOG="$OUT/run.log"
mkdir -p "$OUT"
exec > >(tee "$LOG") 2>&1
export PATH="$HOME/.kimi-code/bin:$PATH"

echo "== 0. inputs"
git -C "$REPO" rev-parse --short HEAD | tee "$OUT/head.txt"
mkdir -p "$OUT/codex-sandbox"
cp "$REPO/REQUIREMENTS.md" "$REPO/PREFERENCES.md" "$OUT/codex-sandbox/"
# Kimi gets the docs inline in the prompt with line-number prefixes, run from an empty scratch dir.
{
  cat "$XLAB/prompt-kimi-coldread.md"
  echo '## REQUIREMENTS.md'; nl -ba -w1 -s'|' "$REPO/REQUIREMENTS.md"; echo
  echo '## PREFERENCES.md'; nl -ba -w1 -s'|' "$REPO/PREFERENCES.md"
} > "$OUT/kimi-prompt.md"
mkdir -p "$OUT/kimi-scratch"
wc -c "$OUT/kimi-prompt.md"

echo "== 1. leg GPT (codex exec, read-only profile, effort high)"
( cd "$OUT/codex-sandbox" && codex exec --skip-git-repo-check \
    -c 'permissions.netro.extends=":read-only"' -c permissions.netro.network.enabled=true \
    -c 'default_permissions="netro"' -c model_reasoning_effort=high \
    -o "$OUT/gpt-contradictions.md" - < "$XLAB/prompt-codex-contradictions.md" \
    > "$OUT/gpt.log" 2>&1; echo "codex rc=$?" > "$OUT/gpt.status" ) &
PID_B=$!

echo "== 2. leg Kimi (kimi -p, highspeed model, empty scratch dir)"
( cd "$OUT/kimi-scratch" && kimi -m moonshot-ai/kimi-k2.7-code-highspeed -p "$(cat "$OUT/kimi-prompt.md")" \
    > "$OUT/kimi-coldread.md" 2> "$OUT/kimi.log"; echo "kimi rc=$?" > "$OUT/kimi.status" ) &
PID_C=$!

wait $PID_B; wait $PID_C
echo "== 3. status"
cat "$OUT/gpt.status" "$OUT/kimi.status"
wc -l "$OUT/gpt-contradictions.md" "$OUT/kimi-coldread.md"
echo "OUT=$OUT"
