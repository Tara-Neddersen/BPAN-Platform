import { createClient } from "@/lib/supabase/server";
import { SearchBar } from "@/components/search-bar";
import { WatchlistCard } from "@/components/watchlist-card";
import { WatchlistForm } from "@/components/watchlist-form";
import { DigestToggle } from "@/components/digest-toggle";
import { createWatchlist, updateWatchlist, deleteWatchlist, updateDigestPreference } from "./actions";
import type { Watchlist, Profile } from "@/types";

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Literature Dashboard</h1>
        <p className="text-muted-foreground">
          Search PubMed or use your keyword watchlists to find papers.
        </p>
      </div>

      <SearchBar />

      <DigestToggle
        enabled={profile?.digest_enabled ?? true}
        updateAction={updateDigestPreference}
      />

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Watchlists</h2>
          <WatchlistForm action={createWatchlist} />
        </div>

        {typedWatchlists.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No watchlists yet. Create one to start tracking keywords.
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
