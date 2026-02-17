import { createClient } from "@/lib/supabase/server";
import { SearchBar } from "@/components/search-bar";
import { WatchlistCard } from "@/components/watchlist-card";
import { WatchlistForm } from "@/components/watchlist-form";
import { DigestToggle } from "@/components/digest-toggle";
import { createWatchlist, updateWatchlist, deleteWatchlist, updateDigestPreference } from "./actions";
import type { Watchlist, Profile } from "@/types";
import { BookOpen, Sparkles, Activity } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: watchlists }, { data: profileData }] = await Promise.all([
    supabase
      .from("watchlists")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user!.id)
      .single(),
  ]);

  const typedWatchlists = (watchlists ?? []) as Watchlist[];
  const profile = profileData as Profile | null;
  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Researcher";

  // Get time of day for greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      {/* ─── Hero / Greeting ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.06] via-primary/[0.03] to-transparent border border-primary/10 px-8 py-8">
        <div className="relative z-10">
          <p className="text-sm font-medium text-primary/70 mb-1">{greeting},</p>
          <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
          <p className="text-muted-foreground mt-1 max-w-lg">
            Search the literature, track your watchlists, and let AI keep you up to date.
          </p>
        </div>
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/[0.04]" />
        <div className="absolute -bottom-8 -right-4 h-24 w-24 rounded-full bg-primary/[0.06]" />
      </div>

      {/* ─── Search ──────────────────────────────────────────────── */}
      <SearchBar />

      {/* ─── Quick Stats Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-semibold">{typedWatchlists.length}</div>
            <div className="text-xs text-muted-foreground">Watchlists</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-semibold">{typedWatchlists.reduce((sum, w) => sum + w.keywords.length, 0)}</div>
            <div className="text-xs text-muted-foreground">Keywords</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-semibold">AI</div>
            <div className="text-xs text-muted-foreground">Summaries</div>
          </div>
        </div>
      </div>

      <DigestToggle
        enabled={profile?.digest_enabled ?? true}
        updateAction={updateDigestPreference}
      />

      {/* ─── Watchlists ──────────────────────────────────────────── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Your Watchlists</h2>
          <WatchlistForm action={createWatchlist} />
        </div>

        {typedWatchlists.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/[0.02] p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <p className="font-medium">No watchlists yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create one to start tracking keywords across PubMed.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {typedWatchlists.map((watchlist) => (
              <WatchlistCard
                key={watchlist.id}
                watchlist={watchlist}
                updateAction={updateWatchlist}
                deleteAction={deleteWatchlist}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
