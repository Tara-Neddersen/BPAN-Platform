# BPAN Research Platform - Brainstorm & Outline

> A unified AI-powered research assistant platform for translational medical research.
> The goal: one web app that combines literature intelligence, experiment management,
> statistical analysis, and AI advising — accessible from any device.

---

## The Problem

PhD researchers (especially in translational medicine) currently juggle:
- Multiple paper search tools (PubMed, Google Scholar, Semantic Scholar)
- Separate note-taking apps (Notion, OneNote, paper notebooks)
- Spreadsheets for experiment tracking
- Standalone stats software (R, SPSS, GraphPad Prism)
- Multiple AI chat subscriptions (ChatGPT, Claude, Gemini)
- Calendar apps for experiment scheduling
- No AI advisor that understands the full picture of their research

**No platform ties all of this together.**

## What Already Exists (Competitive Landscape)

| Category | Existing Tools | Gap |
|---|---|---|
| Paper search & discovery | Elicit, Consensus, PubMed.ai, Semantic Scholar | No experiment tracking, no stats, no advising |
| Paper annotation & notes | Paperguide, SciSpace, Otio | No experiment management, no analysis |
| Electronic lab notebooks | Labguru, SciNote, eLabFTW, Scispot | No AI paper search, no AI advisor |
| Statistics & plotting | R, Python, SPSS, GraphPad Prism | Manual, standalone, not connected |
| Multi-LLM access | OpenRouter, Helicone, LiteLLM | Infrastructure only, not a research tool |

**The gap:** Nobody has built the unified "AI research brain" that bridges literature
intelligence and lab work with an AI advisor layer on top.

---

## Platform Modules

### Module 1: Literature Intelligence Dashboard

**Core features:**
- Keyword watchlists (e.g., "BPAN", "WDR45", "neurodegeneration iron accumulation")
- Daily digest — pulls new papers from PubMed, bioRxiv, medRxiv matching your keywords
- Semantic search — understands meaning, not just keywords
- Paper cards — title, abstract summary, key findings, relevance score
- Trend detection — "3 new papers this week on X, up from average of 1/month"

**Extended features:**
- Citation network visualization (see how papers relate)
- "Papers citing this paper" alerts — track when key papers get new citations
- Conflict detector — flags when new findings contradict your previous notes

**Data sources:** PubMed API, Semantic Scholar API, OpenAlex, bioRxiv/medRxiv APIs

### Module 2: Smart Reading & Annotation

**Core features:**
- Built-in paper viewer — pull papers from open-access sources or via institutional proxy
- Highlight-to-note — select text, AI generates structured note (finding, method, limitation)
- Smart tagging — notes auto-tagged by topic, experiment type, relevance
- Cross-paper synthesis — "show me all notes about [topic] across all papers"

**Extended features:**
- Methods extractor — pull protocol details (concentrations, timepoints, models, sample sizes)
- "How did they analyze this?" — highlight a result, get explanation of statistical approach
- Exportable annotated bibliography

### Module 3: Experiment Planner & Tracker

**Core features:**
- Experiment calendar — visual timeline of planned, in-progress, completed experiments
- Protocol templates — reusable templates for common procedures
- Reminders & notifications — push notifications for upcoming experiments, timepoints
- Dependencies — "Experiment B can't start until Experiment A results are in"

**Extended features:**
- Gantt chart view — full research timeline, overlapping experiments, thesis milestones
- Reagent/resource tracker — expiration dates, stock levels
- Protocol version history — track changes over time
- IACUC/IRB protocol tracking — approval dates, renewal reminders

### Module 4: AI Research Advisor

**Core features:**
- Knows your full research context — thesis topic, hypotheses, experiments, results, literature
- Suggests next experiments — based on data gaps, new literature, logical next steps
- Plays devil's advocate — questions your controls, identifies potential confounders
- Helps with experimental design — power analysis, appropriate controls, pitfall identification
- Weekly research review — accomplishments, open questions, priorities

**Extended features:**
- Hypothesis tracker — explicitly track hypotheses, mark as supported/refuted/pending
- Gap analysis — "based on your thesis aims, you still need data for Aim 2.3"
- Literature-to-experiment bridge — "Paper X used technique Y for your open question Z"
- Troubleshooting assistant — "my Western blot isn't working" → suggests optimizations

