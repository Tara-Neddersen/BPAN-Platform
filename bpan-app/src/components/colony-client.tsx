"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  Plus, Edit, Trash2, Loader2, Check, X, Copy, Pencil,
  ExternalLink, Eye, ChevronDown, ChevronUp,
  Calendar, AlertTriangle, Link2, Mouse, Home,
  RefreshCw, FileText, CheckCircle2,
  Upload, CloudOff, Cloud, ImageIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type {
  BreederCage, Cohort, Animal, AnimalExperiment,
  ColonyTimepoint, AdvisorPortal, MeetingNote, CageChange, ColonyPhoto,
  HousingCage, ColonyResult, AnimalSex, AnimalGenotype, AnimalStatus,
} from "@/types";
import { ColonyResultsTab } from "@/components/colony-results-tab";
import { ColonyAnalysisPanel } from "@/components/colony-analysis-panel";
import { ExperimentTrackerMatrix } from "@/components/experiment-tracker-matrix";
import { EarTagSelector, MiniEarTag, parseEarTag } from "@/components/ear-tag-selector";

// ─── Constants ──────────────────────────────────────────────────────────

const GENOTYPE_LABELS: Record<string, string> = {
  hemi: "Hemizygous",
  wt: "Wild-type",
  het: "Heterozygous",
};

const GENOTYPE_SORT: Record<string, number> = { hemi: 0, het: 1, wt: 2 };
const SEX_SORT: Record<string, number> = { male: 0, female: 1 };

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling (5 days)",
  y_maze: "Y-Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Overnight Nesting",
  data_collection: "Transport to Core",
  core_acclimation: "Core Acclimation (48hr)",
  catwalk: "CatWalk Gait Analysis",
  rotarod_hab: "Rotarod Habituation",
  rotarod: "Rotarod Testing (legacy)",
  rotarod_test1: "Rotarod Test 1",
  rotarod_test2: "Rotarod Test 2",
  rotarod_recovery: "Rotarod Recovery (calendar only)",
  stamina: "Stamina Test (10 RPM)",
  blood_draw: "Plasma Collection",
  eeg_implant: "EEG Implant Surgery",
  eeg_recording: "EEG Recording",
};

// All experiment types available for batch scheduling
const ALL_EXPERIMENT_TYPES = [
  "handling", "y_maze", "marble", "ldb", "nesting", "data_collection",
  "core_acclimation", "catwalk", "rotarod_hab", "rotarod_test1", "rotarod_test2",
  "stamina", "blood_draw", "eeg_implant", "eeg_recording",
];

// Experiments the user can select for timepoints (excludes handling/EEG which are handled separately)
const EXPERIMENT_TYPES = [
  "y_maze", "marble", "ldb", "nesting", "data_collection",
  "core_acclimation", "catwalk", "rotarod_hab", "rotarod_test1", "rotarod_test2",
  "stamina", "blood_draw",
];

