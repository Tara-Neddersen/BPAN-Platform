"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  Plus, Edit, Trash2, Loader2, Check, X, Copy,
  ExternalLink, Eye, ChevronDown, ChevronUp,
  Calendar, AlertTriangle, Link2, Mouse,
  MessageSquare, RefreshCw, FileText, CheckCircle2,
  ImageIcon, Upload, CloudOff, Cloud, Mic, MicOff, Sparkles,
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
  AnimalSex, AnimalGenotype, AnimalStatus, ActionItem,
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
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [showGenerateCageChanges, setShowGenerateCageChanges] = useState(false);
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [editingTP, setEditingTP] = useState<ColonyTimepoint | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingNote | null>(null);
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
          <TabsTrigger value="meetings" className="flex-1 min-w-[80px]">Meetings</TabsTrigger>
          <TabsTrigger value="cages" className="flex-1 min-w-[80px]">Cage Changes</TabsTrigger>
          <TabsTrigger value="photos" className="flex-1 min-w-[80px]">Photos</TabsTrigger>
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
                        <Button variant="ghost" size="sm" onClick={() => act(actions.deleteCohort(c.id))}>
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
                        <Button variant="ghost" size="sm" onClick={() => act(actions.deleteBreederCage(c.id))}>
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

        {/* ─── Meetings Tab ────────────────────────────────────── */}
        <TabsContent value="meetings" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Keep notes from advisor meetings — track action items and decisions.
            </p>
            <Button onClick={() => setShowAddMeeting(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Meeting</Button>
          </div>
          {meetings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No meeting notes yet. Click &quot;New Meeting&quot; to start.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => {
                const actionCount = m.action_items?.length || 0;
                const doneActions = m.action_items?.filter((a: ActionItem) => a.done).length || 0;
                return (
                  <Card key={m.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setEditingMeeting(m)}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{m.title}</span>
                            <Badge variant="outline" className="text-xs">{m.meeting_date}</Badge>
                            {actionCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {doneActions}/{actionCount} actions done
                              </Badge>
                            )}
                          </div>
                          {m.attendees.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Attendees: {m.attendees.join(", ")}
                            </div>
                          )}
                          {m.content && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.content}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); act(actions.deleteMeetingNote(m.id)); }}>
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

        {/* ─── Photos Tab ──────────────────────────────────────── */}
        <TabsContent value="photos" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Add experiment photos — they&apos;ll show as a rotating gallery on your PI&apos;s portal. 📸
            </p>
            <Button onClick={() => setShowAddPhoto(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Photo</Button>
          </div>
          {photos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No photos yet.</p>
              <p className="text-xs mt-1">Add photos of your experiments — paste a direct image URL or Google Drive link.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((p) => {
                const displayUrl = convertDriveUrl(p.image_url);
                const animal = animals.find((a) => a.id === p.animal_id);
                return (
                  <Card key={p.id} className="overflow-hidden group relative">
                    <div className="aspect-square bg-muted relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayUrl}
                        alt={p.caption || "Experiment photo"}
                        className="object-cover w-full h-full"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Button
                          variant="destructive" size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => act(actions.deleteColonyPhoto(p.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {!p.show_in_portal && (
                        <Badge className="absolute top-1 right-1 text-[10px] bg-gray-700 text-white" variant="secondary">Hidden from PI</Badge>
                      )}
                    </div>
                    <CardContent className="py-2 px-3">
                      <p className="text-xs font-medium truncate">{p.caption || "Untitled"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {animal ? animal.identifier : ""}{p.experiment_type ? ` · ${EXPERIMENT_LABELS[p.experiment_type] || p.experiment_type}` : ""}
                      </p>
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

      {/* Add Animal */}
      <Dialog open={showAddAnimal} onOpenChange={setShowAddAnimal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Animal</DialogTitle></DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.createAnimal, e, () => setShowAddAnimal(false))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cohort *</Label>
                <Select name="cohort_id" required>
                  <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Identifier *</Label>
                <Input name="identifier" placeholder="e.g. BPAN1-HM-1" required />
              </div>
              <div>
                <Label className="text-xs">Sex *</Label>
                <Select name="sex" required>
                  <SelectTrigger><SelectValue placeholder="Sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Genotype *</Label>
                <Select name="genotype" required>
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
                <Input name="birth_date" type="date" required />
              </div>
              <div>
                <Label className="text-xs">Ear Tag</Label>
                <Input name="ear_tag" placeholder="Optional" />
              </div>
              <div>
                <Label className="text-xs">Cage #</Label>
                <Input name="cage_number" placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="notes" placeholder="Optional notes" rows={2} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddAnimal(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Add Animal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Cohort */}
      <Dialog open={showAddCohort} onOpenChange={setShowAddCohort}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Cohort</DialogTitle></DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.createCohort, e, () => setShowAddCohort(false))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cohort Name *</Label>
                <Input name="name" placeholder="e.g. BPAN 1" required />
              </div>
              <div>
                <Label className="text-xs">Birth Date *</Label>
                <Input name="birth_date" type="date" required />
              </div>
              <div>
                <Label className="text-xs">Breeder Cage</Label>
                <Select name="breeder_cage_id">
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {cages.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Litter Size</Label>
                <Input name="litter_size" type="number" placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="notes" placeholder="Optional" rows={2} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddCohort(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add Cohort</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Breeder Cage */}
      <Dialog open={showAddCage} onOpenChange={setShowAddCage}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Breeder Cage</DialogTitle></DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.createBreederCage, e, () => setShowAddCage(false))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">Cage Name *</Label><Input name="name" required placeholder="e.g. Breeder A" /></div>
              <div><Label className="text-xs">Strain</Label><Input name="strain" placeholder="e.g. BPAN / ATP13A2" /></div>
              <div><Label className="text-xs">Location</Label><Input name="location" placeholder="Room, rack" /></div>
              <div><Label className="text-xs">Breeding Start</Label><Input name="breeding_start" type="date" /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea name="notes" rows={2} /></div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddCage(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add Cage</Button>
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

      {/* New Meeting Note */}
      <Dialog open={showAddMeeting} onOpenChange={setShowAddMeeting}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Meeting Note</DialogTitle></DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.createMeetingNote, e, () => setShowAddMeeting(false))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Title *</Label>
                <Input name="title" required placeholder="e.g. Weekly check-in with Dr. Smith" />
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <Input name="meeting_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
              </div>
            </div>
            <div>
              <Label className="text-xs">Attendees (comma-separated)</Label>
              <Input name="attendees" placeholder="e.g. Dr. Smith, Self" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea name="content" placeholder="Meeting notes, decisions, topics discussed..." rows={6} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddMeeting(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save Meeting</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Note */}
      <Dialog open={!!editingMeeting} onOpenChange={(v) => { if (!v) setEditingMeeting(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {editingMeeting && (
            <MeetingDetail
              meeting={editingMeeting}
              onSave={async (fd: FormData) => {
                setBusy(true);
                const result = await actions.updateMeetingNote(editingMeeting.id, fd);
                setBusy(false);
                if (result.error) toast.error(result.error);
                else { toast.success("Saved!"); setEditingMeeting(null); refetchAll(); }
              }}
              onClose={() => setEditingMeeting(null)}
              busy={busy}
            />
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

      {/* Add Photo */}
      <Dialog open={showAddPhoto} onOpenChange={setShowAddPhoto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Experiment Photo</DialogTitle></DialogHeader>
          <form onSubmit={(e) => handleFormAction(actions.addColonyPhoto, e, () => setShowAddPhoto(false))} className="space-y-3">
            <div>
              <Label className="text-xs">Image URL *</Label>
              <Input name="image_url" required placeholder="Paste direct image URL or Google Drive share link" />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Google Drive: right-click image → &quot;Get link&quot; → paste here. We&apos;ll auto-convert it.
              </p>
            </div>
            <div>
              <Label className="text-xs">Caption</Label>
              <Input name="caption" placeholder="e.g. BPAN1-HM-1 — Rotarod Day 7" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Animal (optional)</Label>
                <Select name="animal_id">
                  <SelectTrigger><SelectValue placeholder="Any animal" /></SelectTrigger>
                  <SelectContent>
                    {animals.map((a) => <SelectItem key={a.id} value={a.id}>{a.identifier}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Experiment (optional)</Label>
                <Select name="experiment_type">
                  <SelectTrigger><SelectValue placeholder="Any experiment" /></SelectTrigger>
                  <SelectContent>
                    {EXPERIMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EXPERIMENT_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date Taken</Label>
                <Input name="taken_date" type="date" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="show_in_portal" value="true" defaultChecked className="h-4 w-4" />
              Show in PI portal gallery
            </label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddPhoto(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add Photo</Button>
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
              onDelete={() => { act(actions.deleteAnimal(selectedAnimal.id)); setSelectedAnimal(null); }}
              busy={busy}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Speech-to-Text Hook ────────────────────────────────────────────────

/**
 * Uses the browser's built-in Web Speech API.
 * 100% free, no API calls, no limits.
 * Works in Chrome, Edge, Safari (most browsers).
 */
function useSpeechToText(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const wantRef = useRef(false);
  const cbRef = useRef(onTranscript);
  const transcriptRef = useRef("");
  const recRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Rapid-cycle detection: if recognition ends < 2s after start, 3 times in a row, the browser can't do speech
  const startTimeRef = useRef(0);
  const rapidFailCount = useRef(0);
  const gotResultRef = useRef(false);

  cbRef.current = onTranscript;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const has = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    setIsSupported(has);
    setDebugInfo(has ? "Speech API available" : "Speech API NOT available in this browser");
    return () => {
      wantRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recRef.current) try { recRef.current.abort(); } catch { /* */ }
    };
  }, []);

  function stopForGood(msg: string) {
    wantRef.current = false;
    setIsListening(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current) try { recRef.current.abort(); } catch { /* */ }
    setDebugInfo(msg);
    toast.error(msg, { duration: 8000 });
  }

  function startRec() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR || !wantRef.current) return;

    // Stop any existing instance
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* */ }
      recRef.current = null;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    recRef.current = rec;

    startTimeRef.current = Date.now();
    gotResultRef.current = false;

    setDebugInfo("Starting recognition...");

    rec.onaudiostart = () => {
      setDebugInfo("🎤 Microphone active — speak now!");
    };

    rec.onspeechstart = () => {
      setDebugInfo("🗣️ Speech detected!");
      // Speech was detected, reset rapid-fail count
      rapidFailCount.current = 0;
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      gotResultRef.current = true;
      rapidFailCount.current = 0; // got results = working fine
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      transcriptRef.current = text;
      setDebugInfo("📝 Heard: " + text.substring(0, 60) + (text.length > 60 ? "..." : ""));
      cbRef.current(text);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setDebugInfo("❌ Error: " + e.error);
      if (e.error === "not-allowed") {
        stopForGood("Microphone access denied. Check browser permissions.");
      } else if (e.error === "service-not-available") {
        stopForGood("Speech service unavailable. Please use Google Chrome (not Atlas/Arc/other browsers).");
      }
      // other errors (no-speech, network, aborted) will trigger onend → restart
    };

    rec.onend = () => {
      const elapsed = Date.now() - startTimeRef.current;

      if (wantRef.current) {
        // If it ended in under 2 seconds without any results, that's a rapid fail
        if (elapsed < 2000 && !gotResultRef.current) {
          rapidFailCount.current++;
          if (rapidFailCount.current >= 3) {
            stopForGood(
              "⚠️ Speech recognition is not working in this browser. " +
              "Please open this page in Google Chrome for dictation."
            );
            return;
          }
          // Wait longer before retrying (exponential backoff)
          const delay = 500 * Math.pow(2, rapidFailCount.current - 1);
          setDebugInfo(`⏸️ Ended quickly (${elapsed}ms). Retry ${rapidFailCount.current}/3 in ${delay}ms...`);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            if (wantRef.current) startRec();
          }, delay);
        } else {
          // Normal restart (recognition paused after silence — this is normal)
          rapidFailCount.current = 0;
          setDebugInfo("⏸️ Paused (silence). Auto-restarting...");
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            if (wantRef.current) startRec();
          }, 300);
        }
      } else {
        setDebugInfo("Stopped.");
      }
    };

    try {
      rec.start();
      setDebugInfo("✅ rec.start() called — listening...");
    } catch (err) {
      setDebugInfo("❌ rec.start() threw: " + String(err));
      rapidFailCount.current++;
      if (rapidFailCount.current >= 3) {
        stopForGood(
          "⚠️ Speech recognition failed to start. " +
          "Please use Google Chrome for dictation."
        );
        return;
      }
      if (wantRef.current) {
        timerRef.current = setTimeout(() => { if (wantRef.current) startRec(); }, 1000);
      }
    }
  }

  function toggle() {
    if (wantRef.current) {
      wantRef.current = false;
      setIsListening(false);
      rapidFailCount.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recRef.current) try { recRef.current.stop(); } catch { /* */ }
      setDebugInfo("Stopped.");
    } else {
      transcriptRef.current = "";
      rapidFailCount.current = 0;
      wantRef.current = true;
      setIsListening(true);
      startRec();
    }
  }

  function stop() {
    wantRef.current = false;
    setIsListening(false);
    rapidFailCount.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current) try { recRef.current.stop(); } catch { /* */ }
  }

  return { isListening, isSupported, toggle, stop, debugInfo };
}

// ─── Meeting Detail Sub-component ───────────────────────────────────────

function MeetingDetail({
  meeting,
  onSave,
  onClose,
  busy,
}: {
  meeting: MeetingNote;
  onSave: (fd: FormData) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [content, setContent] = useState(meeting.content);
  const [actionItems, setActionItems] = useState<ActionItem[]>(meeting.action_items || []);
  const [newAction, setNewAction] = useState("");
  const [aiSummary, setAiSummary] = useState(meeting.ai_summary || "");
  const [summarizing, setSummarizing] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Speech-to-text: live transcript replaces content below the base
  const baseContentRef = useRef(content);
  const { isListening, isSupported, toggle: toggleMic, stop: stopMic, debugInfo } = useSpeechToText((text) => {
    const base = baseContentRef.current;
    setContent(base ? base + "\n\n" + text : text);
  });

  // Snapshot current content when mic starts
  function handleToggleMic() {
    if (!isListening) {
      baseContentRef.current = content;
    }
    toggleMic();
  }

  // Stop mic when dialog closes
  useEffect(() => {
    return () => { stopMic(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSummarize() {
    if (!content?.trim()) {
      toast.error("Write some notes first, then summarize.");
      return;
    }
    setSummarizing(true);
    try {
      const res = await fetch("/api/note-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "meeting_summary",
          text: content,
          actionItems: actionItems.map((a) => `${a.done ? "[DONE]" : "[ ]"} ${a.text}`).join("\n"),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiSummary(data.result || data.text || "");
      toast.success("Summary generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to summarize");
    }
    setSummarizing(false);
  }

  async function handleExtractActions() {
    if (!content?.trim()) {
      toast.error("Write or dictate some notes first, then extract action items.");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/note-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract_actions", text: content }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items: string[] = data.items || [];
      if (items.length === 0) {
        toast.info("No action items found in the notes.");
      } else {
        // Merge with existing — don't duplicate
        const existingTexts = new Set(actionItems.map((a) => a.text.toLowerCase().trim()));
        const newItems = items
          .filter((t) => !existingTexts.has(t.toLowerCase().trim()))
          .map((t) => ({ text: t, done: false }));
        setActionItems([...actionItems, ...newItems]);
        toast.success(`Found ${newItems.length} new action item${newItems.length !== 1 ? "s" : ""}!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract action items");
    }
    setExtracting(false);
  }

  function addAction() {
    if (!newAction.trim()) return;
    setActionItems([...actionItems, { text: newAction.trim(), done: false }]);
    setNewAction("");
  }

  function toggleAction(idx: number) {
    setActionItems(actionItems.map((a, i) => i === idx ? { ...a, done: !a.done } : a));
  }

  function removeAction(idx: number) {
    setActionItems(actionItems.filter((_, i) => i !== idx));
  }

  function handleSave() {
    stopMic(); // Stop recording if still going
    const fd = new FormData();
    fd.set("content", content);
    fd.set("action_items", JSON.stringify(actionItems));
    if (aiSummary) fd.set("ai_summary", aiSummary);
    onSave(fd);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {meeting.title}
          <Badge variant="outline" className="text-xs">{meeting.meeting_date}</Badge>
        </DialogTitle>
      </DialogHeader>

      {meeting.attendees.length > 0 && (
        <div className="text-sm text-muted-foreground">Attendees: {meeting.attendees.join(", ")}</div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Meeting Notes</Label>
          <div className="flex items-center gap-2">
            {isListening && (
              <div className="flex items-center gap-1.5 text-xs text-red-500 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                Recording...
              </div>
            )}
            {isSupported ? (
              <Button
                variant={isListening ? "destructive" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleToggleMic}
                type="button"
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isListening ? "Stop" : "Dictate"}
              </Button>
            ) : (
              <span className="text-[10px] text-muted-foreground">Speech not supported in this browser</span>
            )}
          </div>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder={isListening ? "Listening... speak now 🎙️" : "Type your meeting notes here, or click Dictate to speak..."}
          className={`font-mono text-sm ${isListening ? "border-red-300 dark:border-red-700" : ""}`}
        />
        {debugInfo && (
          <div className="mt-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-[11px] font-mono text-muted-foreground">
            {debugInfo}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Action Items</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleExtractActions}
            disabled={extracting}
            type="button"
          >
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {extracting ? "Extracting..." : "Extract from Notes"}
          </Button>
        </div>
        {actionItems.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {actionItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <button
                  className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 ${
                    item.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-primary"
                  }`}
                  onClick={() => toggleAction(idx)}
                >
                  {item.done && <Check className="h-3 w-3" />}
                </button>
                <span className={`flex-1 ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.text}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeAction(idx)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Add an action item..."
            className="text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAction(); } }}
          />
          <Button variant="outline" size="sm" onClick={addAction} type="button">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">AI Summary</Label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleSummarize}
            disabled={summarizing}
            type="button"
          >
            {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summarizing ? "Summarizing..." : aiSummary ? "Re-summarize" : "Summarize Notes"}
          </Button>
        </div>
        {aiSummary ? (
          <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{aiSummary}</div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Click &quot;Summarize Notes&quot; to generate an AI summary of your meeting notes. Uses your free Gemini API.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => { stopMic(); onClose(); }}>Close</Button>
        <Button onClick={handleSave} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Save Changes
        </Button>
      </DialogFooter>
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

      <Separator />
      <div className="flex justify-end">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Animal
        </Button>
      </div>
    </>
  );
}
