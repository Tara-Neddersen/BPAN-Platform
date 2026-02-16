"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  Plus, Edit, Trash2, Loader2, Check, X, Copy,
  ExternalLink, Eye, ChevronDown, ChevronUp,
  Calendar, AlertTriangle, Link2, Mouse,
  RefreshCw, FileText, CheckCircle2,
  Upload, CloudOff, Cloud,
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
  AnimalSex, AnimalGenotype, AnimalStatus,
} from "@/types";

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
  data_collection: "Data Collection → Core",
  core_acclimation: "Core Acclimation (48hr)",
  catwalk: "CatWalk Gait Analysis",
  rotarod_hab: "Rotarod Habituation",
  rotarod: "Rotarod Testing",
  stamina: "Stamina Test (10 RPM)",
  blood_draw: "Plasma Collection",
  eeg_implant: "EEG Implant Surgery",
  eeg_recording: "EEG Recording",
};

// Experiments the user can select for timepoints (excludes handling/EEG which are handled separately)
const EXPERIMENT_TYPES = [
  "y_maze", "marble", "ldb", "nesting", "data_collection",
  "core_acclimation", "catwalk", "rotarod_hab", "rotarod",
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
  rotarod_hab: "Day 6",
  rotarod: "Day 7–8",
  stamina: "Day 9",
  blood_draw: "Day 10",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  skipped: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

interface ColonyClientProps {
  breederCages: BreederCage[];
  cohorts: Cohort[];
  animals: Animal[];
  animalExperiments: AnimalExperiment[];
  timepoints: ColonyTimepoint[];
  advisorPortals: AdvisorPortal[];
  meetingNotes: MeetingNote[];
  cageChanges: CageChange[];
  colonyPhotos: ColonyPhoto[];
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
    scheduleExperimentsForAnimal: (animalId: string, birthDate: string) => Promise<{ success?: boolean; error?: string; count?: number }>;
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
  breederCages: initCages,
  cohorts: initCohorts,
  animals: initAnimals,
  animalExperiments: initExps,
  timepoints: initTPs,
  advisorPortals: initPortals,
  meetingNotes: initMeetings,
  cageChanges: initCageChanges,
  colonyPhotos: initPhotos,
  actions,
}: ColonyClientProps) {
  const supabaseRef = useRef(createBrowserClient());

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

  // Refetch all colony data directly from Supabase (bypasses all caching)
  const refetchAll = useCallback(async () => {
    try {
      const sb = supabaseRef.current;
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) {
        console.error("refetchAll: auth failed", authError);
        // Fallback: force full page reload
        window.location.reload();
        return;
      }
      const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.all([
        sb.from("breeder_cages").select("*").eq("user_id", user.id).order("name"),
        sb.from("cohorts").select("*").eq("user_id", user.id).order("name"),
        sb.from("animals").select("*").eq("user_id", user.id).order("identifier"),
        sb.from("animal_experiments").select("*").eq("user_id", user.id).order("scheduled_date"),
        sb.from("colony_timepoints").select("*").eq("user_id", user.id).order("sort_order"),
        sb.from("advisor_portal").select("*").eq("user_id", user.id).order("created_at"),
        sb.from("meeting_notes").select("*").eq("user_id", user.id).order("meeting_date", { ascending: false }),
        sb.from("cage_changes").select("*").eq("user_id", user.id).order("scheduled_date"),
        sb.from("colony_photos").select("*").eq("user_id", user.id).order("sort_order"),
      ]);
      setCages((r1.data || []) as BreederCage[]);
      setCohorts((r2.data || []) as Cohort[]);
      setAnimals((r3.data || []) as Animal[]);
      setExperiments((r4.data || []) as AnimalExperiment[]);
      setTimepoints((r5.data || []) as ColonyTimepoint[]);
      setPortals((r6.data || []) as AdvisorPortal[]);
      setMeetings((r7.data || []) as MeetingNote[]);
      setCageChanges((r8.data || []) as CageChange[]);
      setPhotos((r9.data || []) as ColonyPhoto[]);
    } catch (err) {
      console.error("refetchAll error:", err);
      // Fallback: force full page reload
      window.location.reload();
    }
  }, []);

  const [showAddAnimal, setShowAddAnimal] = useState(false);
  const [showAddCohort, setShowAddCohort] = useState(false);
  const [showAddCage, setShowAddCage] = useState(false);
  const [showAddTP, setShowAddTP] = useState(false);
  const [showAddPI, setShowAddPI] = useState(false);
  const [showGenerateCageChanges, setShowGenerateCageChanges] = useState(false);
  const [editingCage, setEditingCage] = useState<BreederCage | null>(null);
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [editingTP, setEditingTP] = useState<ColonyTimepoint | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [filterCohort, setFilterCohort] = useState("all");
  const [filterGenotype, setFilterGenotype] = useState("all");

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

  // Upcoming experiments
  const upcoming = useMemo(
    () =>
      experiments
        .filter((e) => e.status === "scheduled" && e.scheduled_date)
        .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
        .slice(0, 10),
    [experiments]
  );

  // Upcoming cage changes
  const upcomingCageChanges = useMemo(
    () => cageChanges.filter((c) => !c.is_completed).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)).slice(0, 5),
    [cageChanges]
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
      refetchAll();
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
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{activeCount}</div>
          <p className="text-xs text-muted-foreground">Active Animals</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{cohorts.length}</div>
          <p className="text-xs text-muted-foreground">Cohorts</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{pendingExps}</div>
          <p className="text-xs text-muted-foreground">Scheduled Experiments</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{completedExps}</div>
          <p className="text-xs text-muted-foreground">Completed</p>
        </CardContent></Card>
      </div>

      {/* Upcoming alerts */}
      {(upcoming.length > 0 || upcomingCageChanges.length > 0) && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Upcoming
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
            {/* Experiment alerts */}
            {upcoming.map((exp) => {
              const animal = animals.find((a) => a.id === exp.animal_id);
              const dLeft = daysUntil(exp.scheduled_date!);
              return (
                <div key={exp.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className={dLeft <= 3 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"} variant="secondary">
                      {dLeft <= 0 ? "TODAY" : `${dLeft}d`}
                    </Badge>
                    <span className="font-medium">{animal?.identifier}</span>
                    <span className="text-muted-foreground">
                      {EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{exp.scheduled_date}</span>
                </div>
              );
            })}
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

      <Tabs defaultValue="animals">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="animals" className="flex-1 min-w-[80px]">Animals</TabsTrigger>
          <TabsTrigger value="cohorts" className="flex-1 min-w-[80px]">Cohorts</TabsTrigger>
          <TabsTrigger value="timepoints" className="flex-1 min-w-[80px]">Timepoints</TabsTrigger>
          <TabsTrigger value="breeders" className="flex-1 min-w-[80px]">Breeders</TabsTrigger>
          <TabsTrigger value="cages" className="flex-1 min-w-[80px]">Cage Changes</TabsTrigger>
          <TabsTrigger value="pi" className="flex-1 min-w-[80px]">PI Access</TabsTrigger>
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
                    className="cursor-pointer hover:border-primary/50 transition-colors"
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
                          {animal.ear_tag && <span>Tag: {animal.ear_tag}</span>}
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
          <div className="flex justify-end">
            <Button onClick={() => setShowAddCohort(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Cohort</Button>
          </div>
          {cohorts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No cohorts yet.</div>
          ) : (
            <div className="space-y-2">
              {cohorts.map((c) => {
                const cage = cages.find((b) => b.id === c.breeder_cage_id);
                const cohortAnimals = animals.filter((a) => a.cohort_id === c.id);
                const age = daysOld(c.birth_date);
                return (
                  <Card key={c.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {c.name}
                            <Badge variant="outline" className="text-xs">{age} days old</Badge>
                            <Badge variant="secondary" className="text-xs">{cohortAnimals.length} animals</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Born: {c.birth_date}{cage ? ` · From: ${cage.name}` : ""}
                            {c.litter_size ? ` · Litter: ${c.litter_size}` : ""}
                          </div>
                        </div>
                        <div className="flex gap-1">
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
        </TabsContent>

        {/* ─── Timepoints Tab ──────────────────────────────────── */}
        <TabsContent value="timepoints" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Define experiment timepoints (60d, 120d, 180d). The protocol follows your 2-week timeline:
              </p>
              <p className="text-xs text-muted-foreground italic">
                Week 0: Handling → Day 1: Y-Maze + Marble → Day 2: LDB + Nesting → Day 3: Move to Core → Day 4–5: Acclimation → Day 6: CatWalk + RR Hab → Day 7–8: Rotarod → Day 9: Stamina → Day 10: Plasma
              </p>
            </div>
            <Button onClick={() => setShowAddTP(true)} size="sm" className="flex-shrink-0"><Plus className="h-4 w-4 mr-1" /> Add Timepoint</Button>
          </div>
          {timepoints.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No timepoints configured.</p>
              <p className="text-xs mt-1">Add timepoints like &quot;60-day&quot;, &quot;120-day&quot;, &quot;180-day&quot; with the experiments for each.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timepoints.map((tp) => (
                <Card key={tp.id}>
                  <CardContent className="py-3">
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
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-3">
                          <span>Handle {tp.handling_days_before}d before</span>
                          {tp.includes_eeg_implant && (
                            <span className="text-purple-600">
                              + EEG implant → {tp.eeg_recovery_days}d recovery → {tp.eeg_recording_days}d recording
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
                return (
                  <Card key={c.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {c.name}
                            {c.strain && <Badge variant="outline" className="text-xs">{c.strain}</Badge>}
                            <Badge variant="secondary" className="text-xs">{cageCohorts.length} cohorts</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {c.location || "No location"}{c.breeding_start ? ` · Since: ${c.breeding_start}` : ""}
                          </div>
                        </div>
                        <div className="flex gap-1">
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
        </TabsContent>
      </Tabs>

      {/* ─── Dialogs ────────────────────────────────────────────── */}

      {/* Add / Edit Animal */}
      <Dialog open={showAddAnimal || !!editingAnimal} onOpenChange={(v) => { if (!v) { setShowAddAnimal(false); setEditingAnimal(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingAnimal ? "Edit Animal" : "Add Animal"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            if (editingAnimal) {
              handleFormAction((fd) => actions.updateAnimal(editingAnimal.id, fd), e, () => setEditingAnimal(null));
            } else {
              handleFormAction(actions.createAnimal, e, () => setShowAddAnimal(false));
            }
          }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cohort *</Label>
                <Select name="cohort_id" required defaultValue={editingAnimal?.cohort_id || ""}>
                  <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Identifier *</Label>
                <Input name="identifier" placeholder="e.g. BPAN1-HM-1" required defaultValue={editingAnimal?.identifier || ""} />
              </div>
              <div>
                <Label className="text-xs">Sex *</Label>
                <Select name="sex" required defaultValue={editingAnimal?.sex || ""}>
                  <SelectTrigger><SelectValue placeholder="Sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Genotype *</Label>
                <Select name="genotype" required defaultValue={editingAnimal?.genotype || ""}>
                  <SelectTrigger><SelectValue placeholder="Genotype" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hemi">Hemizygous (Hemi)</SelectItem>
                    <SelectItem value="wt">Wild-type (WT)</SelectItem>
                    <SelectItem value="het">Heterozygous (Het)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Birth Date *</Label>
                <Input name="birth_date" type="date" required defaultValue={editingAnimal?.birth_date || ""} />
              </div>
              <div>
                <Label className="text-xs">Ear Tag</Label>
                <Input name="ear_tag" placeholder="Optional" defaultValue={editingAnimal?.ear_tag || ""} />
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
                handleFormAction((fd) => actions.updateColonyTimepoint(editingTP.id, fd), e, () => setEditingTP(null));
              } else {
                handleFormAction(actions.createColonyTimepoint, e, () => setShowAddTP(false));
              }
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input name="name" defaultValue={editingTP?.name || ""} required placeholder="e.g. 60-day Behavioral" />
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
                Includes EEG implant surgery after experiments
              </label>
              <div className="grid grid-cols-2 gap-3 mt-2 ml-6">
                <div>
                  <Label className="text-xs">Recovery Days</Label>
                  <Input name="eeg_recovery_days" type="number" defaultValue={editingTP?.eeg_recovery_days ?? 14} />
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
                refetchAll();
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
                {["animals", "experiments", "results", "timeline"].map((item) => (
                  <label key={item} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" name="can_see" value={item} defaultChecked className="h-3.5 w-3.5" />
                    {item.charAt(0).toUpperCase() + item.slice(1)}
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
              onSchedule={() => handleScheduleAll(selectedAnimal)}
              onUpdateStatus={handleUpdateExpStatus}
              onSaveResultUrl={handleSaveResultUrl}
              onEdit={() => { setEditingAnimal(selectedAnimal); setSelectedAnimal(null); }}
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
  onUpdateStatus,
  onSaveResultUrl,
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
  onUpdateStatus: (id: string, status: string) => void;
  onSaveResultUrl: (id: string, url: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const age = daysOld(animal.birth_date);
  const [resultUrls, setResultUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
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
        <div><span className="text-muted-foreground text-xs block">Ear Tag</span>{animal.ear_tag || "—"}</div>
        <div><span className="text-muted-foreground text-xs block">Cage</span>{animal.cage_number || "—"}</div>
        <div><span className="text-muted-foreground text-xs block">Status</span>{animal.status}</div>
        <div><span className="text-muted-foreground text-xs block">EEG</span>{animal.eeg_implanted ? `Yes (${animal.eeg_implant_date})` : "No"}</div>
        <div><span className="text-muted-foreground text-xs block">Birth</span>{animal.birth_date}</div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Experiment Schedule</h3>
        {experiments.length === 0 && (
          <Button size="sm" onClick={onSchedule} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calendar className="h-4 w-4 mr-1" />}
            Auto-Schedule All
          </Button>
        )}
      </div>

      {experiments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No experiments scheduled. Click &quot;Auto-Schedule All&quot; to generate from your timepoints.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ ageDays, experiments: exps }) => (
            <div key={ageDays}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {ageDays}-Day Timepoint
              </h4>
              <div className="space-y-1.5">
                {exps.map((exp) => {
                  const dLeft = exp.scheduled_date ? daysUntil(exp.scheduled_date) : null;
                  return (
                    <div key={exp.id} className="flex items-center gap-2 text-sm rounded-md border p-2 flex-wrap">
                      <Badge className={`${STATUS_COLORS[exp.status]} text-xs`} variant="secondary">
                        {exp.status}
                      </Badge>
                      <span className="font-medium min-w-0">
                        {EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}
                      </span>
                      {exp.scheduled_date && (
                        <span className="text-xs text-muted-foreground">
                          {exp.scheduled_date}
                          {dLeft !== null && dLeft > 0 && ` (${dLeft}d)`}
                          {dLeft !== null && dLeft <= 0 && dLeft >= -1 && " (TODAY!)"}
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-1">
                        {/* Status quick-actions */}
                        {exp.status === "scheduled" && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onUpdateStatus(exp.id, "completed")}>
                            <Check className="h-3 w-3 mr-0.5" /> Done
                          </Button>
                        )}
                        {exp.status === "scheduled" && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onUpdateStatus(exp.id, "skipped")}>
                            <X className="h-3 w-3 mr-0.5" /> Skip
                          </Button>
                        )}

                        {/* Results: upload or paste link */}
                        {exp.status === "completed" && !exp.results_drive_url && (
                          <div className="flex items-center gap-1">
                            {/* Upload to Drive button */}
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
                            {/* Manual paste link fallback */}
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

    </>
  );
}
