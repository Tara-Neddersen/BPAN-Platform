export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  digest_enabled: boolean;
  digest_hour: number;
  last_digest_at: string | null;
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface Paper {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  abstract: string;
  doi: string | null;
  citationCount?: number;
  influentialCitationCount?: number;
  tldr?: string;
}

export interface PubMedSearchResult {
  papers: Paper[];
  totalCount: number;
  query: string;
}

export interface SavedPaper {
  id: string;
  user_id: string;
  pmid: string;
  title: string;
  authors: string[];
  journal: string | null;
  pub_date: string | null;
  abstract: string | null;
  doi: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  paper_id: string;
  highlight_text: string | null;
  content: string;
  note_type: string;
  tags: string[];
  page_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface NoteWithPaper extends Note {
  saved_papers: {
    title: string;
    pmid: string;
    journal: string | null;
  };
}

// ─── Phase 3: AI Research Advisor ────────────────────────────────────────────

export interface ResearchContext {
  id: string;
  user_id: string;
  thesis_title: string | null;
  thesis_summary: string | null;
  aims: string[];
  key_questions: string[];
  model_systems: string[];
  key_techniques: string[];
  created_at: string;
  updated_at: string;
}

export interface AdvisorConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AdvisorMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context_used: Record<string, unknown>;
  created_at: string;
}

export interface Hypothesis {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: "pending" | "supported" | "refuted" | "revised";
  evidence_for: string[];
  evidence_against: string[];
  related_paper_ids: string[];
  aim: string | null;
  created_at: string;
  updated_at: string;
}
