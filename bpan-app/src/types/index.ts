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

// ─── Phase 4: Experiment Planner & Calendar ──────────────────────────────────

export interface ProtocolStep {
  id: string;
  text: string;
  duration?: string;
}

export interface Protocol {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  steps: ProtocolStep[];
  version: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Experiment {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high";
  protocol_id: string | null;
  start_date: string | null;
  end_date: string | null;
  depends_on: string[];
  tags: string[];
  notes: string | null;
  aim: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentTimepoint {
  id: string;
  experiment_id: string;
  user_id: string;
  label: string;
  scheduled_at: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Reagent {
  id: string;
  user_id: string;
  name: string;
  catalog_number: string | null;
  supplier: string | null;
  lot_number: string | null;
  quantity: number | null;
  unit: string | null;
  expiration_date: string | null;
  storage_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceCalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  category: string;
  location: string | null;
  source_type: string | null;
  source_id: string | null;
  source_label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Research Ideas Board ────────────────────────────────────────────────────

export interface ResearchIdea {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source: string;
  status: "exploring" | "promising" | "dead_end" | "incorporated";
  priority: "low" | "medium" | "high";
  tags: string[];
  linked_paper_ids: string[];
  linked_note_ids: string[];
  linked_hypothesis_id: string | null;
  aim: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdeaEntry {
  id: string;
  idea_id: string;
  user_id: string;
  content: string;
  entry_type: "finding" | "question" | "thought" | "contradiction" | "next_step";
  source_paper_id: string | null;
  source_note_id: string | null;
  created_at: string;
}

export interface IdeaEntryWithSources extends IdeaEntry {
  saved_papers?: { title: string; pmid: string } | null;
  notes?: { content: string; highlight_text: string | null } | null;
}

// ─── Phase 5: Results Analyzer ───────────────────────────────────────────────

export interface DatasetColumn {
  name: string;
  type: "numeric" | "categorical" | "date" | "text";
  unit?: string;
}

export interface Dataset {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  experiment_id: string | null;
  columns: DatasetColumn[];
  data: Record<string, unknown>[];
  row_count: number;
  source: "csv" | "excel" | "paste";
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  dataset_id: string;
  name: string;
  test_type: "t_test" | "anova" | "mann_whitney" | "chi_square" | "correlation" | "descriptive";
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  ai_interpretation: string | null;
  created_at: string;
}

export interface Figure {
  id: string;
  user_id: string;
  dataset_id: string;
  analysis_id: string | null;
  name: string;
  chart_type: "bar" | "scatter" | "box" | "histogram" | "line" | "violin" | "heatmap";
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Mouse Colony Manager ────────────────────────────────────────────────────

export interface BreederCage {
  id: string;
  user_id: string;
  name: string;
  strain: string | null;
  location: string | null;
  breeding_start: string | null;
  is_pregnant: boolean;
  pregnancy_start_date: string | null;
  expected_birth_date: string | null;
  last_check_date: string | null;
  check_interval_days: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cohort {
  id: string;
  user_id: string;
  breeder_cage_id: string | null;
  name: string;
  birth_date: string;
  litter_size: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AnimalSex = "male" | "female";
export type AnimalGenotype = "hemi" | "wt" | "het";
export type AnimalStatus = "active" | "sacrificed" | "transferred" | "deceased";

export interface Animal {
  id: string;
  user_id: string;
  cohort_id: string;
  identifier: string;
  sex: AnimalSex;
  genotype: AnimalGenotype;
  ear_tag: string | null;
  birth_date: string;
  cage_number: string | null;
  housing_cage_id: string | null;
  status: AnimalStatus;
  eeg_implanted: boolean;
  eeg_implant_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ExperimentType =
  | "y_maze"
  | "ldb"
  | "marble"
  | "nesting"
  | "rotarod"
  | "rotarod_hab"
  | "rotarod_test1"
  | "rotarod_test2"
  | "stamina"
  | "catwalk"
  | "blood_draw"
  | "data_collection"
  | "core_acclimation"
  | "eeg_implant"
  | "eeg_recording"
  | "handling";

export type AnimalExperimentStatus = "pending" | "scheduled" | "in_progress" | "completed" | "skipped";

export interface AnimalExperiment {
  id: string;
  animal_id: string;
  user_id: string;
  experiment_type: ExperimentType;
  timepoint_age_days: number | null;
  scheduled_date: string | null;
  completed_date: string | null;
  status: AnimalExperimentStatus;
  results_drive_url: string | null;
  results_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColonyTimepoint {
  id: string;
  user_id: string;
  name: string;
  age_days: number;
  experiments: string[];
  handling_days_before: number;
  duration_days: number;
  includes_eeg_implant: boolean;
  eeg_recovery_days: number;
  eeg_recording_days: number;
  grace_period_days: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvisorPortal {
  id: string;
  user_id: string;
  advisor_name: string;
  advisor_email: string | null;
  token: string;
  can_see: string[];
  last_viewed_at: string | null;
  created_at: string;
}

// ─── Meeting Notes ──────────────────────────────────────────────────────────

export interface ActionItem {
  text: string;
  done: boolean;
  due_date?: string;
}

export interface MeetingNote {
  id: string;
  user_id: string;
  title: string;
  meeting_date: string;
  attendees: string[];
  content: string;
  action_items: ActionItem[];
  ai_summary: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Cage Changes ───────────────────────────────────────────────────────────

export interface CageChange {
  id: string;
  user_id: string;
  scheduled_date: string;
  completed_date: string | null;
  is_completed: boolean;
  notes: string | null;
  created_at: string;
}

// ─── Colony Photos ──────────────────────────────────────────────────────────

export interface ColonyPhoto {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  animal_id: string | null;
  experiment_type: string | null;
  taken_date: string | null;
  sort_order: number;
  show_in_portal: boolean;
  created_at: string;
}

// ─── Housing Cages ──────────────────────────────────────────────────────────

export interface HousingCage {
  id: string;
  user_id: string;
  cage_label: string;
  cage_id: string | null;
  location: string | null;
  max_occupancy: number;
  cage_type: "standard" | "eeg" | "recovery" | "quarantine";
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Colony Results (per-animal per-experiment) ─────────────────────────────

export interface ColonyResult {
  id: string;
  user_id: string;
  animal_id: string;
  timepoint_age_days: number;
  experiment_type: string;
  measures: Record<string, string | number | null>;
  notes: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Unified Tasks ──────────────────────────────────────────────────────────

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";
export type TaskSource = "manual" | "meeting_action" | "experiment" | "cage_change" | "animal_care" | "reminder";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  source_type: TaskSource | null;
  source_id: string | null;
  source_label: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── AI Literature Scout ────────────────────────────────────────────────

export type ScoutStatus = "new" | "saved" | "skipped" | "starred";

export interface ScoutFinding {
  id: string;
  user_id: string;
  pmid: string;
  title: string;
  authors: string[];
  journal: string | null;
  pub_date: string | null;
  abstract: string | null;
  doi: string | null;
  ai_summary: string | null;
  ai_relevance: string | null;
  ai_ideas: string | null;
  relevance_score: number;
  status: ScoutStatus;
  user_notes: string | null;
  matched_keyword: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoutRun {
  id: string;
  user_id: string;
  keyword: string;
  papers_found: number;
  papers_analyzed: number;
  last_run_at: string;
  created_at: string;
}

// ─── AI Memory ──────────────────────────────────────────────────────────

export type MemoryCategory =
  | "research_fact"
  | "hypothesis"
  | "experiment_insight"
  | "preference"
  | "meeting_decision"
  | "literature_pattern"
  | "troubleshooting"
  | "goal"
  | "connection"
  | "important_date";

export type MemoryConfidence = "low" | "medium" | "high" | "confirmed";

export interface AIMemory {
  id: string;
  user_id: string;
  category: MemoryCategory;
  content: string;
  source: string | null;
  confidence: MemoryConfidence;
  tags: string[];
  is_auto: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}
