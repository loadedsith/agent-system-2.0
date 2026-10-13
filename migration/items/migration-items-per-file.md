---
title: Migration items are one file each, numbered when their PR merges
status: building
workload: wl-mv5mvvs64ahq0w
pr: none
---
Until now every PR that found a follow-up appended a numbered line to the M7 follow-ups list in MIGRATION.md. Any two open PRs doing that conflicted at the end of the list, and each picked the next free number on its own, so numbers collided.

A new item is now a file `migration/items/<slug>.md` with a four-key header (`title`, `status`, `workload`, `pr`) and no number. The file name is the item's permanent reference; cite it by that path. After the PR merges, the `migration-number` GitHub Action (`.github/workflows/migration-number.yml`, running `surface/scripts/migration-items.ts publish`) adds `number: <N>` to the header and rewrites the index block in MIGRATION.md, in a commit pushed straight to main. Published numbers are read from the numbering commits on main's first-parent history, never from a PR branch, so a revert never frees a number and a re-added item gets its old number back. `migration-items.ts check` runs in the full test suite, so a PR that writes a number by hand, edits the index, or adds an old-form item above the ceiling fails before it merges.

Cut-over: open PRs that had already appended an old-form numbered item when this change merged keep that item and its number. Those PRs append old-form items up to 120, so `LEGACY_CEILING` in `surface/src/migration-items.ts` is 120 and new files are numbered above it, starting at 121 or higher; the two forms cannot take each other's numbers. Jo, 2026-10-13: the waiting PRs convert their additions to item files when they next move. The legacy items already in MIGRATION.md keep their numbers and text, and their status updates still edit MIGRATION.md.
