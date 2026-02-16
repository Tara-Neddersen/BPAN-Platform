# BPAN Platform — Todo & Roadmap

> Live at: https://bpan-app.vercel.app
> Repo: https://github.com/Tara-Neddersen/BPAN-Platform

---

## Phase 1: Literature Intelligence Dashboard ✅

- [x] Next.js 14 app with Supabase Auth (email/password)
- [x] Keyword watchlist management (create, edit, delete)
- [x] PubMed search with paginated results
- [x] Paper cards with metadata (title, authors, journal, date)
- [x] Save papers to personal library
- [x] AI summaries on paper cards (Google Gemini, free tier)
- [x] Semantic Scholar integration (citation counts, enriched metadata)
- [x] Daily digest system (cron job + Resend email — needs Resend API key to activate)
- [x] Protected routes with auth middleware
- [x] Nav bar with sign in/out

## Phase 2: Smart Reading & Annotation ✅

- [x] Paper library with saved papers
- [x] PDF viewer (react-pdf) with page navigation and zoom
- [x] Google Drive link integration — paste a share link, platform pulls PDF each time (zero storage cost)
- [x] Highlight-to-note — select text in PDF, AI generates structured note via Gemini
- [x] Notes sidebar with AI processing, editable before saving
- [x] Note tagging (auto-tagged by AI: finding, method, limitation, etc.)
- [x] Cross-paper notes page — view and search all notes across papers
- [x] Chrome extension for note-taking on any webpage (highlight text → AI note → save)
- [x] Manual note entry fallback
- [ ] Cross-paper synthesis — "show me all notes about [topic]" with semantic search
- [ ] Methods extractor — pull protocol details from highlighted text
- [ ] Exportable annotated bibliography

## Phase 3: AI Research Advisor Sidebar

- [ ] Persistent chat sidebar across all modules
- [ ] Context injection — feed notes, papers, and experiments into the AI
- [ ] Proactive suggestions — "based on your recent notes, you might want to look at..."
- [ ] Multi-LLM routing via OpenRouter/LiteLLM (Claude ↔ GPT ↔ Gemini fallback)
- [ ] Hypothesis tracker — mark hypotheses as supported/refuted/pending
- [ ] Gap analysis — "based on your thesis aims, you still need data for..."
- [ ] Literature-to-experiment bridge — connect papers to open questions
- [ ] Troubleshooting assistant — help debug experimental issues

## Phase 4: Experiment Planner & Calendar

- [ ] Experiment calendar — visual timeline (planned, in-progress, completed)
- [ ] Protocol templates — reusable templates for common procedures
- [ ] Reminders & notifications — upcoming experiments, timepoints
- [ ] Dependencies — "Experiment B can't start until Experiment A results are in"
- [ ] Gantt chart view — full research timeline with milestones
- [ ] Reagent/resource tracker — expiration dates, stock levels
- [ ] Protocol version history

## Phase 5: Results Analyzer

- [ ] Data import — CSV, Excel, paste from spreadsheet
- [ ] Auto-detection of data type → suggest appropriate plots
- [ ] Statistical analysis — t-tests, ANOVA, mixed models, non-parametric
- [ ] Plain-English AI interpretation of results
- [ ] Publication-ready figures (Plotly) — journal-formatted, customizable
- [ ] Reproducibility checks — sample size warnings, normality violations
- [ ] Cross-experiment comparison
- [ ] Figure export — SVG, PNG, PDF at publication resolution

## Phase 6: Polish & Extras

- [ ] Mobile responsiveness optimization
- [ ] Collaboration/sharing — share projects with PI or lab members
- [ ] Reference manager integration (Zotero/Mendeley)
- [ ] Grant/thesis writing assistant — draft sections from notes and results
- [ ] Lab meeting prep — auto-generate slides from recent results
- [ ] Performance optimization
- [ ] Unified search across notes, results, papers, protocols

---

## Infrastructure ✅

- [x] Supabase (PostgreSQL + Auth + RLS)
- [x] Vercel deployment (free tier)
- [x] GitHub repo (private)
- [x] Google Gemini AI (free tier)
- [x] OpenRouter fallback (pay-per-use, rarely used)
- [x] Google Drive for PDF storage (free, no limits)
- [x] Chrome extension with production API
- [x] Environment variables configured on Vercel
- [ ] Supabase redirect URL for production auth (manual step)
- [ ] Connect GitHub repo to Vercel for auto-deploy on push