### Module 5: Results Analyzer

**Core features:**
- Data import — paste from spreadsheet, upload CSV/Excel, or manual entry
- Auto-detection — recognizes data type, suggests appropriate plots
- Statistical analysis — t-tests, ANOVA, mixed models, non-parametric tests
- Plain-English interpretation — "your treatment group shows a significant effect (p=0.003)"
- Publication-ready figures — journal-formatted, customizable themes, significance indicators

**Extended features:**
- Reproducibility checks — "N too low for this test", "data violates normality assumption"
- Cross-experiment comparison — overlay results from multiple experiments
- Data versioning — never lose or overwrite previous analysis
- Figure export — SVG, PNG, PDF at publication resolution
- Common plot types: bar charts, scatter, survival curves, dose-response, heatmaps, volcano plots

### Module 6: Multi-LLM Backend

**Architecture:**
- Use OpenRouter or LiteLLM as unified API gateway
- Priority chain: Claude → GPT → Gemini (with auto-fallback on rate limits)
- Task-based routing: quick summaries → cheaper model, deep analysis → best model
- Token/cost tracking dashboard

**Important note on API vs Pro subscriptions:**
- Pro subscriptions (ChatGPT Plus, Claude Pro, Gemini Advanced) give chat interface access
- API access is separate, billed per-token
- For personal research use: estimated $30-80/month in API costs
- This replaces the need for multiple Pro subscriptions

### Module 7: Additional Features

- **Grant/thesis writing assistant** — draft sections from accumulated notes and results
- **Reference manager integration** — sync with Zotero/Mendeley
- **Lab meeting prep** — auto-generate slides from recent results
- **Collaboration** — share projects with PI or lab members (permission controls)
- **Export everything** — PDF reports, CSV data, BibTeX references
- **Search across your own data** — unified search over notes, results, papers, protocols

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│ YOUR BROWSER │
│ (laptop, tablet, phone — any device, any OS) │
│ │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│ │Literature │ │ Reading │ │Experiment│ │ Results │ │
│ │Dashboard │ │& Notes │ │ Planner │ │ Analyzer │ │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘ │
│ └─────────────┴────────────┴─────────────┘ │
│ │ │
│ ┌──────────────────────┴───────────────────────────┐ │
│ │ AI Advisor (persistent sidebar) │ │
│ │ chat + proactive suggestions + context │ │
│ └──────────────────────┬───────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
 │ HTTPS
┌─────────────────────────┼────────────────────────────────┐
│ BACKEND SERVER │
│ │
│ ┌───────────────┐ ┌────────────────┐ ┌─────────────┐ │
│ │ Paper Search │ │ Stats Engine │ │ Scheduler │ │
│ │ (PubMed API, │ │ (Python: │ │ (cron jobs, │ │
│ │ Semantic │ │ scipy, │ │ daily │ │
│ │ Scholar, │ │ statsmodels, │ │ digests, │ │
│ │ OpenAlex) │ │ plotly) │ │ reminders) │ │
│ └───────────────┘ └────────────────┘ └─────────────┘ │
│ │
│ ┌───────────────────────────────────────────────────┐ │
│ │ LLM Router (LiteLLM / OpenRouter) │ │
│ │ Claude ←→ GPT ←→ Gemini (auto-fallback) │ │
│ └───────────────────────────────────────────────────┘ │
│ │
│ ┌───────────────────────────────────────────────────┐ │
│ │ DATABASE (PostgreSQL) │ │
│ │ notes, experiments, results, settings, vectors │ │
│ │ + pgvector for semantic search │ │
│ └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js (React) | Web app for all devices, large ecosystem, good for AI-assisted development |
| UI components | Tailwind CSS + shadcn/ui | Beautiful pre-built components, fast prototyping |
| Backend (main) | Next.js API routes | Unified with frontend, serverless-friendly |
| Backend (stats) | Python FastAPI microservice | scipy, statsmodels, plotly for statistical analysis and plotting |
| Database | PostgreSQL (via Supabase or Neon) | Structured data, free tier, built-in auth |
| Vector search | pgvector (Postgres extension) | Semantic search without separate service |
| LLM routing | OpenRouter or LiteLLM | Single API for all LLM providers with auto-fallback |
| Paper APIs | PubMed, Semantic Scholar, OpenAlex | Free, comprehensive, well-documented |
| Hosting | Vercel (frontend) + Railway (Python) | Affordable, easy deployment |
| Auth | Supabase Auth or Clerk | Multi-device login, OAuth, session management |
| Notifications | Web push + email (via Resend) | Experiment reminders across all devices |
| File storage | Supabase Storage or S3 | For uploaded spreadsheets, exported figures |

