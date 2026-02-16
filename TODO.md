# BPAN Platform — Todo & Roadmap

## Done (Phase 1 v0)

- [x] Next.js app with auth (Supabase)
- [x] Keyword watchlist management (create, edit, delete)
- [x] PubMed search and paper cards
- [x] Protected dashboard + search results with pagination
- [x] Nav bar, sign in/out

---

## Next: Phase 1 (finish Literature Dashboard)

- [ ] **AI summaries on paper cards** — Use an LLM (e.g. Claude/GPT via OpenRouter or LiteLLM) to generate a short summary or key findings for each paper; show on the card (optional expand or always visible).
- [ ] **Semantic Scholar integration** — Add Semantic Scholar API alongside PubMed (citation count, influential citations, maybe abstract/summary). Can show extra metadata on paper cards or merge results.
- [ ] **Daily digest** — Cron/scheduled job that runs once per day: for each user, get new papers from PubMed (and optionally Semantic Scholar) for their watchlist keywords, then send an email (e.g. Resend) or in-app digest.

Pick one to start with; AI summaries give the most visible payoff, daily digest is the most “product complete” for Phase 1.

---

## Later: Phase 2 — Reading & Annotation

- [ ] Paper viewer (PDF.js or similar)
- [ ] Highlight-to-note with AI
- [ ] Note organization and tagging
- [ ] Cross-paper search over notes

## Phase 3 — AI Advisor Sidebar

- [ ] Persistent chat sidebar
- [ ] Context injection (notes, papers, experiments)
- [ ] Multi-LLM routing (OpenRouter/LiteLLM)

## Phase 4 — Experiment Planner

- [ ] Experiment calendar
- [ ] Protocol templates, reminders, dependencies

## Phase 5 — Results Analyzer

- [ ] Data import, auto-plot (Plotly), stats, AI interpretation

## Phase 6 — Polish

- [ ] Mobile responsiveness, collaboration, Zotero/Mendeley, grant writing help
