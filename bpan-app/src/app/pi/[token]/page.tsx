"use client";

import { useState, useEffect, use, useMemo } from "react";
import {
  Loader2, AlertCircle, Mouse, Calendar, Check, Clock,
  FlaskConical, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y Maze", ldb: "Light-Dark Box",
  marble: "Marble Burying", nesting: "Nesting", rotarod: "Rotarod",
  catwalk: "CatWalk", blood_draw: "Blood Draw",
  eeg_implant: "EEG Implant", eeg_recording: "EEG Recording",
};

const GENOTYPE_LABELS: Record<string, string> = {
  hemi: "Hemi", wt: "WT", het: "Het",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  skipped: "bg-red-100 text-red-700",
};

interface PortalData {
  advisor_name: string;
  can_see: string[];
  animals: Array<{
    identifier: string; sex: string; genotype: string;
    birth_date: string; status: string; cohort_name: string;
    ear_tag: string | null; cage_number: string | null;
    eeg_implanted: boolean;
  }>;
  experiments: Array<{
    animal_identifier: string; experiment_type: string;
    timepoint_age_days: number | null; scheduled_date: string | null;
    completed_date: string | null; status: string;
    results_drive_url: string | null;
  }>;
  stats: {
    total_animals: number; active_animals: number;
    pending_experiments: number; completed_experiments: number;
  };
}

export default function PIPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pi/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Access denied or expired");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h1 className="text-xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground">This link is invalid or has been revoked.</p>
    </div>
  );

  const upcoming = data.experiments
    .filter((e) => e.status === "scheduled" && e.scheduled_date)
    .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
    .slice(0, 15);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <Badge variant="secondary" className="mb-2">PI Portal — Live View</Badge>
        <h1 className="text-2xl font-bold">Colony Overview</h1>
        <p className="text-muted-foreground text-sm">Read-only view for {data.advisor_name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.active_animals}</div>
          <p className="text-xs text-muted-foreground">Active Animals</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.total_animals}</div>
          <p className="text-xs text-muted-foreground">Total Animals</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.pending_experiments}</div>
          <p className="text-xs text-muted-foreground">Pending</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.stats.completed_experiments}</div>
          <p className="text-xs text-muted-foreground">Completed</p>
        </CardContent></Card>
      </div>

      {/* Upcoming */}
      {data.can_see.includes("timeline") && upcoming.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Upcoming Experiments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pb-3">
            {upcoming.map((exp, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{exp.animal_identifier}</span>
                  <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                  {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{exp.scheduled_date}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Animals */}
      {data.can_see.includes("animals") && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mouse className="h-4 w-4" /> Animals ({data.animals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            {data.animals.map((a, i) => {
              const age = Math.floor((Date.now() - new Date(a.birth_date).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-1.5 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.identifier}</span>
                    <Badge variant="outline" className="text-xs">{a.cohort_name}</Badge>
                    <Badge variant="secondary" className="text-xs">{GENOTYPE_LABELS[a.genotype]} {a.sex === "male" ? "♂" : "♀"}</Badge>
                    {a.eeg_implanted && <Badge className="bg-purple-100 text-purple-700 text-xs" variant="secondary">EEG</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{age}d old</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Experiment Progress */}
      {data.can_see.includes("experiments") && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> All Experiments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-3">
            {data.experiments.slice(0, 50).map((exp, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge className={`${STATUS_COLORS[exp.status]} text-xs`} variant="secondary">
                  {exp.status}
                </Badge>
                <span className="font-medium">{exp.animal_identifier}</span>
                <span className="text-muted-foreground">{EXPERIMENT_LABELS[exp.experiment_type] || exp.experiment_type}</span>
                {exp.timepoint_age_days && <Badge variant="outline" className="text-xs">{exp.timepoint_age_days}d</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">{exp.scheduled_date || exp.completed_date || ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-muted-foreground py-4">
        Powered by BPAN Research Platform
      </div>
    </div>
  );
}

