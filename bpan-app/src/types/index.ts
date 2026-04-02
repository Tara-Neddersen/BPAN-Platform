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
  file_links?: string[];
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
  file_links?: string[];
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

export interface IcloudCalendarFeed {
  id: string;
  user_id: string;
  label: string;
  feed_url: string;
  last_synced_at: string | null;
  last_error: string | null;
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
  source: "csv" | "excel" | "paste" | "google_sheets" | "colony_analysis" | string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  dataset_id: string;
  name: string;
  test_type: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  ai_interpretation: string | null;
  created_at: string;
}

export interface ColonySavedAnalysis {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  dataset_id: string;
  latest_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColonySavedAnalysisRevision {
  id: string;
  analysis_id: string;
  dataset_id: string;
  user_id: string;
  name: string;
  revision_number: number;
  test_type: string;
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

export type PaperOutlineSectionKind = "text" | "figure";

export interface PaperOutlineSection {
  id: string;
  kind: PaperOutlineSectionKind;
  heading: string;
  notes: string;
  linkedFigureId: string | null;
  plotRequest: string;
}

export interface PaperOutline {
  id: string;
  user_id: string;
  title: string;
  framing: string | null;
  sections: PaperOutlineSection[];
  created_at: string;
  updated_at: string;
}

// ─── Mouse Colony Manager ────────────────────────────────────────────────────

export interface BreederCage {
  id: string;
  user_id: string;
  name: string;
  strain: string | null;
  barcode: string | null;
  cage_type: string | null;
  female_1_strain: string | null;
  female_1_genotype: string | null;
  female_1_birth_date: string | null;
  female_2_strain: string | null;
  female_2_genotype: string | null;
  female_2_birth_date: string | null;
  female_3_strain: string | null;
  female_3_genotype: string | null;
  female_3_birth_date: string | null;
  male_strain: string | null;
  male_genotype: string | null;
  male_birth_date: string | null;
  is_temporary_split: boolean;
  linked_breeder_cage_id: string | null;
  male_location: string | null;
  location: string | null;
  breeding_start: string | null;
  is_pregnant: boolean;
  pregnancy_start_date: string | null;
  expected_birth_date: string | null;
  pup_birth_date: string | null;
  pup_wean_due_date: string | null;
  pups_weaned: boolean;
  pups_weaned_date: string | null;
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
  | "social_interaction"
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
  eeg_implant_timing: "before" | "after";
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

export interface AdvisorPortalAccessLog {
  id: string;
  user_id: string;
  portal_id: string;
  viewed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ─── Meeting Notes ──────────────────────────────────────────────────────────

export interface ActionItem {
  text: string;
  done: boolean;
  due_date?: string;
  owner?: string;
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
  cage_sex: AnimalSex;
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
  experiment_run_id: string | null;
  run_timepoint_id: string | null;
  run_timepoint_experiment_id: string | null;
  timepoint_age_days: number;
  experiment_type: string;
  measures: Record<string, string | number | boolean | null | string[]>;
  notes: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Unified Tasks ──────────────────────────────────────────────────────────

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";
export type TaskSource = "manual" | "meeting_action" | "experiment" | "cage_change" | "animal_care" | "reminder" | "pi_portal";

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

// ─── Platform Redesign Schema Contracts ────────────────────────────────────

export const PLATFORM_VISIBILITIES = ["private", "lab_shared"] as const;
export type PlatformVisibility = (typeof PLATFORM_VISIBILITIES)[number];

export const PLATFORM_OWNER_TYPES = ["user", "lab"] as const;
export type PlatformOwnerType = (typeof PLATFORM_OWNER_TYPES)[number];

export const PLATFORM_ASSIGNMENT_SCOPES = ["study", "cohort", "animal"] as const;
export type PlatformAssignmentScope = (typeof PLATFORM_ASSIGNMENT_SCOPES)[number];

export const PLATFORM_SLOT_KINDS = ["am", "pm", "midday", "evening", "custom", "exact_time"] as const;
export type PlatformSlotKind = (typeof PLATFORM_SLOT_KINDS)[number];

export const PLATFORM_LAB_ROLES = ["member", "manager", "admin"] as const;
export type PlatformLabRole = (typeof PLATFORM_LAB_ROLES)[number];

export const PLATFORM_SHARED_EDIT_POLICIES = ["open_edit", "manager_controlled"] as const;
export type PlatformSharedEditPolicy = (typeof PLATFORM_SHARED_EDIT_POLICIES)[number];

export const PLATFORM_RESULT_COLUMN_TYPES = [
  "text",
  "long_text",
  "number",
  "integer",
  "boolean",
  "date",
  "time",
  "datetime",
  "select",
  "multi_select",
  "file",
  "url",
  "animal_ref",
  "cohort_ref",
  "batch_ref",
] as const;
export type PlatformResultColumnType = (typeof PLATFORM_RESULT_COLUMN_TYPES)[number];

export const PLATFORM_RUN_STATUSES = [
  "draft",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type PlatformRunStatus = (typeof PLATFORM_RUN_STATUSES)[number];

export const PLATFORM_BOOKING_STATUSES = [
  "draft",
  "confirmed",
  "in_use",
  "completed",
  "cancelled",
] as const;
export type PlatformBookingStatus = (typeof PLATFORM_BOOKING_STATUSES)[number];

export const PLATFORM_INVENTORY_EVENT_TYPES = [
  "receive",
  "consume",
  "adjust",
  "reorder_request",
  "reorder_placed",
  "reorder_received",
] as const;
export type PlatformInventoryEventType = (typeof PLATFORM_INVENTORY_EVENT_TYPES)[number];

export const PLATFORM_LINKED_OBJECT_TYPES = [
  "experiment_template",
  "experiment_run",
  "lab_reagent",
  "lab_reagent_stock_event",
  "lab_equipment",
  "lab_equipment_booking",
  "task",
] as const;
export type PlatformLinkedObjectType = (typeof PLATFORM_LINKED_OBJECT_TYPES)[number];

export const PLATFORM_MESSAGE_LINKED_OBJECT_TYPES = [
  "experiment_template",
  "experiment_run",
  "lab",
  "lab_reagent",
  "lab_reagent_stock_event",
  "lab_equipment",
  "lab_equipment_booking",
  "task",
] as const;
export type PlatformMessageLinkedObjectType = (typeof PLATFORM_MESSAGE_LINKED_OBJECT_TYPES)[number];

export const PLATFORM_MESSAGE_RECIPIENT_SCOPES = ["lab", "participants"] as const;
export type PlatformMessageRecipientScope = (typeof PLATFORM_MESSAGE_RECIPIENT_SCOPES)[number];

export interface Lab {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  created_by: string | null;
  outlook_sync_owner_user_id: string | null;
  shared_template_edit_policy: PlatformSharedEditPolicy;
  shared_protocol_edit_policy: PlatformSharedEditPolicy;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface LabMember {
  id: string;
  lab_id: string;
  user_id: string;
  role: PlatformLabRole;
  display_title: string | null;
  is_active: boolean;
  joined_at: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentTemplate {
  id: string;
  owner_type: PlatformOwnerType;
  owner_user_id: string | null;
  owner_lab_id: string | null;
  visibility: PlatformVisibility;
  title: string;
  description: string | null;
  category: string | null;
  default_assignment_scope: PlatformAssignmentScope | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateProtocolLink {
  id: string;
  template_id: string;
  protocol_id: string;
  sort_order: number;
  is_default: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResultSchema {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResultSchemaColumn {
  id: string;
  schema_id: string;
  key: string;
  label: string;
  column_type: PlatformResultColumnType;
  required: boolean;
  default_value: unknown;
  options: unknown[];
  unit: string | null;
  help_text: string | null;
  group_key: string | null;
  sort_order: number;
  is_system_default: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type ResultSchemaColumnSnapshot = Omit<ResultSchemaColumn, "id" | "schema_id" | "created_at" | "updated_at">;

export interface ScheduleTemplate {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDay {
  id: string;
  schedule_template_id: string;
  day_index: number;
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSlot {
  id: string;
  schedule_day_id: string;
  slot_kind: PlatformSlotKind;
  label: string | null;
  start_time: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduledBlock {
  id: string;
  schedule_slot_id: string;
  experiment_template_id: string;
  protocol_id: string | null;
  title_override: string | null;
  notes: string | null;
  sort_order: number;
  repeat_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExperimentRun {
  id: string;
  template_id: string | null;
  legacy_experiment_id: string | null;
  owner_user_id: string | null;
  owner_lab_id: string | null;
  visibility: PlatformVisibility;
  name: string;
  description: string | null;
  status: PlatformRunStatus;
  selected_protocol_id: string | null;
  result_schema_id: string | null;
  schema_snapshot: ResultSchemaColumnSnapshot[];
  schedule_template_id: string | null;
  start_anchor_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunTimepoint {
  id: string;
  experiment_run_id: string;
  key: string;
  label: string;
  target_age_days: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunTimepointExperiment {
  id: string;
  run_timepoint_id: string;
  experiment_key: string;
  label: string;
  sort_order: number;
  result_schema_id: string | null;
  schema_snapshot: ResultSchemaColumnSnapshot[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunExperimentScheduleStep {
  id: string;
  run_timepoint_experiment_id: string;
  relative_day: number;
  slot_kind: PlatformSlotKind;
  slot_label: string | null;
  scheduled_time: string | null;
  sort_order: number;
  task_type: "experiment" | "handling" | "transport" | "prep" | "recovery" | "collection" | "custom";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunScheduleBlock {
  id: string;
  experiment_run_id: string;
  source_scheduled_block_id: string | null;
  day_index: number;
  slot_kind: PlatformSlotKind;
  slot_label: string | null;
  scheduled_time: string | null;
  sort_order: number;
  experiment_template_id: string | null;
  protocol_id: string | null;
  title: string;
  notes: string | null;
  status: PlatformRunStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RunAssignment {
  id: string;
  experiment_run_id: string;
  scope_type: PlatformAssignmentScope;
  study_id: string | null;
  cohort_id: string | null;
  animal_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LabReagent {
  id: string;
  lab_id: string;
  name: string;
  catalog_number: string | null;
  supplier: string | null;
  lot_number: string | null;
  quantity: number;
  unit: string | null;
  reorder_threshold: number | null;
  needs_reorder: boolean;
  last_ordered_at: string | null;
  storage_location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabReagentStockEvent {
  id: string;
  lab_reagent_id: string;
  event_type: PlatformInventoryEventType;
  quantity_delta: number;
  unit: string | null;
  vendor: string | null;
  reference_number: string | null;
  purchase_order_number: string | null;
  expected_arrival_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LabEquipment {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  location: string | null;
  booking_requires_approval: boolean;
  outlook_calendar_id: string | null;
  outlook_calendar_name: string | null;
  outlook_sync_owner_user_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabEquipmentBooking {
  id: string;
  equipment_id: string;
  booked_by: string | null;
  experiment_run_id: string | null;
  task_id: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: PlatformBookingStatus;
  created_at: string;
  updated_at: string;
}

export interface LabMeeting {
  id: string;
  lab_id: string;
  created_by: string | null;
  title: string;
  meeting_date: string;
  attendees: string[];
  content: string;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type LabMeetingActionCategory = "general" | "inspection";
export type LabMeetingActionStatus = "open" | "completed";
export type LabMeetingActionSource = "manual" | "ai";

export interface LabMeetingActionItem {
  id: string;
  lab_meeting_id: string;
  text: string;
  details: string | null;
  category: LabMeetingActionCategory;
  status: LabMeetingActionStatus;
  responsible_member_id: string | null;
  responsible_label: string | null;
  source: LabMeetingActionSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageThread {
  id: string;
  lab_id: string | null;
  owner_user_id: string | null;
  recipient_scope: PlatformMessageRecipientScope;
  subject: string | null;
  linked_object_type: PlatformMessageLinkedObjectType;
  linked_object_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageThreadParticipant {
  id: string;
  thread_id: string;
  user_id: string;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  author_user_id: string | null;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskLink {
  id: string;
  task_id: string;
  linked_object_type: PlatformLinkedObjectType;
  linked_object_id: string;
  created_by: string | null;
  created_at: string;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
  created_at: string;
  updated_at: string;
}
