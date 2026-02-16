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
- [x] Cross-paper synthesis — semantic search across notes via pgvector embeddings (Gemini text-embedding-004)
- [x] Methods extractor — extract protocol details (technique, reagents, timepoints, model, sample size) from highlighted text
- [x] Exportable annotated bibliography — export as CSV or BibTeX with annotations

## Phase 3: AI Research Advisor Sidebar ✅

- [x] Persistent chat sidebar across all modules — collapsible panel with bot icon toggle
- [x] Context injection — feeds notes, papers, hypotheses, and research context into AI
- [x] Proactive suggestions — AI generates read/experiment/question/gap suggestions
- [x] Multi-LLM routing via Gemini + OpenRouter fallback (gemini-2.0-flash → gemma-3-27b-it → Llama/Mistral/Qwen)
- [x] Hypothesis tracker — create, update status (pending/supported/refuted/revised), add evidence for/against
- [x] Gap analysis — built into advisor chat context (AI sees aims, questions, and notes gaps)
- [x] Literature-to-experiment bridge — advisor connects papers to open questions via context injection
- [x] Troubleshooting assistant — built into advisor chat (suggest troubleshooting prompts)
- [x] Research context setup — thesis title, aims, open questions, model systems, techniques
- [x] Conversation history — save, resume, and manage past advisor conversations
- [x] Auto-titled conversations — AI generates titles from first message

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