// Day labels for the protocol timeline
const PROTOCOL_DAY_LABELS: Record<string, string> = {
  y_maze: "Day 1 AM",
  marble: "Day 1 PM",
  ldb: "Day 2 AM",
  nesting: "Day 2 PM",
  data_collection: "Day 3",
  core_acclimation: "Day 4–5",
  catwalk: "Day 6",
  rotarod_hab: "Day 6 (Rotarod Day 1)",
  rotarod_test1: "Day 7 (Rotarod Day 2)",
  rotarod_test2: "Day 8 (Rotarod Day 3)",
  rotarod_recovery: "Day 9 (Calendar only)",
  stamina: "Day 10 (Rotarod Day 4)",
  blood_draw: "Day 11",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  skipped: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const LAST_BEHAVIOR_OFFSET = 9;

function timepointProtocolPreview(tp: ColonyTimepoint) {
  const handling = tp.handling_days_before ?? 5;
  const recovery = tp.eeg_recovery_days ?? 7;
  const recording = tp.eeg_recording_days ?? 3;
  const implantTiming = tp.eeg_implant_timing || "after";
  const behaviorStartShift = tp.includes_eeg_implant && implantTiming === "before" ? recovery : 0;
  const lastBehaviorDay = behaviorStartShift + LAST_BEHAVIOR_OFFSET;
  const recordingStartDay = tp.includes_eeg_implant
    ? (implantTiming === "after" ? lastBehaviorDay + 1 + recovery : lastBehaviorDay + 1)
    : null;
  const plasmaDay = tp.includes_eeg_implant && recordingStartDay !== null
    ? recordingStartDay + recording + 7
    : lastBehaviorDay + 7;

  return {
    handlingStartDay: 1 - handling + behaviorStartShift,
    behaviorStartDay: 1 + behaviorStartShift,
    lastBehaviorDay: lastBehaviorDay + 1,
    recordingStartDay: recordingStartDay !== null ? recordingStartDay + 1 : null,
    plasmaDay: plasmaDay + 1,
  };
}

interface ColonyClientProps {
  defaultTab?: string;
  breederCages: BreederCage[];
  cohorts: Cohort[];
  animals: Animal[];
  animalExperiments: AnimalExperiment[];
  timepoints: ColonyTimepoint[];
  advisorPortals: AdvisorPortal[];
  meetingNotes: MeetingNote[];
  cageChanges: CageChange[];
  colonyPhotos: ColonyPhoto[];
  housingCages: HousingCage[];
  colonyResults: ColonyResult[];
  batchUpsertColonyResults: (
    timepointAgeDays: number,
    experimentType: string,
    entries: {
      animalId: string;
      measures: Record<string, string | number | null>;
      notes?: string;
    }[]
  ) => Promise<{ success?: boolean; error?: string; saved?: number; errors?: string[] }>;
  reconcileTrackerFromExistingColonyResults: () => Promise<{ success?: boolean; error?: string; completed?: number; ignored?: number }>;
  deleteColonyResultMeasureColumn: (
    timepointAgeDays: number,
    experimentType: string,
    fieldKey: string
  ) => Promise<{ success?: boolean; error?: string; updated?: number }>;
  actions: {
    createBreederCage: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateBreederCage: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteBreederCage: (id: string) => Promise<{ success?: boolean; error?: string }>;
    createCohort: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateCohort: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteCohort: (id: string) => Promise<{ success?: boolean; error?: string }>;
    createAnimal: (fd: FormData) => Promise<{ success?: boolean; error?: string; id?: string }>;
    updateAnimal: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteAnimal: (id: string) => Promise<{ success?: boolean; error?: string }>;
    createColonyTimepoint: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateColonyTimepoint: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteColonyTimepoint: (id: string) => Promise<{ success?: boolean; error?: string }>;
    createAnimalExperiment: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateAnimalExperiment: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteAnimalExperiment: (id: string) => Promise<{ success?: boolean; error?: string }>;
    scheduleExperimentsForAnimal: (animalId: string, birthDate: string, onlyTimepointAgeDays?: number[]) => Promise<{ success?: boolean; error?: string; count?: number }>;
    scheduleExperimentsForCohort: (cohortId: string, onlyTimepointAgeDays?: number[]) => Promise<{ success?: boolean; error?: string; scheduled?: number; skipped?: number; total?: number; errors?: string[] }>;
    deleteExperimentsForAnimal: (animalId: string, onlyTimepointAgeDays?: number[], onlyStatuses?: string[]) => Promise<{ success?: boolean; error?: string; deleted?: number }>;
    deleteExperimentsForCohort: (cohortId: string, onlyTimepointAgeDays?: number[], onlyStatuses?: string[]) => Promise<{ success?: boolean; error?: string; deleted?: number; animals?: number }>;
    createAdvisorAccess: (fd: FormData) => Promise<{ success?: boolean; error?: string; token?: string }>;
    deleteAdvisorAccess: (id: string) => Promise<{ success?: boolean; error?: string }>;
    createMeetingNote: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateMeetingNote: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteMeetingNote: (id: string) => Promise<{ success?: boolean; error?: string }>;
    generateCageChanges: (startDate: string, count: number) => Promise<{ success?: boolean; error?: string; count?: number }>;
    toggleCageChange: (id: string, completed: boolean) => Promise<{ success?: boolean; error?: string }>;
    deleteCageChange: (id: string) => Promise<{ success?: boolean; error?: string }>;
    addColonyPhoto: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteColonyPhoto: (id: string) => Promise<{ success?: boolean; error?: string }>;
    createHousingCage: (fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    updateHousingCage: (id: string, fd: FormData) => Promise<{ success?: boolean; error?: string }>;
    deleteHousingCage: (id: string) => Promise<{ success?: boolean; error?: string }>;
    assignAnimalToCage: (animalId: string, housingCageId: string | null) => Promise<{ success?: boolean; error?: string }>;
    rescheduleTimepointExperiments: (animalId: string, timepointAgeDays: number, newStartDate: string, birthDate: string) => Promise<{ success?: boolean; error?: string; rescheduled?: number; lastDate?: string; message?: string }>;
    batchUpdateExperimentStatus: (cohortIds: string[], timepointAgeDays: number[], experimentTypes: string[], newStatus: string, notes?: string) => Promise<{ success?: boolean; error?: string; updated?: number }>;
    batchScheduleSingleExperiment: (animalIds: string[], expType: string, date: string, timepointAgeDays: number | null) => Promise<{ success?: boolean; error?: string }>;
    rescheduleExperimentsAfterTimepointEdit: (
      oldTimepointAgeDays: number,
      newTimepointAgeDays: number,
      animalIds?: string[],
      experimentTypes?: string[]
    ) => Promise<{ success?: boolean; error?: string; updated?: number }>;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function daysOld(birthDate: string) {
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(dateStr: string) {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function genotypeLabel(sex: AnimalSex, genotype: AnimalGenotype) {
  return `${GENOTYPE_LABELS[genotype]} ${sex === "male" ? "Male" : "Female"}`;
}

/** Convert Google Drive share links to direct image URLs */
function convertDriveUrl(url: string): string {
  // https://drive.google.com/file/d/FILE_ID/view...
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  // https://drive.google.com/open?id=FILE_ID
  const match2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (match2) return `https://lh3.googleusercontent.com/d/${match2[1]}`;
  return url; // already a direct URL
}

// ─── Main Component ─────────────────────────────────────────────────────

export function ColonyClient({
  defaultTab = "animals",
  breederCages: initCages,
  cohorts: initCohorts,
  animals: initAnimals,
  animalExperiments: initExps,
  timepoints: initTPs,
  advisorPortals: initPortals,
  meetingNotes: initMeetings,
  cageChanges: initCageChanges,
  colonyPhotos: initPhotos,
  housingCages: initHousingCages,
  colonyResults: initColonyResults,
  batchUpsertColonyResults,
  reconcileTrackerFromExistingColonyResults,
  deleteColonyResultMeasureColumn,
  actions,
}: ColonyClientProps) {
  const router = useRouter();
  const supabaseRef = useRef(createBrowserClient());
  const validTabs = useRef(new Set(["animals", "cohorts", "breeders", "tracker", "results", "analysis", "housing", "cages", "pi"]));
  const initialTab = validTabs.current.has(defaultTab) ? defaultTab : "animals";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Local state — updated via refetch after each action
  const [cages, setCages] = useState(initCages);
  const [cohorts, setCohorts] = useState(initCohorts);
  const [animals, setAnimals] = useState(initAnimals);
  const [experiments, setExperiments] = useState(initExps);
  const [timepoints, setTimepoints] = useState(initTPs);
  const [portals, setPortals] = useState(initPortals);
  const [meetings, setMeetings] = useState(initMeetings);
  const [cageChanges, setCageChanges] = useState(initCageChanges);
  const [photos, setPhotos] = useState(initPhotos);
  const [housingCages, setHousingCages] = useState(initHousingCages);
  const [colonyResults, setColonyResults] = useState(initColonyResults);

  useEffect(() => {
    setActiveTab(validTabs.current.has(defaultTab) ? defaultTab : "animals");
  }, [defaultTab]);

  function handleTabChange(nextTab: string) {
    setActiveTab(nextTab);
    const url = nextTab === "animals" ? "/colony" : `/colony?tab=${encodeURIComponent(nextTab)}`;
    router.replace(url, { scroll: false });
  }

  // Cursor-based pagination helper for large tables (client-side)
  const fetchAllClientRows = useCallback(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sb: any, table: string, userId: string
  ): Promise<unknown[]> => {
    const PAGE = 900;
    let all: unknown[] = [];
    let lastId: string | null = null;
    while (true) {
      let q = sb.from(table).select("*").eq("user_id", userId).order("id", { ascending: true }).limit(PAGE);
      if (lastId) q = q.gt("id", lastId);
      const { data, error } = await q;
      if (error) { console.error(`fetchAllClientRows ${table}:`, error.message); break; }
      if (!data || data.length === 0) break;
      all = all.concat(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lastId = (data[data.length - 1] as any).id;
      if (data.length < PAGE) break;
    }
    return all;
  }, []);

  // Refetch all colony data directly from Supabase (bypasses all caching)
  const refetchAll = useCallback(async () => {
    try {
      const sb = supabaseRef.current;
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) {
        console.error("refetchAll: auth failed", authError);
        window.location.reload();
        return;
      }
      // Small tables: normal query. Large tables: cursor-based pagination.
      const [r1, r2, r5, r6, r7, r9, r10, allAnimals, allExps, allCageChanges, allResults] = await Promise.all([
        sb.from("breeder_cages").select("*").eq("user_id", user.id).order("name"),
        sb.from("cohorts").select("*").eq("user_id", user.id).order("name"),
        sb.from("colony_timepoints").select("*").eq("user_id", user.id).order("sort_order"),
        sb.from("advisor_portal").select("*").eq("user_id", user.id).order("created_at"),
        sb.from("meeting_notes").select("*").eq("user_id", user.id).order("meeting_date", { ascending: false }),
        sb.from("colony_photos").select("*").eq("user_id", user.id).order("sort_order"),
        sb.from("housing_cages").select("*").eq("user_id", user.id).order("cage_label"),
        fetchAllClientRows(sb, "animals", user.id),
        fetchAllClientRows(sb, "animal_experiments", user.id),
        fetchAllClientRows(sb, "cage_changes", user.id),
        fetchAllClientRows(sb, "colony_results", user.id),
      ]);
      setCages((r1.data || []) as BreederCage[]);
      setCohorts((r2.data || []) as Cohort[]);
      setAnimals(allAnimals as Animal[]);
      setExperiments(allExps as AnimalExperiment[]);
      setTimepoints((r5.data || []) as ColonyTimepoint[]);
      setPortals((r6.data || []) as AdvisorPortal[]);
      setMeetings((r7.data || []) as MeetingNote[]);
      setCageChanges(allCageChanges as CageChange[]);
      setPhotos((r9.data || []) as ColonyPhoto[]);
      setHousingCages((r10.data || []) as HousingCage[]);
      setColonyResults(allResults as ColonyResult[]);
    } catch (err) {
      console.error("refetchAll error:", err);
      window.location.reload();
    }
  }, [fetchAllClientRows]);

  const [showAddAnimal, setShowAddAnimal] = useState(false);
  const [showAddCohort, setShowAddCohort] = useState(false);
  const [showAddCage, setShowAddCage] = useState(false);
  const [showAddTP, setShowAddTP] = useState(false);
  const [showAddPI, setShowAddPI] = useState(false);
  const [showGenerateCageChanges, setShowGenerateCageChanges] = useState(false);
  const [showAddHousingCage, setShowAddHousingCage] = useState(false);
  const [editingCage, setEditingCage] = useState<BreederCage | null>(null);
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [editingTP, setEditingTP] = useState<ColonyTimepoint | null>(null);
  const [tpReschedulePrompt, setTpReschedulePrompt] = useState<null | {
    tpName: string;
    oldAgeDays: number;
    newAgeDays: number;
    affectedAnimalIds: string[];
    affectedExperimentTypes: string[];
  }>(null);
  const [tpRescheduleSelectedAnimalIds, setTpRescheduleSelectedAnimalIds] = useState<Set<string>>(new Set());
  const [tpRescheduleSelectedExperimentTypes, setTpRescheduleSelectedExperimentTypes] = useState<Set<string>>(new Set());
  const [tpRescheduleBusy, setTpRescheduleBusy] = useState(false);
  const [editingHousingCage, setEditingHousingCage] = useState<HousingCage | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  // Batch Schedule modal state
  const [showBatchSchedule, setShowBatchSchedule] = useState(false);
  const [batchExpType, setBatchExpType] = useState<string>("eeg_implant");
  const [batchDate, setBatchDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [batchTimepointAgeDays, setBatchTimepointAgeDays] = useState<string>("");
  const [batchSelectedAnimalIds, setBatchSelectedAnimalIds] = useState<Set<string>>(new Set());
  // Animal ID auto-suggest
  const [animalFormSex, setAnimalFormSex] = useState<string>("");
  const [animalFormGenotype, setAnimalFormGenotype] = useState<string>("");
  const [suggestedIdentifier, setSuggestedIdentifier] = useState<string>("");

  // Schedule / Delete dialog state
  const [scheduleDialog, setScheduleDialog] = useState<{ type: "cohort" | "animal"; id: string; name: string; birthDate?: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ type: "cohort" | "animal"; id: string; name: string } | null>(null);
  const [showOverdueDetails, setShowOverdueDetails] = useState(false);
  const [expandedOverdueTypes, setExpandedOverdueTypes] = useState<Set<string>>(new Set());
  const [selectedTpAges, setSelectedTpAges] = useState<Set<number>>(new Set());
  const [deleteStatusFilter, setDeleteStatusFilter] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoUploadInputRef = useRef<HTMLInputElement>(null);
  const [filterCohort, setFilterCohort] = useState("all");
  const [filterGenotype, setFilterGenotype] = useState("all");
  const [animalFormCohortId, setAnimalFormCohortId] = useState("");
  const [animalFormEarTag, setAnimalFormEarTag] = useState("0000");
  const birthDateRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);

  // Auto-suggest animal identifier when cohort + sex + genotype are selected
  useEffect(() => {
    if (!animalFormCohortId || !animalFormSex || !animalFormGenotype || editingAnimal) {
      setSuggestedIdentifier("");
      return;
    }
    const cohort = cohorts.find(c => c.id === animalFormCohortId);
    if (!cohort) { setSuggestedIdentifier(""); return; }

    // Build cohort short code from first letter + digits in name
    const cohortShort = cohort.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
    const genoCode = animalFormGenotype === "hemi" ? "HM" : animalFormGenotype === "het" ? "HT" : "WT";
    const sexCode = animalFormSex === "male" ? "M" : "F";

    // Count existing animals in this cohort with same genotype+sex
    const existing = animals.filter(a => a.cohort_id === animalFormCohortId && a.genotype === animalFormGenotype && a.sex === animalFormSex);
    const nextNum = String(existing.length + 1).padStart(3, "0");
    const suggested = `${cohortShort}-${genoCode}${sexCode}-${nextNum}`;
    setSuggestedIdentifier(suggested);
    // Pre-fill the input if it's currently empty or was previously auto-suggested
    if (identifierRef.current && (!identifierRef.current.value || identifierRef.current.dataset.autoSuggested === "true")) {
      identifierRef.current.value = suggested;
      identifierRef.current.dataset.autoSuggested = "true";
    }
  }, [animalFormCohortId, animalFormSex, animalFormGenotype, animals, cohorts, editingAnimal]);

  // Google Drive integration
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; connected: boolean; email?: string | null }>({ configured: false, connected: false });
  const [driveLoading, setDriveLoading] = useState(false);

  useEffect(() => {
    fetch("/api/gdrive/status")
      .then((r) => r.json())
      .then(setDriveStatus)
      .catch(() => {});
    // Show toast if redirected back from OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive") === "connected") {
      toast.success("Google Drive connected successfully!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("drive") === "error") {
      toast.error("Failed to connect Google Drive: " + (params.get("msg") || "unknown error"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connectGoogleDrive() {
    setDriveLoading(true);
    try {
      const res = await fetch("/api/gdrive/auth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to start Drive connection");
        setDriveLoading(false);
      }
    } catch {
      toast.error("Failed to connect Google Drive");
      setDriveLoading(false);
    }
  }

  async function disconnectGoogleDrive() {
    setDriveLoading(true);
    try {
      await fetch("/api/gdrive/disconnect", { method: "POST" });
      setDriveStatus({ configured: true, connected: false });
      toast.success("Google Drive disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
    setDriveLoading(false);
  }

  async function uploadLabPhotoToDrive(file: File) {
    if (!driveStatus.connected) {
      toast.error("Connect Google Drive first");
      return;
    }
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("cohort_name", "Lab Gallery");
      fd.append("animal_identifier", "Colony Photos");
      fd.append("experiment_type", "lab_photo");

      const res = await fetch("/api/gdrive/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Failed to upload image");
        return;
      }
      setPhotoUrlInput(String(data.url || ""));
      toast.success("Uploaded to Google Drive and linked");
    } catch {
      toast.error("Upload failed");
    } finally {
      setPhotoUploading(false);
      if (photoUploadInputRef.current) photoUploadInputRef.current.value = "";
    }
  }

  // Sort animals: cohort → sex → genotype
  const sortedAnimals = useMemo(() => {
    let filtered = [...animals];
    if (filterCohort !== "all") filtered = filtered.filter((a) => a.cohort_id === filterCohort);
    if (filterGenotype !== "all") {
      filtered = filtered.filter((a) => {
        if (filterGenotype === "hemi_male") return a.genotype === "hemi" && a.sex === "male";
        if (filterGenotype === "wt_male") return a.genotype === "wt" && a.sex === "male";
        if (filterGenotype === "het_female") return a.genotype === "het" && a.sex === "female";
        if (filterGenotype === "wt_female") return a.genotype === "wt" && a.sex === "female";
        return true;
      });
    }
    return filtered.sort((a, b) => {
      const cohA = cohorts.find((c) => c.id === a.cohort_id);
      const cohB = cohorts.find((c) => c.id === b.cohort_id);
      const cohComp = (cohA?.name || "").localeCompare(cohB?.name || "");
      if (cohComp !== 0) return cohComp;
      const sexComp = SEX_SORT[a.sex] - SEX_SORT[b.sex];
      if (sexComp !== 0) return sexComp;
      return GENOTYPE_SORT[a.genotype] - GENOTYPE_SORT[b.genotype];
    });
  }, [animals, cohorts, filterCohort, filterGenotype]);

  // Date helpers
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const oneWeekFromNow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, []);

  // Overdue experiments (past today AND past grace period, still scheduled/in_progress)
  const overdueExps = useMemo(() => {
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date();
    // Build lookup: animalId → birth_date
    const animalBirthMap = new Map(animals.map(a => [a.id, a.birth_date]));
    // Build lookup: age_days → grace_period_days
    const tpGraceMap = new Map(timepoints.map(tp => [tp.age_days, tp.grace_period_days ?? 30]));

    return experiments.filter((e) => {
      if (e.status !== "scheduled" && e.status !== "in_progress") return false;
      if (!e.scheduled_date || e.scheduled_date >= todayStr) return false;

      // Check if still within grace period
      const birthStr = animalBirthMap.get(e.animal_id);
      if (birthStr && e.timepoint_age_days != null) {
        const graceDays = tpGraceMap.get(e.timepoint_age_days) ?? 30;
        const birth = new Date(birthStr);
        const deadline = new Date(birth.getTime() + (e.timepoint_age_days + graceDays) * DAY);
        if (today <= deadline) return false; // Still in grace period — NOT overdue
      }
      return true;
    });
  }, [experiments, animals, timepoints, todayStr]);

  // Upcoming experiments — today through next 7 days
  const upcoming = useMemo(
    () =>
      experiments
        .filter((e) => e.status === "scheduled" && e.scheduled_date && e.scheduled_date >= todayStr && e.scheduled_date <= oneWeekFromNow)
        .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || "")),
    [experiments, todayStr, oneWeekFromNow]
  );

  // Upcoming cage changes — only next 7 days
  const upcomingCageChanges = useMemo(
    () => cageChanges
      .filter((c) => !c.is_completed && c.scheduled_date <= oneWeekFromNow)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [cageChanges, oneWeekFromNow]
  );

  // Pregnant breeder check reminders
  const breederReminders = useMemo(
    () => cages.filter((c) => {
      if (!c.is_pregnant) return false;
      if (!c.last_check_date) return true; // never checked
      const daysSinceCheck = (Date.now() - new Date(c.last_check_date).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceCheck >= (c.check_interval_days || 7);
    }),
    [cages]
  );

  // Stats
  const activeCount = animals.filter((a) => a.status === "active").length;
  const pendingExps = experiments.filter((e) => e.status === "scheduled").length;
  const completedExps = experiments.filter((e) => e.status === "completed").length;

  // Form handlers
  async function handleFormAction(
    fn: (fd: FormData) => Promise<{ success?: boolean; error?: string }>,
    e: React.FormEvent<HTMLFormElement>,
    closeDialog?: () => void
  ) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const result = await fn(fd);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Saved!");
      closeDialog?.();
      await refetchAll();
    }
  }

  // Wrapper for inline action calls (delete, toggle, etc.)
  async function act(fn: Promise<{ success?: boolean; error?: string }>) {
    const result = await fn;
    if (result.error) toast.error(result.error);
    else await refetchAll();
    return result;
  }

  async function handleScheduleAll(animal: Animal) {
    setBusy(true);
    const result = await actions.scheduleExperimentsForAnimal(animal.id, animal.birth_date);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Scheduled ${result.count} experiments for ${animal.identifier}!`);
      await refetchAll(); router.refresh();
    }
  }

  async function handleUpdateExpStatus(expId: string, status: string) {
    const fd = new FormData();
    fd.set("status", status);
    if (status === "completed") fd.set("completed_date", new Date().toISOString().split("T")[0]);
    const result = await actions.updateAnimalExperiment(expId, fd);
    if (result.error) toast.error(result.error);
    else { toast.success("Updated!"); refetchAll(); }
  }

  async function handleSaveResultUrl(expId: string, url: string) {
    const fd = new FormData();
    fd.set("results_drive_url", url);
    const result = await actions.updateAnimalExperiment(expId, fd);
    if (result.error) toast.error(result.error);
    else { toast.success("Results link saved!"); refetchAll(); }
  }

  async function handleTimepointEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!editingTP) return;
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const newAgeDays = parseInt((fd.get("age_days") as string) || String(editingTP.age_days), 10);
    const oldAgeDays = editingTP.age_days;

    const affectedRows = experiments.filter((exp) =>
      exp.timepoint_age_days === oldAgeDays &&
      (exp.status === "scheduled" || exp.status === "pending" || exp.status === "in_progress")
    );
    const affectedAnimalIds = [...new Set(affectedRows.map((exp) => exp.animal_id))];
    const affectedExperimentTypes = [...new Set(affectedRows.map((exp) => exp.experiment_type))].sort();

    const result = await actions.updateColonyTimepoint(editingTP.id, fd);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Timepoint saved!");
    setEditingTP(null);
    await refetchAll();

    if (affectedRows.length > 0) {
      setTpReschedulePrompt({
        tpName: String(fd.get("name") || editingTP.name),
        oldAgeDays,
        newAgeDays: Number.isFinite(newAgeDays) ? newAgeDays : oldAgeDays,
        affectedAnimalIds,
        affectedExperimentTypes,
      });
      setTpRescheduleSelectedAnimalIds(new Set(affectedAnimalIds));
      setTpRescheduleSelectedExperimentTypes(new Set(affectedExperimentTypes));
    }
  }

  function copyPILink(token: string) {
    const url = `${window.location.origin}/pi/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)" }}>
          <div className="text-2xl font-bold tracking-tight text-violet-700">{activeCount}</div>
          <p className="text-xs text-violet-700 font-semibold mt-0.5">Active Animals</p>
        </div>
        <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #e0f2fe, #bae6fd)" }}>
          <div className="text-2xl font-bold tracking-tight text-sky-700">{cohorts.length}</div>
          <p className="text-xs text-sky-700 font-semibold mt-0.5">Cohorts</p>
        </div>
        <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
          <div className="text-2xl font-bold tracking-tight text-amber-700">{pendingExps}</div>
          <p className="text-xs text-amber-700 font-semibold mt-0.5">Scheduled</p>
        </div>
        <div className="rounded-xl p-4 text-center shadow-sm" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}>
          <div className="text-2xl font-bold tracking-tight text-emerald-700">{completedExps}</div>
          <p className="text-xs text-emerald-700 font-semibold mt-0.5">Completed ✓</p>
        </div>
      </div>

      {/* Upcoming alerts — next 7 days + overdue summary */}
      {(upcoming.length > 0 || upcomingCageChanges.length > 0 || breederReminders.length > 0 || overdueExps.length > 0) && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-3">
            {/* Cage change alerts */}
            {upcomingCageChanges.map((cc) => {
              const dLeft = daysUntil(cc.scheduled_date);
              return (
                <div key={cc.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className={dLeft <= 1 ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"} variant="secondary">
                      {dLeft <= 0 ? "TODAY" : `${dLeft}d`}
                    </Badge>
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">Cage Change</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{cc.scheduled_date}</span>
                    <Button
                      variant="ghost" size="sm" className="h-6 text-xs px-2"
                      onClick={() => act(actions.toggleCageChange(cc.id, true))}
                    >
                      <Check className="h-3 w-3 mr-0.5" /> Done
                    </Button>
                  </div>
                </div>
              );
            })}
            {/* Breeder pregnancy check reminders */}
            {breederReminders.map((c) => (
              <div key={`preg-${c.id}`} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-pink-100 text-pink-700" variant="secondary">🤰</Badge>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">Pregnancy check overdue</span>
                </div>
                <Button
                  variant="outline" size="sm" className="h-6 text-xs px-2"
                  onClick={async () => {
                    const fd = new FormData();
                    fd.set("name", c.name);
                    fd.set("strain", c.strain || "");
                    fd.set("location", c.location || "");
                    fd.set("breeding_start", c.breeding_start || "");
                    fd.set("is_pregnant", "true");
                    fd.set("pregnancy_start_date", c.pregnancy_start_date || "");
                    fd.set("expected_birth_date", c.expected_birth_date || "");
                    fd.set("last_check_date", new Date().toISOString().split("T")[0]);
                    fd.set("check_interval_days", String(c.check_interval_days || 7));
                    fd.set("notes", c.notes || "");
                    const res = await actions.updateBreederCage(c.id, fd);
                    if (res.error) toast.error(res.error);
                    else { toast.success(`${c.name} marked as checked!`); refetchAll(); }
                  }}
                >
                  <Check className="h-3 w-3 mr-0.5" /> Checked
                </Button>
              </div>
            ))}
            {/* Overdue experiments — collapsed summary */}
            {overdueExps.length > 0 && (
              <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-2 space-y-1">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setShowOverdueDetails(!showOverdueDetails)}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Badge className="bg-red-100 text-red-700" variant="secondary">OVERDUE</Badge>
                    <span className="font-medium text-red-700 dark:text-red-400">
                      {overdueExps.length} experiment{overdueExps.length !== 1 ? "s" : ""} past due
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({new Set(overdueExps.map(e => e.animal_id)).size} animals)
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                    {showOverdueDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showOverdueDetails ? "Hide" : "Details"}
                  </Button>
                </div>
                {showOverdueDetails && (
                  <div className="space-y-0.5 pt-1 border-t border-red-200/50">
                    {(() => {
                      // Build lookups
                      const animalLookup = new Map(animals.map(a => [a.id, a]));
                      const cohortLookup = new Map(cohorts.map(c => [c.id, c]));
                      const tpLookup = new Map(timepoints.map(tp => [tp.age_days, tp]));

                      // Group overdue by experiment type
                      const groups = new Map<string, { exps: typeof overdueExps; animalIds: Set<string>; earliest: string; latest: string }>();
                      for (const exp of overdueExps) {
                        if (!groups.has(exp.experiment_type)) {
                          groups.set(exp.experiment_type, { exps: [], animalIds: new Set(), earliest: exp.scheduled_date!, latest: exp.scheduled_date! });
                        }
                        const g = groups.get(exp.experiment_type)!;
                        g.exps.push(exp);
                        g.animalIds.add(exp.animal_id);
                        if (exp.scheduled_date! < g.earliest) g.earliest = exp.scheduled_date!;
                        if (exp.scheduled_date! > g.latest) g.latest = exp.scheduled_date!;
                      }
                      return Array.from(groups.entries())
                        .sort(([, a], [, b]) => a.earliest.localeCompare(b.earliest))
                        .map(([type, g]) => {
                          const isExpanded = expandedOverdueTypes.has(type);
                          return (
                            <div key={type} className="space-y-0.5">
                              <div
                                className="flex items-center justify-between text-xs text-red-700 dark:text-red-400 cursor-pointer hover:bg-red-100/50 dark:hover:bg-red-900/20 rounded px-1 py-0.5"
                                onClick={() => {
                                  setExpandedOverdueTypes(prev => {
                                    const next = new Set(prev);
                                    if (next.has(type)) next.delete(type); else next.add(type);
                                    return next;
                                  });
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                                  <span className="font-medium">{EXPERIMENT_LABELS[type] || type}</span>
                                  <span className="text-muted-foreground">{g.animalIds.size} animal{g.animalIds.size !== 1 ? "s" : ""}</span>
                                </div>
                                <span className="text-muted-foreground">
                                  {g.earliest === g.latest ? g.earliest : `${g.earliest} → ${g.latest}`}
                                </span>
                              </div>
                              {isExpanded && (
                                <div className="ml-5 space-y-0 border-l-2 border-red-200 dark:border-red-800 pl-2">
                                  {g.exps
                                    .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
                                    .map((exp) => {
                                      const animal = animalLookup.get(exp.animal_id);
                                      const cohort = animal?.cohort_id ? cohortLookup.get(animal.cohort_id) : null;
                                      const tp = exp.timepoint_age_days != null ? tpLookup.get(exp.timepoint_age_days) : null;
                                      const ageDays = animal?.birth_date
                                        ? Math.floor((Date.now() - new Date(animal.birth_date).getTime()) / 86400000)
                                        : null;
                                      const graceDays = tp?.grace_period_days ?? 30;
                                      const deadlineAge = exp.timepoint_age_days != null ? exp.timepoint_age_days + graceDays : null;
                                      return (
                                        <div key={exp.id} className="flex items-center justify-between text-[11px] py-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-medium text-foreground">
                                              {animal?.identifier || "?"}
                                            </span>
                                            {cohort && (
                                              <span className="text-muted-foreground">({cohort.name})</span>
                                            )}
                                            {tp && (
                                              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                                {tp.name}
                                              </Badge>
                                            )}
                                            {ageDays != null && (
                                              <span className="text-muted-foreground">
                                                age {ageDays}d{deadlineAge != null ? ` / deadline ${deadlineAge}d` : ""}
                                              </span>
                                            )}
                                            {exp.status === "in_progress" && (
                                              <Badge className="h-4 px-1 text-[10px] bg-yellow-100 text-yellow-800">In Progress</Badge>
                                            )}
                                          </div>
                                          <span className="text-muted-foreground">{exp.scheduled_date}</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          );
                        });
                    })()}
                  </div>
                )}
              </div>
            )}
            {/* Upcoming experiments — grouped by experiment type */}
            {(() => {
              // Group upcoming by experiment type (across all dates this week)
              const groups = new Map<string, { animalIds: Set<string>; earliest: string; latest: string }>();
              for (const exp of upcoming) {
                if (!groups.has(exp.experiment_type)) {
                  groups.set(exp.experiment_type, { animalIds: new Set(), earliest: exp.scheduled_date!, latest: exp.scheduled_date! });
                }
                const g = groups.get(exp.experiment_type)!;
                g.animalIds.add(exp.animal_id);
                if (exp.scheduled_date! < g.earliest) g.earliest = exp.scheduled_date!;
                if (exp.scheduled_date! > g.latest) g.latest = exp.scheduled_date!;
              }
              return Array.from(groups.entries())
                .sort(([, a], [, b]) => a.earliest.localeCompare(b.earliest))
                .map(([type, g]) => {
                  const dLeft = daysUntil(g.earliest);
                  return (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className={dLeft <= 0 ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"} variant="secondary">
                          {dLeft <= 0 ? "TODAY" : `${dLeft}d`}
                        </Badge>
                        <span className="font-medium">
                          {EXPERIMENT_LABELS[type] || type}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {g.animalIds.size} {g.animalIds.size === 1 ? "animal" : "animals"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {g.earliest === g.latest ? g.earliest : `${g.earliest} → ${g.latest}`}
                      </span>
                    </div>
                  );
                });
            })()}
          </CardContent>
        </Card>
      )}

      {/* Google Drive Connection */}
      <Card className={driveStatus.connected ? "border-green-200 dark:border-green-800" : "border-dashed"}>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {driveStatus.connected ? (
              <Cloud className="h-5 w-5 text-green-500" />
            ) : (
              <CloudOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <div className="text-sm font-medium">
                {driveStatus.connected
                  ? `Google Drive connected${driveStatus.email ? ` (${driveStatus.email})` : ""}`
                  : "Google Drive not connected"}
              </div>
              <p className="text-xs text-muted-foreground">
                {driveStatus.connected
                  ? "Experiment results will be uploaded to your Drive automatically. Files are organized in BPAN Platform / Cohort / Animal."
                  : driveStatus.configured
                    ? "Connect your Google Drive to auto-upload experiment results."
                    : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment to enable Drive integration."}
              </p>
            </div>
          </div>
          {driveStatus.configured && (
            driveStatus.connected ? (
              <Button variant="outline" size="sm" onClick={disconnectGoogleDrive} disabled={driveLoading}>
                {driveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
              </Button>
            ) : (
              <Button size="sm" onClick={connectGoogleDrive} disabled={driveLoading}>
                {driveLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Cloud className="h-4 w-4 mr-1" />}
                Connect Drive
              </Button>
            )
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full flex flex-wrap gap-1 p-1.5 rounded-2xl" style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(99,102,241,0.15)", height: "auto" }}>
          <TabsTrigger value="animals" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">Animals</TabsTrigger>
          <TabsTrigger value="cohorts" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">Cohorts</TabsTrigger>
          <TabsTrigger value="breeders" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">Breeders</TabsTrigger>
          <TabsTrigger value="tracker" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">📋 Tracker</TabsTrigger>
          <TabsTrigger value="results" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">📊 Results</TabsTrigger>
          <TabsTrigger value="analysis" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">📈 Analysis</TabsTrigger>
          <TabsTrigger value="housing" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">Housing</TabsTrigger>
          <TabsTrigger value="cages" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">Cage Changes</TabsTrigger>
          <TabsTrigger value="pi" className="flex-1 min-w-[80px] rounded-xl text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">PI Access</TabsTrigger>
        </TabsList>

        {/* ─── Animals Tab ──────────────────────────────────────── */}
        <TabsContent value="animals" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterCohort} onValueChange={setFilterCohort}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Cohort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cohorts</SelectItem>
                {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterGenotype} onValueChange={setFilterGenotype}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Genotype" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genotypes</SelectItem>
                <SelectItem value="hemi_male">Hemi Male</SelectItem>
                <SelectItem value="wt_male">WT Male</SelectItem>
                <SelectItem value="het_female">Het Female</SelectItem>
                <SelectItem value="wt_female">WT Female</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button onClick={() => setShowAddAnimal(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Animal</Button>
            </div>
          </div>

          {sortedAnimals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mouse className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No animals yet. Add a cohort first, then add animals.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedAnimals.map((animal) => {
                const cohort = cohorts.find((c) => c.id === animal.cohort_id);
                const age = daysOld(animal.birth_date);
                const animalExps = experiments.filter((e) => e.animal_id === animal.id);
                const completedCount = animalExps.filter((e) => e.status === "completed").length;
                const totalCount = animalExps.length;

                return (
                  <Card
                    key={animal.id}
                    className={`cursor-pointer hover:border-primary/50 transition-colors border-l-4 ${
                      animal.genotype === "hemi"
                        ? "border-l-red-500"
                        : animal.genotype === "het"
                        ? "border-l-orange-500"
                        : "border-l-gray-300"
                    }`}
                    onClick={() => setSelectedAnimal(animal)}
                  >
                    <CardContent className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{animal.identifier}</span>
                          <Badge variant="outline" className="text-xs">{cohort?.name}</Badge>
                          <Badge variant="secondary" className="text-xs">{genotypeLabel(animal.sex, animal.genotype)}</Badge>
                          {animal.eeg_implanted && <Badge className="bg-purple-100 text-purple-700 text-xs" variant="secondary">EEG</Badge>}
                          {animal.status !== "active" && (
                            <Badge variant="destructive" className="text-xs">{animal.status}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                          <span>{age} days old</span>
                          {animal.ear_tag && animal.ear_tag !== "0000" && (
                            <MiniEarTag earTag={animal.ear_tag} size={22} />
                          )}
                          {animal.cage_number && <span>Cage: {animal.cage_number}</span>}
                          {totalCount > 0 && (
                            <span>{completedCount}/{totalCount} experiments done</span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Cohorts Tab ──────────────────────────────────────── */}
        <TabsContent value="cohorts" className="space-y-4">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBatchSchedule(true)}
            >
              <Calendar className="h-4 w-4 mr-1" /> Batch Schedule
            </Button>
            <Button onClick={() => setShowAddCohort(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Cohort</Button>
          </div>
          {cohorts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No cohorts yet.</div>
          ) : (
            <div className="space-y-2">
              {cohorts.map((c) => {
                const cage = cages.find((b) => b.id === c.breeder_cage_id);
                const cohortAnimals = animals.filter((a) => a.cohort_id === c.id && a.status === "active");
                const age = daysOld(c.birth_date);
                const cohortExpCount = experiments.filter(e => cohortAnimals.some(a => a.id === e.animal_id)).length;
                return (
                  <Card key={c.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {c.name}
                            <Badge variant="outline" className="text-xs">{age} days old</Badge>
                            <Badge variant="secondary" className="text-xs">{cohortAnimals.length} animals</Badge>
                            {cohortExpCount > 0 && (
                              <Badge variant="secondary" className="text-xs text-green-600">{cohortExpCount} experiments</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Born: {c.birth_date}{cage ? ` · From: ${cage.name}` : ""}
                            {c.litter_size ? ` · Litter: ${c.litter_size}` : ""}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              setSelectedTpAges(new Set(timepoints.map(tp => tp.age_days)));
                              setScheduleDialog({ type: "cohort", id: c.id, name: c.name });
                            }}
                          >
                            <Calendar className="h-3 w-3" /> Schedule
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedTpAges(new Set());
                              setDeleteStatusFilter(new Set());
                              setDeleteDialog({ type: "cohort", id: c.id, name: c.name });
                            }}
                          >
                            <Trash2 className="h-3 w-3" /> Delete Exps
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingCohort(c)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => act(actions.deleteCohort(c.id))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ─── Protocol Timepoints (merged from Timepoints tab) ── */}
          <Separator className="my-2" />
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">Protocol Timepoints</p>
              <p className="text-xs text-muted-foreground mt-0.5 italic">
                Week 0: Handling → Day 1: Y-Maze + Marble → Day 2: LDB + Nesting → Day 3: Core → Day 4–5: Acclimation → Day 6: CatWalk + RR Hab → Day 7: RR Test 1 → Day 8: RR Test 2 → Day 9: RR Recovery (calendar only) → Day 10: RR Stamina → Plasma is scheduled dynamically (+7d after last behavior, or +7d after EEG recording window)
              </p>
            </div>
            <Button onClick={() => setShowAddTP(true)} size="sm" className="flex-shrink-0">
              <Plus className="h-4 w-4 mr-1" /> Add Timepoint
            </Button>
          </div>
          {timepoints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No timepoints yet. Add timepoints like &quot;30-day&quot;, &quot;120-day&quot;, &quot;210-day&quot;.
            </div>
          ) : (
            <div className="space-y-2">
              {timepoints.map((tp) => (
                <Card key={tp.id}>
                  <CardContent className="py-3">
                    {(() => {
                      const preview = timepointProtocolPreview(tp);
                      return (
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          {tp.name}
                          <Badge variant="outline" className="text-xs">{tp.age_days} days</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tp.experiments.map((e) => (
                            <Badge key={e} variant="secondary" className="text-xs">
                              {PROTOCOL_DAY_LABELS[e] ? `${PROTOCOL_DAY_LABELS[e]}: ` : ""}{EXPERIMENT_LABELS[e] || e}
                            </Badge>
                          ))}
                          {tp.experiments.includes("rotarod_test2") && tp.experiments.includes("stamina") && (
                            <Badge variant="outline" className="text-xs border-slate-300 text-slate-600">
                              {PROTOCOL_DAY_LABELS.rotarod_recovery}: {EXPERIMENT_LABELS.rotarod_recovery}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-3">
                          <span>Handle {tp.handling_days_before}d before</span>
                          <span>Grace: {tp.grace_period_days ?? 30}d after</span>
                          <span>
                            Preview: behavior starts Day {preview.behaviorStartDay}, last behavior Day {preview.lastBehaviorDay}, plasma Day {preview.plasmaDay}
                          </span>
                          {tp.includes_eeg_implant && (
                            <span className="text-purple-600">
                              + EEG implant ({tp.eeg_implant_timing || "after"}) → {tp.eeg_recovery_days}d recovery → {tp.eeg_recording_days}d recording
                              {preview.recordingStartDay ? ` (recording starts Day ${preview.recordingStartDay})` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingTP(tp)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => act(actions.deleteColonyTimepoint(tp.id))}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Breeders Tab ─────────────────────────────────────── */}
        <TabsContent value="breeders" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAddCage(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Breeder Cage</Button>
          </div>
          {cages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No breeder cages yet.</div>
          ) : (
            <div className="space-y-2">
              {cages.map((c) => {
                const cageCohorts = cohorts.filter((co) => co.breeder_cage_id === c.id);
                const needsCheck = c.is_pregnant && c.last_check_date
                  ? (Date.now() - new Date(c.last_check_date).getTime()) / (1000 * 60 * 60 * 24) >= (c.check_interval_days || 7)
                  : c.is_pregnant;
                const daysPregnant = c.pregnancy_start_date
                  ? Math.floor((Date.now() - new Date(c.pregnancy_start_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                const daysToBirth = c.expected_birth_date
                  ? Math.ceil((new Date(c.expected_birth_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                return (
                  <Card key={c.id} className={needsCheck ? "border-pink-300 dark:border-pink-800" : ""}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {c.name}
                            {c.strain && <Badge variant="outline" className="text-xs">{c.strain}</Badge>}
                            <Badge variant="secondary" className="text-xs">{cageCohorts.length} cohorts</Badge>
                            {c.is_pregnant && (
                              <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300 text-xs">
                                🤰 Pregnant{daysPregnant != null ? ` (${daysPregnant}d)` : ""}
                              </Badge>
                            )}
                            {needsCheck && (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs animate-pulse">
                                ⏰ Check needed
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                            <span>{c.location || "No location"}{c.breeding_start ? ` · Since: ${c.breeding_start}` : ""}</span>
                            {c.is_pregnant && daysToBirth != null && daysToBirth > 0 && (
                              <span className="text-pink-600">· Expected birth in {daysToBirth}d ({c.expected_birth_date})</span>
                            )}
                            {c.is_pregnant && daysToBirth != null && daysToBirth <= 0 && (
                              <span className="text-red-600 font-medium">· Birth expected {Math.abs(daysToBirth)}d ago!</span>
                            )}
                            {c.last_check_date && (
                              <span>· Last checked: {c.last_check_date}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {c.is_pregnant && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={async () => {
                                const fd = new FormData();
                                fd.set("name", c.name);
                                fd.set("strain", c.strain || "");
                                fd.set("location", c.location || "");
                                fd.set("breeding_start", c.breeding_start || "");
                                fd.set("is_pregnant", "true");
                                fd.set("pregnancy_start_date", c.pregnancy_start_date || "");
                                fd.set("expected_birth_date", c.expected_birth_date || "");
                                fd.set("last_check_date", new Date().toISOString().split("T")[0]);
                                fd.set("check_interval_days", String(c.check_interval_days || 7));
                                fd.set("notes", c.notes || "");
                                const res = await actions.updateBreederCage(c.id, fd);
                                if (res.error) toast.error(res.error);
                                else { toast.success("Marked as checked today!"); refetchAll(); }
                              }}
                            >
                              <Check className="h-3 w-3" /> Checked
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditingCage(c)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => act(actions.deleteBreederCage(c.id))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Experiment Tracker Tab ─────────────────────────── */}
        <TabsContent value="tracker" className="space-y-4">
          <ExperimentTrackerMatrix
            animals={animals}
            cohorts={cohorts}
            timepoints={timepoints}
            experiments={experiments}
            onBatchUpdateStatus={actions.batchUpdateExperimentStatus}
            onBatchUpdated={refetchAll}
          />
        </TabsContent>

        {/* ─── Colony Results Tab ──────────────────────────────── */}
        <TabsContent value="results" className="space-y-4">
          <ColonyResultsTab
            animals={animals}
            cohorts={cohorts}
            timepoints={timepoints}
            colonyResults={colonyResults}
            batchUpsertColonyResults={async (tp, exp, entries) => {
              const result = await batchUpsertColonyResults(tp, exp, entries);
              if (result.success) await refetchAll();
              return result;
            }}
            reconcileTrackerFromExistingColonyResults={async () => {
              const result = await reconcileTrackerFromExistingColonyResults();
              if (result.success) await refetchAll();
              return result;
            }}
            deleteColonyResultMeasureColumn={async (tp, exp, fieldKey) => {
              const result = await deleteColonyResultMeasureColumn(tp, exp, fieldKey);
              if (result.success) await refetchAll();
              return result;
            }}
          />
        </TabsContent>

        {/* ─── Colony Analysis Tab ────────────────────────────── */}
        <TabsContent value="analysis" className="space-y-4">
          <ColonyAnalysisPanel
            animals={animals}
            cohorts={cohorts}
            timepoints={timepoints}
            colonyResults={colonyResults}
          />
        </TabsContent>

        {/* ─── Housing Cages Tab ──────────────────────────────── */}
        <TabsContent value="housing" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Track which mice are in which cage (max 5 per cage).
            </p>
            <Button onClick={() => setShowAddHousingCage(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Cage</Button>
          </div>

          {housingCages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Home className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No housing cages yet. Create one to start assigning animals.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {housingCages.filter(hc => hc.is_active).map((hc) => {
                const occupants = animals.filter(a => a.housing_cage_id === hc.id && a.status === "active");
                const isFull = occupants.length >= hc.max_occupancy;
                return (
                  <Card key={hc.id} className={isFull ? "border-orange-300" : ""}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Home className="h-4 w-4" />
                          {hc.cage_label}
                          <Badge variant="outline" className="text-[10px]">{hc.cage_type}</Badge>
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditingHousingCage(hc)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => act(actions.deleteHousingCage(hc.id))}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-2 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          {hc.cage_id && <span className="font-medium text-foreground">ID: {hc.cage_id}</span>}
                          <span>{hc.location || "No location"}</span>
                        </div>
                        <Badge className={`text-[10px] ${isFull ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                          {occupants.length}/{hc.max_occupancy}
                        </Badge>
                      </div>
                      {occupants.length > 0 ? (
                        <div className="space-y-1">
                          {occupants.map(a => (
                            <div key={a.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                              <div className="flex items-center gap-1.5">
                                <Mouse className="h-3 w-3" />
                                <span className="font-medium">{a.identifier}</span>
                                <span className="text-muted-foreground">{genotypeLabel(a.sex, a.genotype)}</span>
                              </div>
                              <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]"
                                onClick={() => act(actions.assignAnimalToCage(a.id, null))}>
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Empty cage</p>
                      )}
                      {!isFull && (
                        <Select onValueChange={(animalId) => act(actions.assignAnimalToCage(animalId, hc.id))}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="+ Assign animal..." />
                          </SelectTrigger>
                          <SelectContent>
                            {animals
                              .filter(a => a.status === "active" && !a.housing_cage_id)
                              .map(a => {
                                const cohortName = cohorts.find(c => c.id === a.cohort_id)?.name;
                                return (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.identifier} — {cohortName ? `${cohortName} · ` : ""}{genotypeLabel(a.sex, a.genotype)}
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                      )}
                      {hc.notes && <p className="text-xs text-muted-foreground">{hc.notes}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Unhoused animals */}
          {(() => {
            const unhoused = animals.filter(a => a.status === "active" && !a.housing_cage_id);
            if (unhoused.length === 0) return null;
            return (
              <Card className="border-dashed">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm text-muted-foreground">
                    Unhoused Animals ({unhoused.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {unhoused.map(a => (
                      <Badge key={a.id} variant="outline" className="text-xs gap-1">
                        <Mouse className="h-3 w-3" />
                        {a.identifier}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ─── Cage Changes Tab ────────────────────────────────── */}
        <TabsContent value="cages" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Track bi-weekly cage changes for all animals. Generate upcoming dates and mark them done.
            </p>
            <Button onClick={() => setShowGenerateCageChanges(true)} size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Generate Schedule
            </Button>
          </div>
          {cageChanges.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No cage changes scheduled.</p>
              <p className="text-xs mt-1">Click &quot;Generate Schedule&quot; to create bi-weekly cage change reminders.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cageChanges.map((cc) => {
                const dLeft = daysUntil(cc.scheduled_date);
                const isPast = dLeft < 0;
                return (
                  <Card key={cc.id} className={cc.is_completed ? "opacity-60" : isPast && !cc.is_completed ? "border-red-300 dark:border-red-700" : ""}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                              cc.is_completed
                                ? "bg-green-500 border-green-500 text-white"
                                : "border-gray-300 hover:border-primary"
                            }`}
                            onClick={() => act(actions.toggleCageChange(cc.id, !cc.is_completed))}
                          >
                            {cc.is_completed && <Check className="h-3.5 w-3.5" />}
                          </button>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium text-sm ${cc.is_completed ? "line-through" : ""}`}>
                                Cage Change
                              </span>
                              <Badge variant="outline" className="text-xs">{cc.scheduled_date}</Badge>
                              {!cc.is_completed && dLeft <= 1 && dLeft >= 0 && (
                                <Badge className="bg-orange-100 text-orange-700 text-xs" variant="secondary">
                                  {dLeft === 0 ? "TODAY" : "TOMORROW"}
                                </Badge>
                              )}
                              {isPast && !cc.is_completed && (
                                <Badge variant="destructive" className="text-xs">
                                  {Math.abs(dLeft)} days overdue
                                </Badge>
                              )}
                            </div>
                            {cc.completed_date && (
                              <div className="text-xs text-muted-foreground">Completed: {cc.completed_date}</div>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => act(actions.deleteCageChange(cc.id))}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── PI Access Tab ────────────────────────────────────── */}
        <TabsContent value="pi" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Give your PI a live, read-only view of your colony progress. They don&apos;t need an account.
            </p>
            <Button onClick={() => setShowAddPI(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add PI Access</Button>
          </div>
          {portals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No advisor access configured.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {portals.map((p) => (
                <Card key={p.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{p.advisor_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.advisor_email || "No email"}
                          {p.last_viewed_at ? ` · Last viewed: ${new Date(p.last_viewed_at).toLocaleDateString()}` : " · Not viewed yet"}
                        </div>
                        <div className="flex gap-1 mt-1">
                          {p.can_see.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => copyPILink(p.token)}>
                          {copiedToken === p.token ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          {copiedToken === p.token ? "Copied!" : "Copy Link"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => act(actions.deleteAdvisorAccess(p.id))}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ─── Lab Gallery ──────────────────────────────────── */}
          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Lab Gallery
                <span className="text-xs text-muted-foreground font-normal">— auto-rotates on PI portal</span>
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowAddPhoto(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Photo
              </Button>
            </div>
            {photos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No photos yet. Add image URLs (e.g. Google Drive share links) to show a looping gallery on the PI portal.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative group rounded-md overflow-hidden border bg-muted h-36 sm:h-40 lg:h-44">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={convertDriveUrl(p.image_url)}
                      alt={p.caption || "Lab photo"}
                      className="w-full h-full object-contain bg-white"
                      referrerPolicy="no-referrer"
                    />
                    {p.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                        <p className="text-white text-xs truncate">{p.caption}</p>
                      </div>
                    )}
                    {!p.show_in_portal && (
                      <Badge className="absolute top-1 left-1 text-xs bg-yellow-500 text-white border-0">Hidden</Badge>
                    )}
                    <Button
                      variant="destructive" size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => act(actions.deleteColonyPhoto(p.id))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Dialogs ────────────────────────────────────────────── */}

      {/* Add Photo */}
      <Dialog
        open={showAddPhoto}
        onOpenChange={(open) => {
          setShowAddPhoto(open);
          if (!open) {
            setPhotoUrlInput("");
            setPhotoUploading(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Add Lab Photo</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => handleFormAction(actions.addColonyPhoto, e, () => { setShowAddPhoto(false); setPhotoUrlInput(""); })}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs">Image URL *</Label>
              <Input
                name="image_url"
                required
                value={photoUrlInput}
                onChange={(e) => setPhotoUrlInput(e.target.value)}
                placeholder="https://drive.google.com/... or direct image URL"
              />
              <p className="text-xs text-muted-foreground mt-1">Paste a Google Drive share link or upload a file directly to your linked Google Drive.</p>
              {driveStatus.connected && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    ref={photoUploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadLabPhotoToDrive(file);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={photoUploading}
                    onClick={() => photoUploadInputRef.current?.click()}
                  >
                    {photoUploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                    Upload to Google Drive
                  </Button>
                  <span className="text-xs text-muted-foreground">BPAN saves only the Drive link.</span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Caption</Label>
              <Input name="caption" placeholder="e.g. Rotarod test setup, Cohort 3 day 1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Experiment Type</Label>
                <Select name="experiment_type">
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPERIMENT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date Taken</Label>
                <Input name="taken_date" type="date" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="show_in_portal" id="show_in_portal_check" defaultChecked className="h-4 w-4" />
              <Label htmlFor="show_in_portal_check" className="text-xs cursor-pointer">Show in PI portal gallery</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddPhoto(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add Photo</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Animal */}
      <Dialog open={showAddAnimal || !!editingAnimal} onOpenChange={(v) => { if (!v) { setShowAddAnimal(false); setEditingAnimal(null); setAnimalFormCohortId(""); setAnimalFormEarTag("0000"); setAnimalFormSex(""); setAnimalFormGenotype(""); setSuggestedIdentifier(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingAnimal ? "Edit Animal" : "Add Animal"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            if (editingAnimal) {
              handleFormAction((fd) => actions.updateAnimal(editingAnimal.id, fd), e, () => { setEditingAnimal(null); setAnimalFormCohortId(""); setAnimalFormEarTag("0000"); setAnimalFormSex(""); setAnimalFormGenotype(""); setSuggestedIdentifier(""); });
            } else {
              handleFormAction(actions.createAnimal, e, () => { setShowAddAnimal(false); setAnimalFormCohortId(""); setAnimalFormEarTag("0000"); setAnimalFormSex(""); setAnimalFormGenotype(""); setSuggestedIdentifier(""); });
            }
          }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cohort *</Label>
                <Select
                  name="cohort_id"
                  required
                  defaultValue={editingAnimal?.cohort_id || ""}
                  onValueChange={(val) => {
                    setAnimalFormCohortId(val);
                    // Auto-fill birth date from cohort
                    const selectedCohort = cohorts.find((c) => c.id === val);
                    if (selectedCohort?.birth_date && birthDateRef.current) {
                      if (!birthDateRef.current.value || birthDateRef.current.value === (cohorts.find((c) => c.id === animalFormCohortId)?.birth_date || "")) {
                        birthDateRef.current.value = selectedCohort.birth_date;
                      }
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.birth_date ? ` (${c.birth_date})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sex *</Label>
                <Select name="sex" required defaultValue={editingAnimal?.sex || ""} onValueChange={(v) => setAnimalFormSex(v)}>
                  <SelectTrigger><SelectValue placeholder="Sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Genotype *</Label>
                <Select name="genotype" required defaultValue={editingAnimal?.genotype || ""} onValueChange={(v) => setAnimalFormGenotype(v)}>
                  <SelectTrigger><SelectValue placeholder="Genotype" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hemi">Hemizygous (Hemi)</SelectItem>
                    <SelectItem value="wt">Wild-type (WT)</SelectItem>
                    <SelectItem value="het">Heterozygous (Het)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">
                  Identifier *
                  {suggestedIdentifier && !editingAnimal && (
                    <span className="ml-1 text-muted-foreground font-normal">(auto-suggested: {suggestedIdentifier})</span>
                  )}
                </Label>
                <Input
                  ref={identifierRef}
                  name="identifier"
                  placeholder={suggestedIdentifier || "e.g. BPAN1-HM-001"}
                  required
                  defaultValue={editingAnimal?.identifier || ""}
                  onChange={() => {
                    if (identifierRef.current) identifierRef.current.dataset.autoSuggested = "false";
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">Birth Date * <span className="text-muted-foreground">(auto-filled from cohort)</span></Label>
                <Input ref={birthDateRef} name="birth_date" type="date" required defaultValue={editingAnimal?.birth_date || ""} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs mb-2 block">Ear Punch Tag</Label>
                <input type="hidden" name="ear_tag" value={animalFormEarTag} />
                <EarTagSelector
                  value={animalFormEarTag}
                  onChange={setAnimalFormEarTag}
                />
              </div>
              <div>
                <Label className="text-xs">Cage #</Label>
                <Input name="cage_number" placeholder="Optional" defaultValue={editingAnimal?.cage_number || ""} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select name="status" defaultValue={editingAnimal?.status || "active"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="deceased">Deceased</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="notes" placeholder="Optional notes" rows={2} defaultValue={editingAnimal?.notes || ""} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowAddAnimal(false); setEditingAnimal(null); }}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editingAnimal ? "Save Changes" : "Add Animal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Cohort */}
      <Dialog open={showAddCohort || !!editingCohort} onOpenChange={(v) => { if (!v) { setShowAddCohort(false); setEditingCohort(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCohort ? "Edit Cohort" : "Add Cohort"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            if (editingCohort) {
              handleFormAction((fd) => actions.updateCohort(editingCohort.id, fd), e, () => setEditingCohort(null));
            } else {
              handleFormAction(actions.createCohort, e, () => setShowAddCohort(false));
            }
          }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cohort Name *</Label>
                <Input name="name" placeholder="e.g. BPAN 1" required defaultValue={editingCohort?.name || ""} />
              </div>
              <div>
                <Label className="text-xs">Birth Date *</Label>
                <Input name="birth_date" type="date" required defaultValue={editingCohort?.birth_date || ""} />
              </div>
              <div>
                <Label className="text-xs">Breeder Cage</Label>
                <Select name="breeder_cage_id" defaultValue={editingCohort?.breeder_cage_id || ""}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {cages.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Litter Size</Label>
                <Input name="litter_size" type="number" placeholder="Optional" defaultValue={editingCohort?.litter_size ?? ""} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="notes" placeholder="Optional" rows={2} defaultValue={editingCohort?.notes || ""} />
            </div>
            {!editingCohort && (
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="hidden" name="create_followup_tasks" value="false" />
                  <input
                    type="checkbox"
                    name="create_followup_tasks"
                    value="true"
                    defaultChecked
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="text-xs text-muted-foreground">
                    Create follow-up reminders automatically from DOB:
                    <span className="block mt-1">
                      Day 21 for pup count/sex/weaning details, and Day 30 (30–35d window) for genotyping follow-up.
                    </span>
                  </span>
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowAddCohort(false); setEditingCohort(null); }}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{editingCohort ? "Save Changes" : "Add Cohort"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Breeder Cage */}
      <Dialog open={showAddCage || !!editingCage} onOpenChange={(v) => { if (!v) { setShowAddCage(false); setEditingCage(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCage ? "Edit Breeder Cage" : "Add Breeder Cage"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            if (editingCage) {
              handleFormAction((fd) => actions.updateBreederCage(editingCage.id, fd), e, () => setEditingCage(null));
            } else {
              handleFormAction(actions.createBreederCage, e, () => setShowAddCage(false));
            }
          }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">Cage Name *</Label><Input name="name" required placeholder="e.g. Breeder A" defaultValue={editingCage?.name || ""} /></div>
              <div><Label className="text-xs">Strain</Label><Input name="strain" placeholder="e.g. BPAN / ATP13A2" defaultValue={editingCage?.strain || ""} /></div>
              <div><Label className="text-xs">Location</Label><Input name="location" placeholder="Room, rack" defaultValue={editingCage?.location || ""} /></div>
              <div><Label className="text-xs">Breeding Start</Label><Input name="breeding_start" type="date" defaultValue={editingCage?.breeding_start || ""} /></div>
            </div>
            <Separator />
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="hidden" name="is_pregnant" value="false" />
                <input type="checkbox" name="is_pregnant" value="true" className="h-4 w-4" defaultChecked={editingCage?.is_pregnant || false} />
                🤰 Currently Pregnant
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs">Pregnancy Start</Label><Input name="pregnancy_start_date" type="date" defaultValue={editingCage?.pregnancy_start_date || ""} /></div>
                <div><Label className="text-xs">Expected Birth</Label><Input name="expected_birth_date" type="date" defaultValue={editingCage?.expected_birth_date || ""} /></div>
                <div><Label className="text-xs">Last Checked</Label><Input name="last_check_date" type="date" defaultValue={editingCage?.last_check_date || ""} /></div>
                <div><Label className="text-xs">Check Every (days)</Label><Input name="check_interval_days" type="number" min={1} defaultValue={editingCage?.check_interval_days ?? 7} /></div>
              </div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea name="notes" rows={2} defaultValue={editingCage?.notes || ""} /></div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowAddCage(false); setEditingCage(null); }}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{editingCage ? "Save Changes" : "Add Cage"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Timepoint */}
      <Dialog open={showAddTP || !!editingTP} onOpenChange={(v) => { if (!v) { setShowAddTP(false); setEditingTP(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTP ? "Edit Timepoint" : "Add Timepoint"}</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              if (editingTP) {
                void handleTimepointEditSubmit(e);
              } else {
                handleFormAction(actions.createColonyTimepoint, e, () => setShowAddTP(false));
              }
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input name="name" defaultValue={editingTP?.name || ""} required placeholder="e.g. 30-day Behavioral" />
              </div>
              <div>
                <Label className="text-xs">Age (days) *</Label>
                <Input name="age_days" type="number" defaultValue={editingTP?.age_days || ""} required placeholder="e.g. 60" />
              </div>
              <div>
                <Label className="text-xs">Handling Days Before</Label>
                <Input name="handling_days_before" type="number" defaultValue={editingTP?.handling_days_before ?? 5} />
              </div>
              <div>
                <Label className="text-xs">Grace Period (days)</Label>
                <Input name="grace_period_days" type="number" defaultValue={editingTP?.grace_period_days ?? 30} min={0} />
              </div>
              <div>
                <Label className="text-xs">Sort Order</Label>
                <Input name="sort_order" type="number" defaultValue={editingTP?.sort_order ?? 0} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Experiments (protocol auto-assigns days)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {EXPERIMENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      name="experiments"
                      value={t}
                      defaultChecked={editingTP?.experiments.includes(t) ?? true}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-muted-foreground">{PROTOCOL_DAY_LABELS[t] || ""}</span> {EXPERIMENT_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="includes_eeg_implant"
                  value="true"
                  defaultChecked={editingTP?.includes_eeg_implant}
                  className="h-4 w-4"
                />
                Includes EEG implant surgery (one-time)
              </label>
              <div className="grid grid-cols-2 gap-3 mt-2 ml-6">
                <div className="col-span-2">
                  <Label className="text-xs">Implant timing (for this timepoint)</Label>
                  <select
                    name="eeg_implant_timing"
                    defaultValue={editingTP?.eeg_implant_timing || "after"}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="before">Before behavior battery (recover, then test)</option>
                    <option value="after">After behavior battery (implant after tests)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Recovery Days</Label>
                  <Input name="eeg_recovery_days" type="number" defaultValue={editingTP?.eeg_recovery_days ?? 7} />
                </div>
                <div>
                  <Label className="text-xs">Recording Days</Label>
                  <Input name="eeg_recording_days" type="number" defaultValue={editingTP?.eeg_recording_days ?? 3} />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="notes" defaultValue={editingTP?.notes || ""} rows={2} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowAddTP(false); setEditingTP(null); }}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{editingTP ? "Save Changes" : "Add Timepoint"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Timepoint update -> reschedule prompt */}
      <Dialog open={!!tpReschedulePrompt} onOpenChange={(open) => { if (!open) setTpReschedulePrompt(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reschedule pre-scheduled experiments for updated timepoint?</DialogTitle>
          </DialogHeader>
          {tpReschedulePrompt && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You updated <span className="font-medium text-foreground">{tpReschedulePrompt.tpName}</span> ({tpReschedulePrompt.oldAgeDays}d
                {tpReschedulePrompt.oldAgeDays !== tpReschedulePrompt.newAgeDays ? ` → ${tpReschedulePrompt.newAgeDays}d` : ""}).
                Select which pre-scheduled experiments and animals should be recalculated from the new timepoint settings.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Experiment Types</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setTpRescheduleSelectedExperimentTypes(new Set(tpReschedulePrompt.affectedExperimentTypes))}
                    >
                      All
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-auto space-y-1">
                    {tpReschedulePrompt.affectedExperimentTypes.map((expType) => (
                      <label key={expType} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tpRescheduleSelectedExperimentTypes.has(expType)}
                          onChange={(ev) => {
                            setTpRescheduleSelectedExperimentTypes((prev) => {
                              const next = new Set(prev);
                              if (ev.target.checked) next.add(expType);
                              else next.delete(expType);
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                        <span>{EXPERIMENT_LABELS[expType] || expType}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Animals</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setTpRescheduleSelectedAnimalIds(new Set(tpReschedulePrompt.affectedAnimalIds))}
                    >
                      All
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-auto space-y-1">
                    {tpReschedulePrompt.affectedAnimalIds.map((animalId) => {
                      const animal = animals.find((a) => a.id === animalId);
                      if (!animal) return null;
                      const cohort = cohorts.find((c) => c.id === animal.cohort_id);
                      return (
                        <label key={animalId} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tpRescheduleSelectedAnimalIds.has(animalId)}
                            onChange={(ev) => {
                              setTpRescheduleSelectedAnimalIds((prev) => {
                                const next = new Set(prev);
                                if (ev.target.checked) next.add(animalId);
                                else next.delete(animalId);
                                return next;
                              });
                            }}
                            className="h-4 w-4"
                          />
                          <span>{animal.identifier}</span>
                          <span className="text-xs text-muted-foreground">{cohort?.name || "Unknown cohort"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setTpReschedulePrompt(null)} disabled={tpRescheduleBusy}>
                  Skip for now
                </Button>
                <Button
                  type="button"
                  disabled={tpRescheduleBusy || tpRescheduleSelectedAnimalIds.size === 0 || tpRescheduleSelectedExperimentTypes.size === 0}
                  onClick={async () => {
                    if (!tpReschedulePrompt) return;
                    setTpRescheduleBusy(true);
                    const result = await actions.rescheduleExperimentsAfterTimepointEdit(
                      tpReschedulePrompt.oldAgeDays,
                      tpReschedulePrompt.newAgeDays,
                      [...tpRescheduleSelectedAnimalIds],
                      [...tpRescheduleSelectedExperimentTypes]
                    );
                    setTpRescheduleBusy(false);
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(`Rescheduled ${result.updated ?? 0} experiment${(result.updated ?? 0) === 1 ? "" : "s"} from updated timepoint`);
                    setTpReschedulePrompt(null);
                    await refetchAll();
                  }}
                >
                  {tpRescheduleBusy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Reschedule Selected
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Cage Changes */}
      <Dialog open={showGenerateCageChanges} onOpenChange={setShowGenerateCageChanges}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Cage Change Schedule</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const fd = new FormData(e.currentTarget);
              const result = await actions.generateCageChanges(
                fd.get("start_date") as string,
                parseInt(fd.get("count") as string) || 12
              );
              setBusy(false);
              if (result.error) toast.error(result.error);
              else { toast.success(`Generated ${result.count} cage change reminders!`); setShowGenerateCageChanges(false); refetchAll(); }
            }}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs">First Cage Change Date</Label>
              <Input name="start_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
            </div>
            <div>
              <Label className="text-xs">Number of cage changes to generate (every 2 weeks)</Label>
              <Input name="count" type="number" defaultValue="12" min="1" max="52" />
            </div>
            <p className="text-xs text-muted-foreground">This will create cage change reminders every 14 days starting from the date above.</p>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowGenerateCageChanges(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Generate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Schedule Experiments Dialog ───────────────────── */}
      <Dialog open={!!scheduleDialog} onOpenChange={(v) => { if (!v) setScheduleDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Schedule Experiments — {scheduleDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which timepoints to schedule. Already-scheduled experiments will be skipped (no duplicates).
            </p>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Timepoints</Label>
              <div className="flex flex-wrap gap-2">
                {timepoints.map((tp) => {
                  const isSelected = selectedTpAges.has(tp.age_days);
                  return (
                    <Button
                      key={tp.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const next = new Set(selectedTpAges);
                        if (isSelected) next.delete(tp.age_days);
                        else next.add(tp.age_days);
                        setSelectedTpAges(next);
                      }}
                    >
                      {tp.name} ({tp.age_days}d)
                    </Button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-1">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedTpAges(new Set(timepoints.map(tp => tp.age_days)))}>Select all</Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedTpAges(new Set())}>Select none</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialog(null)}>Cancel</Button>
              <Button
                disabled={busy || selectedTpAges.size === 0}
                onClick={async () => {
                  if (!scheduleDialog) return;
                  setBusy(true);
                  try {
                    const tpAges = Array.from(selectedTpAges);
                    if (scheduleDialog.type === "cohort") {
                      const res = await actions.scheduleExperimentsForCohort(scheduleDialog.id, tpAges);
                      if (res.error) toast.error(res.error);
                      else {
                        toast.success(`Scheduled ${res.total} experiments for ${res.scheduled} animals!`);
                        if (res.errors && res.errors.length > 0) {
                          toast.error(`${res.errors.length} errors: ${res.errors[0]}`);
                        }
                      }
                    } else {
                      const res = await actions.scheduleExperimentsForAnimal(scheduleDialog.id, scheduleDialog.birthDate!, tpAges);
                      if (res.error) toast.error(res.error);
                      else toast.success(`Scheduled ${res.count} experiments!`);
                    }
                    await refetchAll();
                    router.refresh();
                    setScheduleDialog(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Schedule {selectedTpAges.size} timepoint{selectedTpAges.size !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Experiments Dialog ───────────────────── */}
      <Dialog open={!!deleteDialog} onOpenChange={(v) => { if (!v) setDeleteDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete Experiments — {deleteDialog?.name}
            </DialogTitle>
          </DialogHeader>
          {deleteDialog && (() => {
            // Get actual timepoint values from existing experiments for this target
            const targetExps = deleteDialog.type === "cohort"
              ? experiments.filter(e => {
                  const animal = animals.find(a => a.id === e.animal_id);
                  return animal?.cohort_id === deleteDialog.id;
                })
              : experiments.filter(e => e.animal_id === deleteDialog.id);
            const actualTpAges = [...new Set(targetExps.map(e => e.timepoint_age_days).filter((v): v is number => v != null))].sort((a, b) => a - b);
            const actualStatuses = [...new Set(targetExps.map(e => e.status))].sort();
            // Count matching
            const matchCount = targetExps.filter(e => {
              if (selectedTpAges.size > 0 && e.timepoint_age_days != null && !selectedTpAges.has(e.timepoint_age_days)) return false;
              if (deleteStatusFilter.size > 0 && !deleteStatusFilter.has(e.status)) return false;
              return true;
            }).length;

            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This {deleteDialog.type} has <strong>{targetExps.length}</strong> experiment{targetExps.length !== 1 ? "s" : ""}. Choose which to delete.
                </p>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Filter by Timepoint (empty = all)</Label>
                  <div className="flex flex-wrap gap-2">
                    {actualTpAges.map((age) => {
                      const tp = timepoints.find(t => t.age_days === age);
                      const isSelected = selectedTpAges.has(age);
                      const count = targetExps.filter(e => e.timepoint_age_days === age).length;
                      return (
                        <Button
                          key={age}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const next = new Set(selectedTpAges);
                            if (isSelected) next.delete(age);
                            else next.add(age);
                            setSelectedTpAges(next);
                          }}
                        >
                          {tp ? tp.name : `${age}d`} ({count})
                        </Button>
                      );
                    })}
                    {actualTpAges.length === 0 && (
                      <span className="text-xs text-muted-foreground">No experiments found</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedTpAges(new Set(actualTpAges))}>Select all</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedTpAges(new Set())}>None (= all)</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Filter by Status (empty = all)</Label>
                  <div className="flex flex-wrap gap-2">
                    {actualStatuses.map((s) => {
                      const isSelected = deleteStatusFilter.has(s);
                      const count = targetExps.filter(e => e.status === s).length;
                      return (
                        <Button
                          key={s}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          className={`h-7 text-xs ${isSelected ? "bg-destructive hover:bg-destructive/90" : ""}`}
                          onClick={() => {
                            const next = new Set(deleteStatusFilter);
                            if (isSelected) next.delete(s);
                            else next.add(s);
                            setDeleteStatusFilter(next);
                          }}
                        >
                          {s} ({count})
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Tip: select only &quot;scheduled&quot; + &quot;pending&quot; to keep completed experiments
                  </p>
                </div>

                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm">
                  Will delete <strong className="text-destructive">{selectedTpAges.size === 0 && deleteStatusFilter.size === 0 ? targetExps.length : matchCount}</strong> experiment{(selectedTpAges.size === 0 && deleteStatusFilter.size === 0 ? targetExps.length : matchCount) !== 1 ? "s" : ""}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    disabled={busy || targetExps.length === 0}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        // Pass empty array for timepoints = no filter = delete all matching status
                        const tpAges = selectedTpAges.size > 0 ? Array.from(selectedTpAges) : undefined;
                        const statuses = deleteStatusFilter.size > 0 ? Array.from(deleteStatusFilter) : undefined;
                        if (deleteDialog.type === "cohort") {
                          const res = await actions.deleteExperimentsForCohort(deleteDialog.id, tpAges, statuses);
                          if (res.error) toast.error(res.error);
                          else toast.success(`Deleted ${res.deleted} experiments across ${res.animals} animals`);
                        } else {
                          const res = await actions.deleteExperimentsForAnimal(deleteDialog.id, tpAges, statuses);
                          if (res.error) toast.error(res.error);
                          else toast.success(`Deleted ${res.deleted} experiments`);
                        }
                        await refetchAll();
                        router.refresh();
                        setDeleteDialog(null);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Delete {selectedTpAges.size === 0 && deleteStatusFilter.size === 0 ? "ALL" : ""} Experiments
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add PI Access */}
      <Dialog open={showAddPI} onOpenChange={setShowAddPI}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add PI / Advisor Access</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const fd = new FormData(e.currentTarget);
              const result = await actions.createAdvisorAccess(fd);
              setBusy(false);
              if (result.error) {
                toast.error(result.error);
              } else {
                const url = `${window.location.origin}/pi/${result.token}`;
                navigator.clipboard.writeText(url);
                toast.success("Access created! Link copied to clipboard.");
                setShowAddPI(false);
                await refetchAll();
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs">Advisor Name *</Label>
              <Input name="advisor_name" required placeholder="e.g. Dr. Smith" />
            </div>
            <div>
              <Label className="text-xs">Advisor Email</Label>
              <Input name="advisor_email" type="email" placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">What can they see?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {["animals", "experiments", "results", "timeline", "colony_results"].map((item) => (
                  <label key={item} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" name="can_see" value={item} defaultChecked className="h-3.5 w-3.5" />
                    {item === "colony_results" ? "Data & Analysis" : item.charAt(0).toUpperCase() + item.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddPI(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Create & Copy Link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Batch Schedule Dialog ──────────────────────────────── */}
      <Dialog open={showBatchSchedule} onOpenChange={(v) => { if (!v) { setShowBatchSchedule(false); setBatchSelectedAnimalIds(new Set()); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Batch Schedule Experiment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Experiment Type *</Label>
                <Select value={batchExpType} onValueChange={setBatchExpType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_EXPERIMENT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{EXPERIMENT_LABELS[t] || t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Timepoint (days) <span className="text-muted-foreground font-normal">optional</span></Label>
                <Select value={batchTimepointAgeDays || "none"} onValueChange={v => setBatchTimepointAgeDays(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {timepoints.map(tp => (
                      <SelectItem key={tp.id} value={String(tp.age_days)}>{tp.name} ({tp.age_days}d)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Animals *</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline"
                    onClick={() => setBatchSelectedAnimalIds(new Set(animals.filter(a => a.status === "active").map(a => a.id)))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:underline"
                    onClick={() => setBatchSelectedAnimalIds(new Set())}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="border rounded-md max-h-[240px] overflow-y-auto divide-y">
                {cohorts.map(cohort => {
                  const cohortAnimals = animals.filter(a => a.cohort_id === cohort.id && a.status === "active");
                  if (cohortAnimals.length === 0) return null;
                  const allSelected = cohortAnimals.every(a => batchSelectedAnimalIds.has(a.id));
                  return (
                    <div key={cohort.id}>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            const next = new Set(batchSelectedAnimalIds);
                            if (allSelected) cohortAnimals.forEach(a => next.delete(a.id));
                            else cohortAnimals.forEach(a => next.add(a.id));
                            setBatchSelectedAnimalIds(next);
                          }}
                          className="rounded"
                        />
                        <span className="text-xs font-semibold">{cohort.name}</span>
                        <span className="text-[10px] text-muted-foreground">({cohortAnimals.length} active)</span>
                      </div>
                      {cohortAnimals.map(a => (
                        <label key={a.id} className="flex items-center gap-2 px-4 py-1 hover:bg-muted/20 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={batchSelectedAnimalIds.has(a.id)}
                            onChange={() => {
                              const next = new Set(batchSelectedAnimalIds);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              setBatchSelectedAnimalIds(next);
                            }}
                            className="rounded"
                          />
                          <span className="text-xs font-medium">{a.identifier}</span>
                          <span className="text-[10px] text-muted-foreground">{GENOTYPE_LABELS[a.genotype]} · {a.sex}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{batchSelectedAnimalIds.size} animal(s) selected</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { setShowBatchSchedule(false); setBatchSelectedAnimalIds(new Set()); }}>Cancel</Button>
            <Button
              disabled={busy || batchSelectedAnimalIds.size === 0 || !batchDate}
              onClick={async () => {
                setBusy(true);
                const result = await actions.batchScheduleSingleExperiment(
                  Array.from(batchSelectedAnimalIds),
                  batchExpType,
                  batchDate,
                  batchTimepointAgeDays ? parseInt(batchTimepointAgeDays) : null
                );
                setBusy(false);
                if (result.error) {
                  toast.error(`Error: ${result.error}`);
                } else {
                  toast.success(`Scheduled ${EXPERIMENT_LABELS[batchExpType] || batchExpType} for ${batchSelectedAnimalIds.size} animal(s)`);
                  setShowBatchSchedule(false);
                  setBatchSelectedAnimalIds(new Set());
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Schedule {batchSelectedAnimalIds.size > 0 ? `(${batchSelectedAnimalIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add/Edit Housing Cage Dialog ──────────────────────── */}
      <Dialog open={showAddHousingCage || !!editingHousingCage} onOpenChange={(v) => { if (!v) { setShowAddHousingCage(false); setEditingHousingCage(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingHousingCage ? "Edit" : "Add"} Housing Cage</DialogTitle></DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              act(editingHousingCage
                ? actions.updateHousingCage(editingHousingCage.id, fd)
                : actions.createHousingCage(fd)
              ).then(() => { setShowAddHousingCage(false); setEditingHousingCage(null); });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cage Label *</Label>
                <Input name="cage_label" required defaultValue={editingHousingCage?.cage_label || ""} placeholder="e.g. Cohort 2 Group A" />
              </div>
              <div>
                <Label className="text-xs">Cage ID <span className="text-muted-foreground font-normal">(rack/barcode)</span></Label>
                <Input name="cage_id" defaultValue={editingHousingCage?.cage_id || ""} placeholder="e.g. Rack3-B2" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Location</Label>
                <Input name="location" defaultValue={editingHousingCage?.location || ""} placeholder="Room, Rack, Shelf" />
              </div>
              <div>
                <Label className="text-xs">Max Mice</Label>
                <Input name="max_occupancy" type="number" min="1" max="10" defaultValue={editingHousingCage?.max_occupancy || 5} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cage Type</Label>
              <Select name="cage_type" defaultValue={editingHousingCage?.cage_type || "standard"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="eeg">EEG</SelectItem>
                  <SelectItem value="recovery">Recovery</SelectItem>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="notes" defaultValue={editingHousingCage?.notes || ""} rows={2} />
            </div>
            {editingHousingCage && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" value="true" defaultChecked={editingHousingCage.is_active} />
                Active
              </label>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowAddHousingCage(false); setEditingHousingCage(null); }}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{editingHousingCage ? "Save" : "Add Cage"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Animal Detail Dialog ─────────────────────────────── */}
      <Dialog open={!!selectedAnimal} onOpenChange={(v) => { if (!v) setSelectedAnimal(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedAnimal && (
            <AnimalDetail
              animal={selectedAnimal}
              cohort={cohorts.find((c) => c.id === selectedAnimal.cohort_id)}
              experiments={experiments.filter((e) => e.animal_id === selectedAnimal.id)}
              timepoints={timepoints}
              driveConnected={driveStatus.connected}
              onSchedule={() => {
                setSelectedTpAges(new Set(timepoints.map(tp => tp.age_days)));
                setScheduleDialog({ type: "animal", id: selectedAnimal.id, name: selectedAnimal.identifier, birthDate: selectedAnimal.birth_date });
              }}
              onDeleteAllExps={() => {
                setSelectedTpAges(new Set());
                setDeleteStatusFilter(new Set());
                setDeleteDialog({ type: "animal", id: selectedAnimal.id, name: selectedAnimal.identifier });
              }}
              onUpdateStatus={handleUpdateExpStatus}
              onSaveResultUrl={handleSaveResultUrl}
              onReschedule={async (timepointAgeDays: number, newStartDate: string) => {
                const res = await actions.rescheduleTimepointExperiments(
                  selectedAnimal.id,
                  timepointAgeDays,
                  newStartDate,
                  selectedAnimal.birth_date,
                );
                if (res.error) { toast.error(res.error); }
                else { toast.success(`Rescheduled ${res.rescheduled} experiments (last: ${res.lastDate})`); await refetchAll(); }
              }}
              onUpdateExperiment={async (id, fd) => {
                const res = await actions.updateAnimalExperiment(id, fd);
                if (res.error) toast.error(res.error);
                else { toast.success("Experiment updated!"); await refetchAll(); }
              }}
              onDeleteExperiment={async (id) => {
                const res = await actions.deleteAnimalExperiment(id);
                if (res.error) toast.error(res.error);
                else { toast.success("Experiment deleted"); await refetchAll(); }
              }}
              onCreateExperiment={async (fd) => {
                const res = await actions.createAnimalExperiment(fd);
                if (res.error) toast.error(res.error);
                else { toast.success("Experiment added!"); await refetchAll(); }
              }}
              onEdit={() => { setEditingAnimal(selectedAnimal); setAnimalFormEarTag(parseEarTag(selectedAnimal.ear_tag)); setSelectedAnimal(null); }}
              onDelete={() => { act(actions.deleteAnimal(selectedAnimal.id)); setSelectedAnimal(null); }}
              busy={busy}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Animal Detail Sub-component ────────────────────────────────────────

function AnimalDetail({
  animal,
  cohort,
  experiments,
  timepoints,
  driveConnected,
  onSchedule,
  onDeleteAllExps,
  onUpdateStatus,
  onSaveResultUrl,
  onReschedule,
  onUpdateExperiment,
  onDeleteExperiment,
  onCreateExperiment,
  onEdit,
  onDelete,
  busy,
}: {
  animal: Animal;
  cohort?: Cohort;
  experiments: AnimalExperiment[];
  timepoints: ColonyTimepoint[];
  driveConnected: boolean;
  onSchedule: () => void;
  onDeleteAllExps: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onSaveResultUrl: (id: string, url: string) => void;
  onReschedule: (timepointAgeDays: number, newStartDate: string) => Promise<void>;
  onUpdateExperiment: (id: string, fd: FormData) => Promise<void>;
  onDeleteExperiment: (id: string) => Promise<void>;
  onCreateExperiment: (fd: FormData) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const age = daysOld(animal.birth_date);
  const [resultUrls, setResultUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [addingToTimepoint, setAddingToTimepoint] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleFileUpload(expId: string, experimentType: string, file: File) {
    setUploading(expId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("cohort_name", cohort?.name || "Unknown");
      formData.append("animal_identifier", animal.identifier);
      formData.append("experiment_type", experimentType);
      formData.append("experiment_id", expId);

      const res = await fetch("/api/gdrive/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Uploaded to Google Drive!");
        onSaveResultUrl(expId, data.url);
      }
    } catch {
      toast.error("Upload failed");
    }
    setUploading(null);
  }

  // Group experiments by timepoint
  const grouped = useMemo(() => {
    const map: Record<number, AnimalExperiment[]> = {};
    experiments.forEach((e) => {
      const key = e.timepoint_age_days || 0;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([ageDays, exps]) => ({
        ageDays: Number(ageDays),
        experiments: exps.sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || "")),
      }));
  }, [experiments]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {animal.identifier}
          <Badge variant="secondary">{genotypeLabel(animal.sex, animal.genotype)}</Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="flex justify-end gap-1 -mt-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}>
          <Edit className="h-3 w-3" /> Edit
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div><span className="text-muted-foreground text-xs block">Age</span>{age} days</div>
        <div><span className="text-muted-foreground text-xs block">Cohort</span>{cohort?.name || "—"}</div>
        <div>
          <span className="text-muted-foreground text-xs block">Ear Tag</span>
          <div className="flex items-center gap-1">
            <MiniEarTag earTag={animal.ear_tag} size={26} />
          </div>
        </div>
        <div><span className="text-muted-foreground text-xs block">Cage</span>{animal.cage_number || "—"}</div>
        <div><span className="text-muted-foreground text-xs block">Status</span>{animal.status}</div>
        <div><span className="text-muted-foreground text-xs block">EEG</span>{animal.eeg_implanted ? `Yes (${animal.eeg_implant_date})` : "No"}</div>
        <div><span className="text-muted-foreground text-xs block">Birth</span>{animal.birth_date}</div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Experiment Schedule</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={onSchedule} disabled={busy} className="h-7 text-xs">
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calendar className="h-3 w-3 mr-1" />}
            Schedule
          </Button>
          {experiments.length > 0 && (
            <Button size="sm" variant="outline" onClick={onDeleteAllExps} disabled={busy} className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Exps
            </Button>
          )}
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No experiments scheduled. Click &quot;Auto-Schedule All&quot; to generate from your timepoints.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ ageDays, experiments: exps }) => {
            const tp = timepoints.find((t) => t.age_days === ageDays);
            const graceDays = tp?.grace_period_days ?? 30;
            const birth = new Date(animal.birth_date);
            const DAY = 24 * 60 * 60 * 1000;
            const tpDate = new Date(birth.getTime() + ageDays * DAY);
            const deadlineDate = new Date(birth.getTime() + (ageDays + graceDays) * DAY);
            const today = new Date();
            const incomplete = exps.filter((e) => e.status !== "completed" && e.status !== "skipped");
            const allDone = incomplete.length === 0;
            const pastDeadline = !allDone && today > deadlineDate;
            const inGracePeriod = !allDone && today > tpDate && today <= deadlineDate;
            const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / DAY);

            return (
            <div key={ageDays}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {ageDays}-Day Timepoint
                </h4>
                {allDone && (
                  <Badge className="bg-green-100 text-green-700 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> All Complete
                  </Badge>
                )}
                {inGracePeriod && (
                  <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-0.5" /> Grace Period ({daysLeft}d left)
                  </Badge>
                )}
                {pastDeadline && (
                  <Badge className="bg-red-100 text-red-700 text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-0.5" /> Past Deadline!
                  </Badge>
                )}
                {!allDone && !pastDeadline && (
                  <span className="text-[10px] text-muted-foreground">
                    Deadline: {deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {incomplete.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 text-[10px] px-2 ml-auto"
                    onClick={() => { setRescheduling(rescheduling === ageDays ? null : ageDays); setRescheduleDate(new Date().toISOString().split("T")[0]); }}
                  >
                    <RefreshCw className="h-3 w-3 mr-0.5" /> Reschedule
                  </Button>
                )}
              </div>
              {rescheduling === ageDays && (
                <div className="flex items-center gap-2 mb-2 bg-muted/50 rounded-md p-2">
                  <span className="text-xs text-muted-foreground">New start date:</span>
                  <Input
                    type="date"
                    className="h-7 text-xs w-40"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    max={deadlineDate.toISOString().split("T")[0]}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!rescheduleDate || busy}
                    onClick={async () => {
                      await onReschedule(ageDays, rescheduleDate);
                      setRescheduling(null);
                    }}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRescheduling(null)}>Cancel</Button>
                  <span className="text-[10px] text-muted-foreground">
                    Must finish by {deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ({graceDays}d grace)
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                {exps.map((exp) => {
                  const dLeft = exp.scheduled_date ? daysUntil(exp.scheduled_date) : null;
                  const isOverdue = dLeft !== null && dLeft < 0 && exp.status !== "completed" && exp.status !== "skipped";
                  const isEditing = editingExpId === exp.id;
                  return (
                    <div key={exp.id} className={`rounded-md border ${isOverdue ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                      <div className="flex items-center gap-2 text-sm p-2 flex-wrap">
                        <Badge className={`${STATUS_COLORS[exp.status]} text-xs`} variant="secondary">
                          {exp.status}
                        </Badge>
                        <span className="font-medium min-w-0">
                          {EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}
                        </span>
                        {exp.scheduled_date && (
                          <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            {exp.scheduled_date}
                            {dLeft !== null && dLeft > 0 && ` (in ${dLeft}d)`}
                            {dLeft !== null && dLeft === 0 && " (TODAY!)"}
                            {isOverdue && ` (${Math.abs(dLeft!)}d overdue)`}
                          </span>
                        )}
                        {exp.notes && <span className="text-[10px] text-muted-foreground italic truncate max-w-[140px]" title={exp.notes}>{exp.notes}</span>}

                        <div className="ml-auto flex items-center gap-1">
                          {/* Status quick-actions */}
                          {(exp.status === "scheduled" || exp.status === "pending") && (
                            <>
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onUpdateStatus(exp.id, "completed")}>
                                <Check className="h-3 w-3 mr-0.5" /> Done
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onUpdateStatus(exp.id, "in_progress")}>
                                <Loader2 className="h-3 w-3 mr-0.5" /> In Progress
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onUpdateStatus(exp.id, "skipped")}>
                                <X className="h-3 w-3 mr-0.5" /> Skip
                              </Button>
                            </>
                          )}
                          {exp.status === "in_progress" && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onUpdateStatus(exp.id, "completed")}>
                              <Check className="h-3 w-3 mr-0.5" /> Done
                            </Button>
                          )}

                          {/* Edit toggle */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-1.5"
                            onClick={() => setEditingExpId(isEditing ? null : exp.id)}
                            title="Edit experiment"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-1.5 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`Delete ${EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}?`)) onDeleteExperiment(exp.id); }}
                            title="Delete experiment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>

                          {/* Results: upload or paste link */}
                          {exp.status === "completed" && !exp.results_drive_url && (
                            <div className="flex items-center gap-1">
                              {driveConnected && (
                                <>
                                  <input
                                    type="file"
                                    ref={(el) => { fileInputRefs.current[exp.id] = el; }}
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleFileUpload(exp.id, exp.experiment_type, file);
                                    }}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs px-2 gap-1"
                                    onClick={() => fileInputRefs.current[exp.id]?.click()}
                                    disabled={uploading === exp.id}
                                  >
                                    {uploading === exp.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Upload className="h-3 w-3" />
                                    )}
                                    {uploading === exp.id ? "Uploading..." : "Upload"}
                                  </Button>
                                </>
                              )}
                              <Input
                                className="h-6 text-xs w-36"
                                placeholder={driveConnected ? "or paste link" : "Google Drive link"}
                                value={resultUrls[exp.id] || ""}
                                onChange={(e) => setResultUrls((prev) => ({ ...prev, [exp.id]: e.target.value }))}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => { if (resultUrls[exp.id]) onSaveResultUrl(exp.id, resultUrls[exp.id]); }}
                              >
                                <Link2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {exp.results_drive_url && (
                            <a href={exp.results_drive_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 text-xs">
                              <ExternalLink className="h-3.5 w-3.5" /> Results
                            </a>
                          )}
                        </div>
                      </div>

                      {/* ─── Inline Edit Panel ──────────────── */}
                      {isEditing && (
                        <form
                          className="border-t bg-muted/30 p-2 grid grid-cols-2 sm:grid-cols-4 gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            await onUpdateExperiment(exp.id, fd);
                            setEditingExpId(null);
                          }}
                        >
                          <div>
                            <Label className="text-[10px]">Status</Label>
                            <Select name="status" defaultValue={exp.status}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="skipped">Skipped</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px]">Scheduled Date</Label>
                            <Input name="scheduled_date" type="date" className="h-7 text-xs" defaultValue={exp.scheduled_date || ""} />
                          </div>
                          <div>
                            <Label className="text-[10px]">Completed Date</Label>
                            <Input name="completed_date" type="date" className="h-7 text-xs" defaultValue={exp.completed_date || ""} />
                          </div>
                          <div>
                            <Label className="text-[10px]">Notes</Label>
                            <Input name="notes" className="h-7 text-xs" defaultValue={exp.notes || ""} placeholder="Optional notes" />
                          </div>
                          <div className="col-span-full flex gap-2 justify-end">
                            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditingExpId(null)}>Cancel</Button>
                            <Button type="submit" size="sm" className="h-6 text-xs" disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ─── Add Experiment to this Timepoint ──────── */}
              {addingToTimepoint === ageDays ? (
                <form
                  className="mt-2 p-2 bg-muted/30 rounded-md border border-dashed space-y-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fd.set("animal_id", animal.id);
                    fd.set("timepoint_age_days", String(ageDays));
                    await onCreateExperiment(fd);
                    setAddingToTimepoint(null);
                  }}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">Experiment</Label>
                      <Select name="experiment_type" required>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pick test..." /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(EXPERIMENT_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Status</Label>
                      <Select name="status" defaultValue="scheduled">
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Date</Label>
                      <Input name="scheduled_date" type="date" className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Notes</Label>
                      <Input name="notes" className="h-7 text-xs" placeholder="Optional" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddingToTimepoint(null)}>Cancel</Button>
                    <Button type="submit" size="sm" className="h-6 text-xs" disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Add</Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2 mt-1 text-muted-foreground"
                  onClick={() => setAddingToTimepoint(ageDays)}
                >
                  <Plus className="h-3 w-3 mr-0.5" /> Add experiment to {ageDays}d
                </Button>
              )}
            </div>
            );
          })}

          {/* ─── Add experiment to a new timepoint ──────── */}
          {addingToTimepoint === -1 ? (
            <form
              className="mt-2 p-2 bg-muted/30 rounded-md border border-dashed space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("animal_id", animal.id);
                await onCreateExperiment(fd);
                setAddingToTimepoint(null);
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px]">Experiment</Label>
                  <Select name="experiment_type" required>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pick test..." /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPERIMENT_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Timepoint (days)</Label>
                  <Select name="timepoint_age_days" required>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pick..." /></SelectTrigger>
                    <SelectContent>
                      {timepoints.map((tp) => (
                        <SelectItem key={tp.id} value={String(tp.age_days)}>{tp.name} ({tp.age_days}d)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Date</Label>
                  <Input name="scheduled_date" type="date" className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Status</Label>
                  <Select name="status" defaultValue="scheduled">
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAddingToTimepoint(null)}>Cancel</Button>
                <Button type="submit" size="sm" className="h-6 text-xs" disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Add</Button>
              </div>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 mt-2 text-muted-foreground"
              onClick={() => setAddingToTimepoint(-1)}
            >
              <Plus className="h-3 w-3 mr-0.5" /> Add experiment to another timepoint
            </Button>
          )}
        </div>
      )}

    </>
  );
}
