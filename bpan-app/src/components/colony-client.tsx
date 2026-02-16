"use client";

import { useState, useMemo } from "react";
import {
  Plus, Edit, Trash2, Loader2, Check, X, Copy,
  ExternalLink, Eye, ChevronDown, ChevronUp,
  Calendar, AlertTriangle, Link2, Mouse,
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
  ColonyTimepoint, AdvisorPortal,
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
  handling: "Handling",
  y_maze: "Y Maze",
  ldb: "Light-Dark Box",
  marble: "Marble Burying",
  nesting: "Nesting",
  rotarod: "Rotarod",
  catwalk: "CatWalk",
  blood_draw: "Blood Draw",
  eeg_implant: "EEG Implant",
  eeg_recording: "EEG Recording",
};

const EXPERIMENT_TYPES = Object.keys(EXPERIMENT_LABELS).filter(
  (t) => t !== "handling" && t !== "eeg_implant" && t !== "eeg_recording"
);

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

// ─── Main Component ─────────────────────────────────────────────────────

export function ColonyClient({
  breederCages: initCages,
  cohorts: initCohorts,
  animals: initAnimals,
  animalExperiments: initExps,
  timepoints: initTPs,
  advisorPortals: initPortals,
  actions,
}: ColonyClientProps) {
  const [cages] = useState(initCages);
  const [cohorts] = useState(initCohorts);
  const [animals] = useState(initAnimals);
  const [experiments] = useState(initExps);
  const [timepoints] = useState(initTPs);
  const [portals] = useState(initPortals);

  const [showAddAnimal, setShowAddAnimal] = useState(false);
  const [showAddCohort, setShowAddCohort] = useState(false);
  const [showAddCage, setShowAddCage] = useState(false);
  const [showAddTP, setShowAddTP] = useState(false);
  const [showAddPI, setShowAddPI] = useState(false);
  const [editingTP, setEditingTP] = useState<ColonyTimepoint | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [filterCohort, setFilterCohort] = useState("all");
  const [filterGenotype, setFilterGenotype] = useState("all");

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
    }
  }

  async function handleScheduleAll(animal: Animal) {
    setBusy(true);
    const result = await actions.scheduleExperimentsForAnimal(animal.id, animal.birth_date);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Scheduled ${result.count} experiments for ${animal.identifier}!`);
    }
  }

  async function handleUpdateExpStatus(expId: string, status: string) {
    const fd = new FormData();
    fd.set("status", status);
    if (status === "completed") fd.set("completed_date", new Date().toISOString().split("T")[0]);
    const result = await actions.updateAnimalExperiment(expId, fd);
    if (result.error) toast.error(result.error);
    else toast.success("Updated!");
  }

  async function handleSaveResultUrl(expId: string, url: string) {
    const fd = new FormData();
    fd.set("results_drive_url", url);
    const result = await actions.updateAnimalExperiment(expId, fd);
    if (result.error) toast.error(result.error);
    else toast.success("Results link saved!");
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
      {upcoming.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Upcoming Experiments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-3">
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

      <Tabs defaultValue="animals">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="animals">Animals</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="timepoints">Timepoints</TabsTrigger>
          <TabsTrigger value="breeders">Breeders</TabsTrigger>
          <TabsTrigger value="pi">PI Access</TabsTrigger>
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
                        <Button variant="ghost" size="sm" onClick={() => actions.deleteCohort(c.id)}>
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
            <p className="text-sm text-muted-foreground">
              Define experiment timepoints. When you add an animal, you can auto-schedule all experiments.
            </p>
            <Button onClick={() => setShowAddTP(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Timepoint</Button>
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
                            <Badge key={e} variant="secondary" className="text-xs">{EXPERIMENT_LABELS[e] || e}</Badge>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-3">
                          <span>Handle {tp.handling_days_before}d before</span>
                          <span>Window: {tp.duration_days}d</span>
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
                        <Button variant="ghost" size="sm" onClick={() => actions.deleteColonyTimepoint(tp.id)}>
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
                        <Button variant="ghost" size="sm" onClick={() => actions.deleteBreederCage(c.id)}>
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
                        <Button variant="ghost" size="sm" onClick={() => actions.deleteAdvisorAccess(p.id)}>
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
                <Input name="handling_days_before" type="number" defaultValue={editingTP?.handling_days_before ?? 3} />
              </div>
              <div>
                <Label className="text-xs">Experiment Window (days)</Label>
                <Input name="duration_days" type="number" defaultValue={editingTP?.duration_days ?? 21} />
              </div>
              <div>
                <Label className="text-xs">Sort Order</Label>
                <Input name="sort_order" type="number" defaultValue={editingTP?.sort_order ?? 0} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Experiments</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {EXPERIMENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      name="experiments"
                      value={t}
                      defaultChecked={editingTP?.experiments.includes(t)}
                      className="h-3.5 w-3.5"
                    />
                    {EXPERIMENT_LABELS[t]}
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
              onSchedule={() => handleScheduleAll(selectedAnimal)}
              onUpdateStatus={handleUpdateExpStatus}
              onSaveResultUrl={handleSaveResultUrl}
              onDelete={() => { actions.deleteAnimal(selectedAnimal.id); setSelectedAnimal(null); }}
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
  onSchedule: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onSaveResultUrl: (id: string, url: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const age = daysOld(animal.birth_date);
  const [resultUrls, setResultUrls] = useState<Record<string, string>>({});

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
                    <div key={exp.id} className="flex items-center gap-2 text-sm rounded-md border p-2">
                      <Badge className={`${STATUS_COLORS[exp.status]} text-xs`} variant="secondary">
                        {exp.status}
                      </Badge>
                      <span className="font-medium flex-1 min-w-0 truncate">
                        {EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}
                      </span>
                      {exp.scheduled_date && (
                        <span className="text-xs text-muted-foreground">
                          {exp.scheduled_date}
                          {dLeft !== null && dLeft > 0 && ` (${dLeft}d)`}
                          {dLeft !== null && dLeft <= 0 && dLeft >= -1 && " (TODAY!)"}
                        </span>
                      )}

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

                      {/* Results link */}
                      {exp.status === "completed" && !exp.results_drive_url && (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-6 text-xs w-40"
                            placeholder="Google Drive link"
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
                        <a href={exp.results_drive_url} target="_blank" rel="noopener noreferrer" className="text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
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

