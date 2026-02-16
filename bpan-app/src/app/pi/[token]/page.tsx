"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import {
  Loader2, AlertCircle, Mouse, Calendar, Check, Clock,
  FlaskConical, BarChart3, ChevronLeft, ChevronRight, ImageIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const EXPERIMENT_LABELS: Record<string, string> = {
  handling: "Handling", y_maze: "Y-Maze", ldb: "Light-Dark Box",
  marble: "Marble Burying", nesting: "Nesting", rotarod: "Rotarod",
  rotarod_hab: "Rotarod Hab", stamina: "Stamina Test",
  catwalk: "CatWalk", blood_draw: "Plasma Collection",
  data_collection: "Data Collection", core_acclimation: "Core Acclimation",
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

interface PortalPhoto {
  image_url: string;
  caption: string | null;
  experiment_type: string | null;
  taken_date: string | null;
}

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
  photos: PortalPhoto[];
  stats: {
    total_animals: number; active_animals: number;
    pending_experiments: number; completed_experiments: number;
  };
}

/** Convert Google Drive share links to direct image URLs */
function convertDriveUrl(url: string): string {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  const match2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (match2) return `https://lh3.googleusercontent.com/d/${match2[1]}`;
  return url;
}

// ─── Photo Gallery Slideshow ────────────────────────────────────────────

function PhotoGallery({ photos }: { photos: PortalPhoto[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [fade, setFade] = useState(true);

  const next = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev + 1) % photos.length);
      setFade(true);
    }, 300);
  }, [photos.length]);

  const prev = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev - 1 + photos.length) % photos.length);
      setFade(true);
    }, 300);
  }, [photos.length]);

  // Auto-rotate every 5 seconds
  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, [photos.length, next]);

  if (photos.length === 0) return null;

  const photo = photos[currentIdx];
  const displayUrl = convertDriveUrl(photo.image_url);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Lab Gallery
          <Badge variant="outline" className="text-xs ml-auto">{currentIdx + 1} / {photos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <div className="relative">
        <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={photo.caption || "Lab photo"}
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`}
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Navigation arrows */}
        {photos.length > 1 && (
          <>
            <Button
              variant="ghost" size="sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-8 w-8 p-0 rounded-full"
              onClick={prev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white h-8 w-8 p-0 rounded-full"
              onClick={next}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Caption overlay */}
        {(photo.caption || photo.experiment_type) && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8">
            <p className="text-white text-sm font-medium">{photo.caption || ""}</p>
            <div className="flex items-center gap-2 mt-1">
              {photo.experiment_type && (
                <Badge className="bg-white/20 text-white border-0 text-xs" variant="secondary">
                  {EXPERIMENT_LABELS[photo.experiment_type] || photo.experiment_type}
                </Badge>
              )}
              {photo.taken_date && (
                <span className="text-white/70 text-xs">{photo.taken_date}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dot indicators */}
      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {photos.map((_, idx) => (
            <button
              key={idx}
              className={`h-1.5 rounded-full transition-all ${idx === currentIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              onClick={() => {
                setFade(false);
                setTimeout(() => { setCurrentIdx(idx); setFade(true); }, 300);
              }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Main Portal Page ───────────────────────────────────────────────────

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

      {/* Photo Gallery Slideshow */}
      {data.photos && data.photos.length > 0 && (
        <PhotoGallery photos={data.photos} />
      )}

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