### Estimated Monthly Costs (Personal Use)

| Service | Cost |
|---|---|
| Vercel (frontend hosting) | Free tier |
| Railway (Python backend) | ~$5/month |
| Supabase (DB + auth + storage) | Free tier |
| LLM API calls | ~$30-80/month |
| Paper APIs | Free |
| Domain name | ~$1/month |
| **Total** | **~$35-85/month** |

---

## Suggested Build Order

Each phase produces something usable on its own:

### Phase 1: Literature Dashboard + Daily Digest
- Set up Next.js project with auth
- Integrate PubMed and Semantic Scholar APIs
- Build keyword watchlist management
- Create daily digest email/notification
- Basic paper card display with AI summaries

### Phase 2: Reading & Annotation
- Paper viewer (PDF.js or similar)
- Highlight-to-note functionality with AI
- Note organization and tagging system
- Cross-paper search across your notes

### Phase 3: AI Advisor Sidebar
- Persistent chat sidebar across all modules
- Context injection (your notes, papers, experiments feed into the AI)
- Proactive suggestion system
- Multi-LLM fallback via OpenRouter/LiteLLM

### Phase 4: Experiment Planner & Calendar
- Calendar UI with experiment scheduling
- Protocol template system
- Reminder/notification system
- Dependency tracking between experiments

### Phase 5: Results Analyzer
- Data import (CSV, Excel, paste)
- Auto-plot generation with Plotly
- Statistical test selection and execution
- AI interpretation of results
- Publication-ready figure export

### Phase 6: Polish & Extras
- Mobile responsiveness optimization
- Collaboration/sharing features
- Reference manager integration (Zotero/Mendeley)
- Grant/thesis writing assistance
- Performance optimization

---

## Institutional Paper Access (Stanford)

### How Stanford's EZProxy Works

Stanford uses EZProxy for off-campus access to paywalled journals. The proxy URL prefix is:

```
https://stanford.idm.oclc.org/login?url=
```

Any publisher URL gets prepended with this prefix, and you authenticate with your SUNet ID
once per browser session. This is the same mechanism used by Paperpile, Zotero, and
Stanford's own Lean Library browser extension.

### Three-Layer Paper Access Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ PAPER ACCESS LAYERS │
│ │
│ Layer 1: Discovery (no auth needed) │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ PubMed API, Semantic Scholar API, OpenAlex │ │
│ │ → Metadata, abstracts, citations — always free │ │
│ │ → AI can summarize, tag, include in daily digest │ │
│ │ → Covers ~100% of papers for discovery purposes │ │
│ └────────────────────────────────────────────────────────┘ │
│ │
│ Layer 2: Full-Text Reading (browser-side Stanford auth) │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ App prepends Stanford EZProxy prefix to publisher URL │ │
│ │ → Browser handles SUNet ID authentication (once) │ │
│ │ → PDF loads in built-in viewer through proxy │ │
│ │ → User can read, highlight, annotate │ │
│ │ → Same mechanism as Paperpile / Lean Library │ │
│ └────────────────────────────────────────────────────────┘ │
│ │
│ Layer 3: AI Deep Analysis (full text → AI) │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Step 1: Check Unpaywall API for open-access version │ │
│ │ → ~40-50% of recent biomedical papers have one │ │
│ │ → If found: fetch full text directly, send to AI │ │
│ │ │ │
│ │ Step 2: If no open-access version available │ │
│ │ → Paper loads in browser via Stanford EZProxy │ │
│ │ → Client-side JS extracts text from rendered PDF/HTML │ │
│ │ → Extracted text sent to backend → forwarded to AI │ │
│ │ → AI generates notes, methods extraction, analysis │ │
│ └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Settings UI

