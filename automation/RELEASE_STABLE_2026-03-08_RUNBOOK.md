# Release Runbook: stable-2026-03-08

This runbook captures the exact commands for creating and pushing:

- release tag: `release-stable-2026-03-08`
- safety branch: `safe/release-stable-2026-03-08`

## Preconditions

- Run from repo root: `/Users/tahouranedaee/Desktop/BPAN-Platform`
- Ensure `git` remote `origin` is configured and you have push rights.
- Confirm your intended release commit is checked out locally.

## 1) Verify state

```bash
cd /Users/tahouranedaee/Desktop/BPAN-Platform
git fetch origin --prune
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

If working tree is not clean, either commit first or intentionally tag current commit knowing uncommitted files are excluded.

## 2) Create and push safety branch

```bash
git branch safe/release-stable-2026-03-08
git push -u origin safe/release-stable-2026-03-08
```

## 3) Create and push release tag

```bash
git tag -a release-stable-2026-03-08 -m "BPAN stable release 2026-03-08"
git push origin release-stable-2026-03-08
```

## 4) Verify on remote

```bash
git ls-remote --heads origin safe/release-stable-2026-03-08
git ls-remote --tags origin release-stable-2026-03-08
```

## 5) (Optional) Corrective commands

Delete remote tag (if created on wrong commit):

```bash
git push --delete origin release-stable-2026-03-08
```

Delete local tag:

```bash
git tag -d release-stable-2026-03-08
```

Delete remote safety branch:

```bash
git push --delete origin safe/release-stable-2026-03-08
```

Delete local safety branch:

```bash
git branch -D safe/release-stable-2026-03-08
```

## Operator note

Do not retag with the same release tag name on a different commit without explicit team sign-off.
