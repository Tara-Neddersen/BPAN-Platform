# BPAN Platform

A unified AI-powered research assistant platform for translational medical research — combining literature intelligence, experiment management, statistical analysis, and AI advising.

**Repo:** [github.com/Tara-Neddersen/BPAN-Platform](https://github.com/Tara-Neddersen/BPAN-Platform)

## Contents

- **[BRAINSTORM.md](./BRAINSTORM.md)** — Full product brainstorm, module outline, technical architecture, and build order.
- **[TODO.md](./TODO.md)** — Current status and next tasks (Phase 1 remainder, then Phase 2+).

## Quick start (after cloning)

See **BRAINSTORM.md** for suggested build order. Phase 1 is: Literature Dashboard + Daily Digest (Next.js, auth, PubMed/Semantic Scholar, keyword watchlists, paper cards).

## Linking this folder to GitHub

If you created this folder locally (not via `git clone`), run in Terminal:

```bash
cd /Users/macmini/BPAN-Platform
git init
git remote add origin https://github.com/Tara-Neddersen/BPAN-Platform.git
git fetch origin
git checkout -b main origin/main   # or: git checkout -b claude/research-platform-brainstorm-lBD6a origin/claude/research-platform-brainstorm-lBD6a
git add .
git status
```

Then commit and push when ready.