```
Settings → Institution
 University: Stanford University
 Proxy URL: https://stanford.idm.oclc.org/login?url= [auto-filled when Stanford selected]
 Status: ✓ Connected (authenticated this session)
```

The platform auto-detects Stanford and fills in the proxy prefix. First time you open a
paywalled paper, your browser redirects through Stanford SSO. You log in once with your
SUNet ID and you're set for the session.

### Important: What NOT To Do

- Never have the backend server authenticate as you to bulk-download papers
- Never store/redistribute downloaded PDFs (violates publisher terms)
- The browser is always the authenticated entity — the app just routes through the proxy
- This is the same legitimate approach used by every reference manager (Zotero, Paperpile, Mendeley)

---

## Data & LLM Architecture

**Approach: Cloud APIs for everything.** No sensitivity tiers, no local or self-hosted LLMs.
All AI tasks (paper summaries, notes, experiment analysis, advising) use cloud LLMs via
OpenRouter or LiteLLM — Claude, GPT, Gemini with auto-fallback on rate limits.

### Deployment: Cloud-Hosted

```
Frontend: Vercel (serves UI)
Backend: Railway or Render (Next.js API routes)
Database: Supabase (PostgreSQL + auth + storage)
LLMs: Cloud APIs only (Claude/GPT/Gemini via OpenRouter or LiteLLM)
Stats engine: Python FastAPI on Railway
```

**Monthly cost: ~$35-85** (Vercel free tier + Supabase free tier + Railway + LLM API usage)

### Basic Security

| Data State | Protection |
|---|---|
| **In transit** | TLS (HTTPS) for all connections |
| **At rest (database)** | Supabase encryption at rest |
| **API keys** | Environment variables, never in code |
| **Auth** | Supabase Auth or Clerk (Row-Level Security) |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ YOUR BROWSER                                                │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐      │
│ │Literature │ │ Reading  │ │Experiment│ │ Results    │      │
│ │Dashboard │ │& Notes   │ │ Planner  │ │ Analyzer   │      │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘      │
│ ┌──────────────────────┴───────────────────────────┐       │
│ │ AI Advisor (persistent sidebar)                   │       │
│ └──────────────────────┬───────────────────────────┘       │
└─────────────────────────┼─────────────────────────────────┘
 │ HTTPS
┌─────────────────────────┼─────────────────────────────────┐
│ BACKEND SERVER                                                 │
│ ┌───────────────┐ ┌────────────────┐ ┌─────────────┐           │
│ │ Paper Search  │ │ Stats Engine   │ │ Scheduler   │           │
│ │ (PubMed, etc) │ │ (Python)       │ │ (cron)      │           │
│ └───────────────┘ └────────────────┘ └─────────────┘           │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ LLM Router (LiteLLM / OpenRouter)                        │   │
│ │ Claude ←→ GPT ←→ Gemini (auto-fallback)                  │   │
│ └─────────────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ DATABASE (PostgreSQL via Supabase)                       │   │
│ │ notes, experiments, results, vectors (pgvector)          │   │
│ └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js on Vercel |
| Backend | Next.js API routes (Railway/Render) |
| Stats engine | Python FastAPI |
| Database | PostgreSQL (Supabase or Neon) |
| Vector search | pgvector |
| LLM routing | OpenRouter or LiteLLM (Claude/GPT/Gemini) |
| Auth | Supabase Auth or Clerk |
| Paper access | Stanford EZProxy (browser-side) |
| Notifications | Web push + Resend |

---

## Open Questions & Decisions

- [x] ~~Institutional paper access~~ → Stanford EZProxy with three-layer strategy (see above)
- [x] ~~Data privacy / local LLMs~~ → Cloud APIs only, no Sherlock or local inference
- [ ] Offline support — needed or always-online is fine?
- [ ] Collaboration scope — just you, or eventually share with lab members / PI?
- [ ] Mobile app — progressive web app (PWA) sufficient, or native app needed?
- [ ] Existing tools integration — need to import from any current tools you use?
