#!/bin/zsh
# Create the private GitHub remote for this repository under the `thewolff` account,
# push `main`, add `thewolff-engineer` as a collaborator, and accept the invitation as
# `thewolff-engineer`, so day-to-day work needs no account switching.
#
# Run:   zsh /Users/jowolff/code/agent-system-2.0/scripts/create-remote.zsh
# Safe to re-run from the top: every step checks its own state first.
# Log:   /Users/jowolff/code/agent-system-2.0/scripts/create-remote.log
#
# Undo (printed again at the end):
#   git -C /Users/jowolff/code/agent-system-2.0 remote remove origin
#   then remove the repository on GitHub: Settings → Danger Zone (the only irreversible step)

set -e
set -o pipefail

REPO_DIR=/Users/jowolff/code/agent-system-2.0
OWNER=thewolff
COLLAB=thewolff-engineer
NAME=agent-system-2.0
LOG="$REPO_DIR/scripts/create-remote.log"
exec > >(tee "$LOG") 2>&1

step() { printf '\n==> %s\n' "$1"; }

step "0. Preconditions: gh knows both accounts; working tree is clean"
gh auth status 2>&1 | grep -q "account $OWNER"  || { echo "FAIL: gh is not logged in as $OWNER. Run: gh auth login (choose $OWNER), then re-run this script."; exit 1; }
gh auth status 2>&1 | grep -q "account $COLLAB" || { echo "FAIL: gh is not logged in as $COLLAB."; exit 1; }
[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ] || { echo "FAIL: uncommitted changes to tracked files in $REPO_DIR; commit or stash first."; git -C "$REPO_DIR" status --short --untracked-files=no; exit 1; }
ORIGINAL_ACTIVE=$(gh api user -q .login)
echo "active gh account before: $ORIGINAL_ACTIVE"

step "1. Switch gh to $OWNER"
gh auth switch --user "$OWNER"
[ "$(gh api user -q .login)" = "$OWNER" ] || { echo "FAIL: switch to $OWNER did not take."; exit 1; }

step "2. Create private repo $OWNER/$NAME (skipped if it already exists)"
if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then
  echo "exists: https://github.com/$OWNER/$NAME"
else
  gh repo create "$OWNER/$NAME" --private --description "agent-system 2.0 — requirements, research, spec, design, migration"
fi

step "3. Point origin at the new repo (https for this push; ssh afterwards)"
if git -C "$REPO_DIR" remote get-url origin >/dev/null 2>&1; then
  git -C "$REPO_DIR" remote set-url origin "https://github.com/$OWNER/$NAME.git"
else
  git -C "$REPO_DIR" remote add origin "https://github.com/$OWNER/$NAME.git"
fi

step "4. Push main as $OWNER (gh supplies the credential for this one command)"
git -C "$REPO_DIR" -c credential.helper= -c "credential.helper=!gh auth git-credential" push -u origin main

step "5. Invite $COLLAB as a collaborator with push access (idempotent)"
gh api -X PUT "repos/$OWNER/$NAME/collaborators/$COLLAB" -f permission=push >/dev/null && echo "invited (or already a collaborator)"

step "6. Switch gh to $COLLAB and accept the invitation"
gh auth switch --user "$COLLAB"
INV_ID=$(gh api /user/repository_invitations -q ".[] | select(.repository.full_name==\"$OWNER/$NAME\") | .id" | head -1)
if [ -n "$INV_ID" ]; then
  gh api -X PATCH "/user/repository_invitations/$INV_ID" >/dev/null && echo "invitation $INV_ID accepted"
else
  echo "no pending invitation (already accepted, or step 5 made $COLLAB a collaborator directly)"
fi
gh repo view "$OWNER/$NAME" --json name -q .name >/dev/null && echo "$COLLAB can see $OWNER/$NAME"

step "7. Set origin to ssh for normal use"
git -C "$REPO_DIR" remote set-url origin "git@github.com:$OWNER/$NAME.git"
git -C "$REPO_DIR" remote -v

step "8. Restore the gh account that was active before ($ORIGINAL_ACTIVE)"
gh auth switch --user "$ORIGINAL_ACTIVE"

step "DONE. Undo if needed:"
echo "  git -C $REPO_DIR remote remove origin"
echo "  then remove the repository on GitHub: Settings -> Danger Zone (irreversible; do it by hand)"
echo "Log: $LOG"
